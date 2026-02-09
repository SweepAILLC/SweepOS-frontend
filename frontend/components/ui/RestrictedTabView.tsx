interface RestrictedTabViewProps {
  tabName: string;
}

export default function RestrictedTabView({ tabName }: RestrictedTabViewProps) {
  const tabDisplayNames: Record<string, string> = {
    brevo: 'Brevo',
    terminal: 'Terminal',
    clients: 'Clients',
    stripe: 'Stripe',
    funnels: 'Funnels',
    users: 'Users'
  };

  const displayName = tabDisplayNames[tabName] || tabName;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full glass-panel">
            <svg
              className="h-12 w-12 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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
            {displayName} Access Restricted
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 digitized-text">
            This feature requires additional permissions.
          </p>
        </div>
        <div className="glass-card neon-glow p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            To access the <strong>{displayName}</strong> dashboard, please contact the Sweep OS team to request access.
          </p>
          <div className="mt-6">
            <a
              href="mailto:support@sweepos.com?subject=Feature Access Request"
              className="w-full flex justify-center py-2 px-4 rounded-md text-sm font-medium glass-button neon-glow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
            >
              Contact Sweep OS Team
            </a>
          </div>
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 digitized-text">
            Or reach out to your organization administrator to request access.
          </p>
        </div>
      </div>
    </div>
  );
}

