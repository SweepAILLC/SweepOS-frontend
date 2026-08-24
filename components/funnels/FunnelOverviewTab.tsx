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
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Funnel ID</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Copy this ID to use in your funnel tracking code:
        </p>
        <div className="flex items-center space-x-2">
          <code className="flex-1 bg-white/10 px-4 py-2 rounded text-sm font-mono">
            {funnel.id}
          </code>
          <button
            onClick={copyFunnelId}
            className="glass-button neon-glow px-4 py-2 rounded"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Steps</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {funnel.steps?.length || 0}
          </p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Domain</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {funnel.domain || 'Not set'}
          </p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Created</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {new Date(funnel.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Steps Preview */}
      {funnel.steps && funnel.steps.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Funnel Steps</h3>
          <div className="space-y-2">
            {funnel.steps.map((step, index) => (
              <div key={step.id} className="flex items-center space-x-4 p-3 glass-panel rounded">
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 w-8 digitized-text">
                  {step.step_order}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {step.label || step.event_name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-100">{step.event_name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

