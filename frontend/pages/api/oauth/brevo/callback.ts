import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Next.js API route handler for Brevo OAuth callback
 * 
 * This route proxies the OAuth callback to the backend API.
 * Brevo redirects to: http://localhost:3002/api/oauth/brevo/callback
 * This handler forwards the request to: http://localhost:8000/oauth/brevo/callback
 * 
 * The backend then processes the OAuth callback and redirects to the frontend dashboard.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow GET requests (OAuth callbacks are GET requests)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the backend API URL
  const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
  
  // Forward all query parameters to the backend
  const queryParams = new URLSearchParams(req.query as Record<string, string>).toString();
  const backendCallbackUrl = `${backendUrl}/oauth/brevo/callback${queryParams ? `?${queryParams}` : ''}`;

  try {
    console.log('[BREVO CALLBACK] Proxying to backend:', backendCallbackUrl);
    
    // Fetch from backend - the backend will return a redirect response (302)
    const response = await fetch(backendCallbackUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html, application/json',
      },
      redirect: 'manual', // Don't follow redirects automatically - we'll handle it
    });

    console.log('[BREVO CALLBACK] Backend response status:', response.status);
    console.log('[BREVO CALLBACK] Backend response headers:', Object.fromEntries(response.headers.entries()));

    // The backend OAuth callback always returns a redirect (302) to the frontend
    // Extract the Location header and forward it to the client
    if (response.status === 302 || response.status === 301 || response.status === 303) {
      const location = response.headers.get('location');
      if (location) {
        console.log('[BREVO CALLBACK] Redirecting to:', location);
        // Forward the redirect to the client browser
        return res.redirect(response.status, location);
      } else {
        console.error('[BREVO CALLBACK] No location header in redirect response');
      }
    }

    // If somehow it's not a redirect, try to get error details
    const data = await response.text();
    console.error('[BREVO CALLBACK] Unexpected response status:', response.status);
    console.error('[BREVO CALLBACK] Response body:', data);
    
    // Redirect to frontend with error
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3002';
    return res.redirect(
      302,
      `${frontendUrl}/?brevo_error=unexpected_response&error_description=${encodeURIComponent(`Backend returned status ${response.status}`)}&tab=brevo`
    );
  } catch (error: any) {
    console.error('[BREVO CALLBACK] Error proxying Brevo OAuth callback:', error);
    
    // Redirect to frontend with error
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3002';
    return res.redirect(
      302,
      `${frontendUrl}/?brevo_error=proxy_error&error_description=${encodeURIComponent(error.message || 'Failed to process OAuth callback')}&tab=brevo`
    );
  }
}

