import { useState } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import UserSettingsModal from './UserSettingsModal';

interface NavbarProps {
  activeTab: 'brevo' | 'clients' | 'stripe' | 'funnels' | 'users' | 'admin';
  onTabChange: (tab: 'brevo' | 'clients' | 'stripe' | 'funnels' | 'users' | 'admin') => void;
  isAdmin?: boolean;
  tabPermissions?: Record<string, boolean>;
}

export default function Navbar({ activeTab, onTabChange, isAdmin = false, tabPermissions = {} }: NavbarProps) {
  // Helper to check if tab should be shown
  const shouldShowTab = (tab: string): boolean => {
    // Admin tab only for main org admins
    if (tab === 'admin') {
      return isAdmin;
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
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Sweep Coach OS</h1>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {shouldShowTab('brevo') && (
                <button
                  onClick={() => onTabChange('brevo')}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    activeTab === 'brevo'
                      ? 'border-primary-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Brevo
                </button>
              )}
              {shouldShowTab('clients') && (
                <button
                  onClick={() => onTabChange('clients')}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    activeTab === 'clients'
                      ? 'border-primary-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Clients
                </button>
              )}
              {shouldShowTab('stripe') && (
                <button
                  onClick={() => onTabChange('stripe')}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    activeTab === 'stripe'
                      ? 'border-primary-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Stripe
                </button>
              )}
              {shouldShowTab('funnels') && (
                <button
                  onClick={() => onTabChange('funnels')}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    activeTab === 'funnels'
                      ? 'border-primary-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Funnels
                </button>
              )}
              {shouldShowTab('users') && (
                <button
                  onClick={() => onTabChange('users')}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    activeTab === 'users'
                      ? 'border-primary-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Users
                </button>
              )}
              {shouldShowTab('admin') && (
                <button
                  onClick={() => onTabChange('admin')}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    activeTab === 'admin'
                      ? 'border-primary-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Admin
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleSettingsClick}
              className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium flex items-center"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
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

