import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import { Funnel } from '@/types/funnel';
import ShinyButton from './ui/ShinyButton';
import { useLoading } from '@/contexts/LoadingContext';

export default function FunnelListPanel() {
  const router = useRouter();
  const { setLoading: setGlobalLoading } = useLoading();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFunnels();
  }, []);

  const loadFunnels = async () => {
    setGlobalLoading(true, 'Loading funnels...');
    try {
      setLoading(true);
      const data = await apiClient.getFunnels();
      setFunnels(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load funnels');
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const handleCreateFunnel = () => {
    router.push('/funnels/new');
  };

  const handleFunnelClick = (funnelId: string) => {
    router.push(`/funnels/${funnelId}`);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading funnels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="glass-card p-4 border-red-400/40">
          <p className="text-red-800 dark:text-red-200">Error: {error}</p>
          <button
            onClick={loadFunnels}
            className="mt-2 text-red-600 dark:text-red-300 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Funnels</h2>
        <ShinyButton onClick={handleCreateFunnel}>
          + New Funnel
        </ShinyButton>
      </div>

      {funnels.length === 0 ? (
        <div className="text-center py-12 glass-card">
          <p className="text-gray-600 dark:text-gray-300 mb-4">No funnels yet</p>
          <ShinyButton onClick={handleCreateFunnel}>
            Create Your First Funnel
          </ShinyButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {funnels.map((funnel) => (
            <div
              key={funnel.id}
              onClick={() => handleFunnelClick(funnel.id)}
              className="glass-card neon-glow p-4 hover:shadow-lg cursor-pointer transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{funnel.name}</h3>
              {funnel.domain && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Domain: {funnel.domain}</p>
              )}
              {funnel.steps && funnel.steps.length > 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  {funnel.steps.length} step{funnel.steps.length !== 1 ? 's' : ''}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 digitized-text">
                Created: {new Date(funnel.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

