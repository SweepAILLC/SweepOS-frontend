import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Proxies Discord's OAuth redirect to the backend, which does the token
 * exchange and stores the connection, then forwards the backend's redirect
 * back to the browser. Same shape as the Brevo callback proxy.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Server-side fetch inside this container: NEXT_PUBLIC_API_BASE_URL is the
  // browser-facing URL (localhost:8000, reachable via the published port) and
  // would resolve to this frontend container itself when fetched from here.
  // INTERNAL_API_BASE_URL points at the backend over the docker network instead.
  const backendUrl =
    process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
  const queryParams = new URLSearchParams(req.query as Record<string, string>).toString();
  const backendCallbackUrl = `${backendUrl}/oauth/discord/callback${queryParams ? `?${queryParams}` : ''}`;

  try {
    const response = await fetch(backendCallbackUrl, {
      method: 'GET',
      headers: { Accept: 'text/html, application/json' },
      redirect: 'manual',
    });

    if (response.status === 302 || response.status === 301 || response.status === 303) {
      const location = response.headers.get('location');
      if (location) {
        return res.redirect(response.status, location);
      }
    }

    const data = await response.text();
    console.error('[DISCORD CALLBACK] Unexpected response status:', response.status, data);
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3003';
    return res.redirect(
      302,
      `${frontendUrl}/?discord_error=unexpected_response&tab=settings&section=integrations`
    );
  } catch (error: any) {
    console.error('[DISCORD CALLBACK] Error proxying Discord OAuth callback:', error);
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3003';
    return res.redirect(
      302,
      `${frontendUrl}/?discord_error=proxy_error&tab=settings&section=integrations`
    );
  }
}
