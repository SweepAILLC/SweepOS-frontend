import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import UserSettingsModal from './UserSettingsModal';

interface NavbarProps {
  activeTab: 'brevo' | 'terminal' | 'stripe' | 'funnels' | 'users' | 'owner' | 'calcom';
  onTabChange: (tab: 'brevo' | 'terminal' | 'stripe' | 'funnels' | 'users' | 'owner' | 'calcom') => void;
  isOwner?: boolean;
  tabPermissions?: Record<string, boolean>;
  userRole?: string; // 'owner' | 'admin' | 'member'
}

export default function Navbar({ activeTab, onTabChange, isOwner = false, tabPermissions = {}, userRole = 'member' }: NavbarProps) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  // Helper to check if tab should be shown
  const shouldShowTab = (tab: string): boolean => {
    // Owner tab only for owners
    if (tab === 'owner') {
      return isOwner;
    }
    // Users tab: not accessible to members (check role directly)
    if (tab === 'users') {
      const roleLower = String(userRole || 'member').toLowerCase().trim();
      // Explicitly hide for members - return false immediately
      if (roleLower === 'member') {
        return false;
      }
      // Only show if user is explicitly admin or owner
      if (roleLower === 'admin' || roleLower === 'owner') {
        return tabPermissions[tab] !== false;
      }
      // Default to false for any other role
      return false;
    }
    // Other tabs: show if permission is not explicitly false
    return tabPermissions[tab] !== false;
  };
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);

  const handleLogout = () => {
    Cookies.remove('access_token');
    router.push('/login');
  };

  const handleSettingsClick = () => {
    setShowSettings(true);
  };

  return (
    <nav className="glass-panel fixed top-0 left-0 right-0 z-[50] w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center gap-3">
              {mounted && (
                <div className="relative w-8 h-8 flex-shrink-0">
                  <img
                    src="/SWEEP_favicon.png"
                    alt="Sweep"
                    width={32}
                    height={32}
                    className="object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sweep Coach OS</h1>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {shouldShowTab('brevo') && (
                <button
                  onClick={() => onTabChange('brevo')}
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors ${
                    activeTab === 'brevo'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  style={activeTab === 'brevo' ? {
                    textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)'
                  } : {}}
                >
                  Brevo
                </button>
              )}
              {shouldShowTab('terminal') && (
                <button
                  onClick={() => onTabChange('terminal')}
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors ${
                    activeTab === 'terminal'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  style={activeTab === 'terminal' ? {
                    textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)'
                  } : {}}
                >
                  Terminal
                </button>
              )}
              {shouldShowTab('stripe') && (
                <button
                  onClick={() => onTabChange('stripe')}
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors ${
                    activeTab === 'stripe'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  style={activeTab === 'stripe' ? {
                    textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)'
                  } : {}}
                >
                  Stripe
                </button>
              )}
              {shouldShowTab('calcom') && (
                <button
                  onClick={() => onTabChange('calcom')}
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors ${
                    activeTab === 'calcom'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  style={activeTab === 'calcom' ? {
                    textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)'
                  } : {}}
                >
                  Calendar
                </button>
              )}
              {shouldShowTab('funnels') && (
                <button
                  onClick={() => onTabChange('funnels')}
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors ${
                    activeTab === 'funnels'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  style={activeTab === 'funnels' ? {
                    textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)'
                  } : {}}
                >
                  Funnels
                </button>
              )}
              {shouldShowTab('users') && (
                <button
                  onClick={() => onTabChange('users')}
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors ${
                    activeTab === 'users'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  style={activeTab === 'users' ? {
                    textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)'
                  } : {}}
                >
                  Users
                </button>
              )}
              {shouldShowTab('owner') && (
                <button
                  onClick={() => onTabChange('owner')}
                  className={`inline-flex items-center px-1 pt-1 text-sm font-medium transition-colors ${
                    activeTab === 'owner'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  style={activeTab === 'owner' ? {
                    textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)'
                  } : {}}
                >
                  Owner
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleSettingsClick}
              className="glass-button-secondary px-3 py-2 rounded-md text-sm font-medium flex items-center"
              aria-label="Open settings"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
            <button
              onClick={handleLogout}
              className="glass-button-secondary px-3 py-2 rounded-md text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      <UserSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </nav>
  );
}

