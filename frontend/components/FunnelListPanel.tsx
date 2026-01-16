import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import { Funnel } from '@/types/funnel';

export default function FunnelListPanel() {
  const router = useRouter();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFunnels();
  }, []);

  const loadFunnels = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getFunnels();
      setFunnels(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load funnels');
    } finally {
      setLoading(false);
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
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-gray-600">Loading funnels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error}</p>
          <button
            onClick={loadFunnels}
            className="mt-2 text-red-600 hover:text-red-800 underline"
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
        <h2 className="text-2xl font-bold text-gray-900">Funnels</h2>
        <button
          onClick={handleCreateFunnel}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          + New Funnel
        </button>
      </div>

      {funnels.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 mb-4">No funnels yet</p>
          <button
            onClick={handleCreateFunnel}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Create Your First Funnel
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {funnels.map((funnel) => (
            <div
              key={funnel.id}
              onClick={() => handleFunnelClick(funnel.id)}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition-shadow"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{funnel.name}</h3>
              {funnel.domain && (
                <p className="text-sm text-gray-600 mb-2">Domain: {funnel.domain}</p>
              )}
              {funnel.steps && funnel.steps.length > 0 && (
                <p className="text-sm text-gray-600 mb-2">
                  {funnel.steps.length} step{funnel.steps.length !== 1 ? 's' : ''}
                </p>
              )}
              <p className="text-xs text-gray-500">
                Created: {new Date(funnel.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

