import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { StripeSummary, RevenueTimeline, ChurnData, MRRTrend, Payment, FailedPayment } from '@/types/integration';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function StripeDashboardPanel() {
  const [summary, setSummary] = useState<StripeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revenueTimeline, setRevenueTimeline] = useState<RevenueTimeline | null>(null);
  const [churnData, setChurnData] = useState<ChurnData | null>(null);
  const [mrrTrend, setMrrTrend] = useState<MRRTrend | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [failedPayments, setFailedPayments] = useState<FailedPayment[]>([]);
  const [timeRange, setTimeRange] = useState<number | 'all'>(30);
  const [showManualOAuth, setShowManualOAuth] = useState(false);
  const [manualOAuthCode, setManualOAuthCode] = useState('');
  const [completingManual, setCompletingManual] = useState(false);
  const [showDirectApiKey, setShowDirectApiKey] = useState(false);
  const [directApiKey, setDirectApiKey] = useState('');
  const [connectingDirect, setConnectingDirect] = useState(false);

  useEffect(() => {
    console.log('🎯 StripeDashboardPanel mounted, checking connection...');
    checkConnectionAndLoad();
  }, [timeRange]);

  const checkConnectionAndLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      // First check if Stripe is connected
      const status = await apiClient.getStripeStatus();
      setIsConnected(status.connected);
      
      if (status.connected) {
        // If connected, load all data
        await loadAllData();
      } else {
        // If not connected, just set loading to false
        setLoading(false);
      }
    } catch (error: any) {
      console.error('Failed to check Stripe status:', error);
      setIsConnected(false);
      setLoading(false);
    }
  };

  const loadAllData = async () => {
    setError(null);
    setLoading(true);
    try {
      // Load summary - use 365 days for "all time" to show comprehensive data
      const summaryRange = timeRange === 'all' ? 365 : timeRange;
      const summaryData = await apiClient.getStripeSummary(summaryRange);
      setSummary(summaryData);
      setIsConnected(true);

      // Load charts data
      // Use timeRange for filtering, or undefined for "all time"
      const rangeParam = timeRange === 'all' ? undefined : timeRange;
      const [revenue, churn, mrr, paymentsData, failedData] = await Promise.all([
        apiClient.getStripeRevenueTimeline(timeRange === 'all' ? 365 : timeRange, 'day'),
        apiClient.getStripeChurn(6),
        apiClient.getStripeMRRTrend(timeRange === 'all' ? 365 : timeRange, 'day'),
        apiClient.getStripePayments(undefined, rangeParam, 1, 20),
        apiClient.getStripeFailedPayments(1, 20),
      ]);

      setRevenueTimeline(revenue);
      setChurnData(churn);
      setMrrTrend(mrr);
      setPayments(paymentsData);
      setFailedPayments(failedData);
    } catch (error: any) {
      console.error('❌ Failed to load Stripe data:', error);
      if (error?.response?.status === 404) {
        setIsConnected(false);
        setSummary(null);
        try {
          const status = await apiClient.getStripeStatus();
          setIsConnected(status.connected);
        } catch {
          setIsConnected(false);
        }
      } else if (error?.response?.status === 401) {
        setError('Please log in to view Stripe data');
        setIsConnected(false);
      } else {
        setError(error?.response?.data?.detail || error?.message || 'Failed to load Stripe data');
        setIsConnected(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const response = await apiClient.startStripeOAuth();
      // Open OAuth URL in new tab
      // Use a unique window name to prevent browser from reusing the same window
      const windowName = `stripe_oauth_${Date.now()}`;
      window.open(response.redirect_url, windowName);
      // Poll for connection status after opening
      setConnecting(false);
      
      // Poll for connection every 2 seconds for up to 60 seconds
      let attempts = 0;
      const maxAttempts = 30;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const status = await apiClient.getStripeStatus();
          if (status.connected) {
            clearInterval(pollInterval);
            setIsConnected(true);
            await loadAllData();
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
          }
        } catch (error) {
          // Ignore errors during polling
        }
      }, 2000);
    } catch (error: any) {
      console.error('Failed to start Stripe OAuth:', error);
      setError(error?.response?.data?.detail || 'Failed to start Stripe connection.');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Stripe? You will need to reconnect to view data.')) {
      return;
    }
    
    try {
      await apiClient.disconnectStripe();
      setIsConnected(false);
      setSummary(null);
      setRevenueTimeline(null);
      setChurnData(null);
      setMrrTrend(null);
      setPayments([]);
      setFailedPayments([]);
    } catch (error: any) {
      console.error('Failed to disconnect Stripe:', error);
      setError(error?.response?.data?.detail || 'Failed to disconnect Stripe.');
    }
  };

  const handleVerifyConnection = async () => {
    try {
      const verification = await apiClient.verifyStripeConnection();
      alert(`Connection Status:\n\nConnected: ${verification.connected}\nAccount ID: ${verification.account_id || 'N/A'}\nOrg ID: ${verification.org_id}\nExpires: ${verification.expires_at || 'Never'}`);
    } catch (error: any) {
      console.error('Failed to verify connection:', error);
      setError(error?.response?.data?.detail || 'Failed to verify connection.');
    }
  };

  const handleCompleteManualOAuth = async () => {
    if (!manualOAuthCode.trim()) {
      setError('Please enter the authorization code from the Stripe OAuth URL');
      return;
    }

    setCompletingManual(true);
    setError(null);
    try {
      // Get current user to get org_id
      const userInfo = await apiClient.getCurrentUser();
      const result = await apiClient.completeStripeOAuthManual(manualOAuthCode.trim(), userInfo.org_id);
      
      if (result.success) {
        setShowManualOAuth(false);
        setManualOAuthCode('');
        setIsConnected(true);
        await loadAllData();
        alert('Stripe connected successfully!');
      }
    } catch (error: any) {
      console.error('Failed to complete manual OAuth:', error);
      setError(error?.response?.data?.detail || 'Failed to complete OAuth connection.');
    } finally {
      setCompletingManual(false);
    }
  };

  const handleConnectDirect = async () => {
    if (!directApiKey.trim()) {
      setError('Please enter your Stripe API key');
      return;
    }

    if (!directApiKey.trim().startsWith('sk_')) {
      setError('Invalid API key format. Must start with "sk_test_" or "sk_live_"');
      return;
    }

    setConnectingDirect(true);
    setError(null);
    try {
      const result = await apiClient.connectStripeDirect(directApiKey.trim());
      
      if (result.success) {
        setShowDirectApiKey(false);
        setDirectApiKey('');
        setIsConnected(true);
        await loadAllData();
        alert(`Stripe connected successfully using API key!\nAccount: ${result.account_id}\nMode: ${result.mode}`);
      }
    } catch (error: any) {
      console.error('Failed to connect with API key:', error);
      setError(error?.response?.data?.detail || 'Failed to connect with API key.');
    } finally {
      setConnectingDirect(false);
    }
  };

  const handleSyncStripe = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.syncStripeData(false); // Incremental sync
      const totalCustomers = (result.results?.customers_synced || 0) + (result.results?.customers_updated || 0);
      const totalSubs = (result.results?.subscriptions_synced || 0) + (result.results?.subscriptions_updated || 0);
      const totalPayments = (result.results?.payments_synced || 0) + (result.results?.payments_updated || 0);
      
      let message = `Sync complete!\n\n`;
      if (result.is_full_sync) {
        message += `(Full historical sync)\n\n`;
      } else {
        message += `(Incremental sync - only new/updated data)\n\n`;
      }
      
      if (totalCustomers === 0 && totalSubs === 0 && totalPayments === 0) {
        message += `No changes detected. All data is up-to-date.`;
      } else {
        message += `Customers: ${result.results?.customers_synced || 0} new, ${result.results?.customers_updated || 0} updated\n`;
        message += `Subscriptions: ${result.results?.subscriptions_synced || 0} new, ${result.results?.subscriptions_updated || 0} updated\n`;
        message += `Payments: ${result.results?.payments_synced || 0} new, ${result.results?.payments_updated || 0} updated`;
        
        if (result.diagnostic) {
          message += `\n\nFound ${result.diagnostic.customers_found_from_stripe || 0} customers and ${result.diagnostic.subscriptions_found_from_stripe || 0} subscriptions in Stripe.`;
        }
      }
      
      alert(message);
      // Dispatch event to refresh clients list
      window.dispatchEvent(new Event('stripe-connected'));
      // Also reload Stripe data
      await loadAllData();
    } catch (error: any) {
      console.error('Failed to sync Stripe data:', error);
      let errorMessage = error?.response?.data?.detail || error?.message || 'Failed to sync Stripe data.';
      
      // Check if it's a timeout error
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        errorMessage = 'Sync timed out. The operation is taking longer than expected. This may happen during full historical syncs with large amounts of data. Please try again or check backend logs.';
      }
      
      setError(errorMessage);
      alert(`Sync failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!confirm('This will recalculate all analytics from existing data. Continue?')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.reconcileStripeData();
      alert(`Reconciliation complete!\n\nClients reconciled: ${result.clients_reconciled || 0}\nRevenue recalculated: ${result.revenue_recalculated || 0}`);
      await loadAllData();
    } catch (error: any) {
      console.error('Failed to reconcile Stripe data:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to reconcile Stripe data.';
      setError(errorMessage);
      alert(`Reconciliation failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return '$0.00';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-gray-500">Loading Stripe data...</div>
      </div>
    );
  }

  if (!isConnected || !summary) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Stripe Financial Dashboard</h2>
          <div className="flex gap-2">
            <button
              onClick={handleSyncStripe}
              disabled={loading}
              className="text-sm text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-md disabled:opacity-50"
            >
              {loading ? 'Syncing...' : 'Sync'}
            </button>
            <button
              onClick={handleReconcile}
              disabled={loading}
              className="text-sm text-gray-600 hover:text-gray-700 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              title="Recalculate analytics from existing data"
            >
              Reconcile
            </button>
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        <p className="text-sm text-gray-600 mb-4">
          Connect Stripe to view financial data including MRR, ARR, subscriptions, and analytics.
        </p>
        <div className="space-y-3">
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Install Stripe'}
          </button>
          
          <div className="text-xs text-gray-500 border-t pt-3 mt-3 space-y-3">
            <p className="font-medium">Alternative Connection Methods:</p>
            
            <div className="space-y-3">
              <div>
                <p className="mb-1 font-semibold">Option 1: Direct API Key (Admin Only)</p>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2">
                  <p className="text-xs text-yellow-800 font-medium mb-1">⚠️ Security Warning</p>
                  <ul className="text-xs text-yellow-700 list-disc list-inside space-y-1">
                    <li>Direct API keys have <strong>full account access</strong> and cannot be revoked via Stripe</li>
                    <li>API keys are encrypted and stored securely, but use OAuth when possible</li>
                    <li>This method requires admin role and is rate-limited (3 attempts per 15 minutes)</li>
                    <li>All connections are logged for security audit</li>
                  </ul>
                </div>
                <p className="text-xs text-gray-400 mb-2">Use this if you can&apos;t install the Stripe app on the publisher account. Get your API key from Stripe Dashboard → Developers → API keys.</p>
                <button
                  onClick={() => {
                    setShowDirectApiKey(!showDirectApiKey);
                    setShowManualOAuth(false);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 underline"
                >
                  {showDirectApiKey ? 'Hide' : 'Show'} Direct API Key Connection
                </button>
                {showDirectApiKey && (
                  <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Stripe API Key (sk_test_... or sk_live_...)
                    </label>
                    <input
                      type="password"
                      value={directApiKey}
                      onChange={(e) => setDirectApiKey(e.target.value)}
                      placeholder="sk_test_xxxxxxxxxxxxx or sk_live_xxxxxxxxxxxxx"
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded mb-2"
                    />
                    <button
                      onClick={handleConnectDirect}
                      disabled={connectingDirect || !directApiKey.trim()}
                      className="w-full px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {connectingDirect ? 'Connecting...' : 'Connect with API Key'}
                    </button>
                  </div>
                )}
              </div>
              
              <div>
                <p className="mb-1 font-semibold">Option 2: Manual OAuth</p>
                <p className="text-xs text-gray-400 mb-2">After completing OAuth on Stripe, copy the authorization code from the URL (looks like <code className="bg-gray-100 px-1 rounded">code=ac_xxxxx</code>).</p>
                <button
                  onClick={() => {
                    setShowManualOAuth(!showManualOAuth);
                    setShowDirectApiKey(false);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 underline"
                >
                  {showManualOAuth ? 'Hide' : 'Show'} Manual OAuth Completion
                </button>
                {showManualOAuth && (
                  <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Authorization Code (from Stripe OAuth URL)
                    </label>
                    <input
                      type="text"
                      value={manualOAuthCode}
                      onChange={(e) => setManualOAuthCode(e.target.value)}
                      placeholder="ac_xxxxx"
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded mb-2"
                    />
                    <button
                      onClick={handleCompleteManualOAuth}
                      disabled={completingManual || !manualOAuthCode.trim()}
                      className="w-full px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {completingManual ? 'Completing...' : 'Complete Connection'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <button
            onClick={handleVerifyConnection}
            className="text-xs text-gray-600 hover:text-gray-700 underline"
          >
            Verify Connection Status
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Stripe Financial Dashboard</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDisconnect}
              className="text-sm text-red-600 hover:text-red-700 px-3 py-1 border border-red-300 rounded-md hover:bg-red-50"
              title="Disconnect Stripe to connect a different account"
            >
              Disconnect
            </button>
            <select
              value={timeRange}
              onChange={(e) => {
                const value = e.target.value;
                setTimeRange(value === 'all' ? 'all' : Number(value));
              }}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
              <option value="all">All Time</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleSyncStripe}
                disabled={loading}
                className="text-sm text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-md disabled:opacity-50"
                title="Incremental sync: Only fetches new/updated data since last sync"
              >
                {loading ? 'Syncing...' : 'Sync'}
              </button>
              <button
                onClick={handleReconcile}
                disabled={loading}
                className="text-sm text-gray-600 hover:text-gray-700 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                title="Recalculate analytics from existing data"
              >
                Reconcile
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Total MRR</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.total_mrr)}</p>
            {summary.mrr_change !== undefined && summary.mrr_change !== 0 && (
              <p className={`text-xs mt-1 ${summary.mrr_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.mrr_change >= 0 ? '+' : ''}{formatCurrency(summary.mrr_change)} 
                ({summary.mrr_change_percent?.toFixed(1)}%)
              </p>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Total ARR</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.total_arr || 0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Revenue {timeRange === 'all' ? '(All Time)' : `(${timeRange}d)`}</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.last_30_days_revenue)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Active Subs</p>
            <p className="text-2xl font-bold text-gray-900">{summary.active_subscriptions}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Avg Client LTV</p>
            <p className="text-2xl font-bold text-gray-900">
              {summary.average_client_ltv !== undefined 
                ? formatCurrency(summary.average_client_ltv) 
                : formatCurrency(0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Avg total spend</p>
          </div>
        </div>

        {/* Additional KPIs */}
        {(summary.new_subscriptions !== undefined || summary.churned_subscriptions !== undefined || summary.failed_payments !== undefined) && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {summary.new_subscriptions !== undefined && (
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">New Subs</p>
                <p className="text-2xl font-bold text-gray-900">{summary.new_subscriptions}</p>
              </div>
            )}
            {summary.churned_subscriptions !== undefined && (
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Churned</p>
                <p className="text-2xl font-bold text-gray-900">{summary.churned_subscriptions}</p>
              </div>
            )}
            {summary.failed_payments !== undefined && (
              <div className="bg-yellow-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Failed Payments</p>
                <p className="text-2xl font-bold text-gray-900">{summary.failed_payments}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Over Time Chart */}
        {revenueTimeline && revenueTimeline.timeline && revenueTimeline.timeline.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Revenue Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueTimeline.timeline.map(point => {
                const date = new Date(point.date);
                return {
                  ...point,
                  date: isNaN(date.getTime()) ? point.date : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                };
              })}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Revenue" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* MRR Trend Chart */}
        {mrrTrend && mrrTrend.trend_data && mrrTrend.trend_data.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">MRR Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mrrTrend.trend_data.map(point => {
                const date = new Date(point.date);
                return {
                  ...point,
                  date: isNaN(date.getTime()) ? point.date : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                };
              })}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="mrr" stroke="#10b981" strokeWidth={2} name="MRR" />
              </LineChart>
            </ResponsiveContainer>
            {mrrTrend.growth_percent !== undefined && (
              <p className={`text-sm mt-2 ${mrrTrend.growth_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Growth: {mrrTrend.growth_percent >= 0 ? '+' : ''}{mrrTrend.growth_percent.toFixed(1)}%
              </p>
            )}
          </div>
        )}
      </div>

      {/* New Customers vs Churn Chart */}
      {churnData && churnData.cohort_snapshot && churnData.cohort_snapshot.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Customers vs Churn</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={churnData.cohort_snapshot}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="new_subscriptions" fill="#3b82f6" name="New Subscriptions" />
              <Bar dataKey="churned" fill="#ef4444" name="Churned" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payments Table with Customer Info */}
      {payments && payments.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Payments</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subscription</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {payment.created_at && payment.created_at > 0
                        ? new Date(payment.created_at * 1000).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>
                        <p className="text-gray-900 font-medium">{payment.client_name || 'Unknown'}</p>
                        {payment.client_email && (
                          <p className="text-gray-500 text-xs">{payment.client_email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency((payment.amount_cents || 0) / 100)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        payment.status === 'succeeded' 
                          ? 'bg-green-100 text-green-800' 
                          : payment.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {payment.subscription_id ? (
                        <span className="font-mono text-xs">{payment.subscription_id.substring(0, 20)}...</span>
                      ) : (
                        'N/A'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Failed Payments Table with Customer Info */}
      {failedPayments && failedPayments.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Failed Payments</h3>
            <p className="text-xs text-gray-500">
              Duplicate failures from the same subscription are grouped together
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Latest Attempt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recovery</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {failedPayments.map((payment) => (
                  <tr key={payment.id} className={payment.attempt_count && payment.attempt_count > 1 ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {payment.latest_attempt_at && payment.latest_attempt_at > 0
                        ? new Date(payment.latest_attempt_at * 1000).toLocaleDateString()
                        : payment.created_at && payment.created_at > 0
                        ? new Date(payment.created_at * 1000).toLocaleDateString()
                        : 'N/A'}
                      {payment.first_attempt_at && payment.latest_attempt_at && payment.first_attempt_at !== payment.latest_attempt_at && (
                        <p className="text-xs text-gray-500 mt-1">
                          First: {new Date(payment.first_attempt_at * 1000).toLocaleDateString()}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>
                        <p className="text-gray-900 font-medium">{payment.client_name || 'Unknown'}</p>
                        {payment.client_email && (
                          <p className="text-gray-500 text-xs">{payment.client_email}</p>
                        )}
                        {payment.subscription_id && (
                          <p className="text-gray-400 text-xs mt-1">Sub: {payment.subscription_id.substring(0, 20)}...</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency((payment.amount_cents || 0) / 100)}</td>
                    <td className="px-4 py-3 text-sm">
                      {payment.attempt_count && payment.attempt_count > 1 ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-800">
                            {payment.attempt_count} attempts
                          </span>
                          <span className="text-xs text-gray-500">
                            (grouped)
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">1 attempt</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800">
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {payment.has_recovery_recommendation ? (
                        <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                          Recommended
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
