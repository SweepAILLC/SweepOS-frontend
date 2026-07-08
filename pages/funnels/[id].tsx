import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Legacy route: `/funnels/[id]` redirects to the dashboard so the shell (navbar, layout) stays stable.
 */
export default function FunnelDetailRedirectPage() {
  const router = useRouter();
  const { id } = router.query;

  useEffect(() => {
    if (!router.isReady || !id || typeof id !== 'string') return;
    router.replace({ pathname: '/', query: { tab: 'funnels', funnelId: id } });
  }, [router.isReady, id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <p className="text-gray-500 dark:text-gray-400">Opening funnel…</p>
    </div>
  );
}
