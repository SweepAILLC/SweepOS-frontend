import { useState } from 'react';
import { FunnelWithSteps } from '@/types/funnel';

interface FunnelOverviewTabProps {
  funnel: FunnelWithSteps;
  onReload: () => void;
}

export default function FunnelOverviewTab({ funnel, onReload }: FunnelOverviewTabProps) {
  const [copied, setCopied] = useState(false);

  const copyFunnelId = () => {
    navigator.clipboard.writeText(funnel.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Funnel ID Copy Widget */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Funnel ID</h3>
        <p className="text-sm text-gray-600 mb-2">
          Copy this ID to use in your funnel tracking code:
        </p>
        <div className="flex items-center space-x-2">
          <code className="flex-1 bg-gray-100 px-4 py-2 rounded text-sm font-mono">
            {funnel.id}
          </code>
          <button
            onClick={copyFunnelId}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Steps</p>
          <p className="text-2xl font-bold text-gray-900">
            {funnel.steps?.length || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Domain</p>
          <p className="text-lg font-semibold text-gray-900">
            {funnel.domain || 'Not set'}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Created</p>
          <p className="text-lg font-semibold text-gray-900">
            {new Date(funnel.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Steps Preview */}
      {funnel.steps && funnel.steps.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Funnel Steps</h3>
          <div className="space-y-2">
            {funnel.steps.map((step, index) => (
              <div key={step.id} className="flex items-center space-x-4 p-3 bg-gray-50 rounded">
                <span className="text-sm font-semibold text-gray-600 w-8">
                  {step.step_order}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {step.label || step.event_name}
                  </p>
                  <p className="text-sm text-gray-500">{step.event_name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

