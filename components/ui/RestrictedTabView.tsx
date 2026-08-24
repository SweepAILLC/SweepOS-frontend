import { TAB_DISPLAY_NAMES } from '@/lib/tabs';

interface RestrictedTabViewProps {
  tabName: string;
}

export default function RestrictedTabView({ tabName }: RestrictedTabViewProps) {
  const displayName = TAB_DISPLAY_NAMES[tabName] || tabName;

  return (
    <div className="min-h-[calc(100vh-1.5rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full glass-panel">
            <svg
              className="h-12 w-12 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            {displayName} is locked
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 digitized-text">
            This feature isn&apos;t included in your current tier.
          </p>
        </div>
        <div className="glass-card neon-glow p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            To unlock <strong>{displayName}</strong>, speak with your assigned consultant about
            upgrading your consulting tier.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            They can enable this tab for your organization once you&apos;re on the right plan.
          </p>
        </div>
      </div>
    </div>
  );
}
