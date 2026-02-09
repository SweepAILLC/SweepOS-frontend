import { useState, useEffect, useRef } from 'react';
import ClientKanbanBoard from './client/ClientKanbanBoard';
import PipelineSnapshot from './terminal/PipelineSnapshot';
import TopRevenueContributors from './terminal/TopRevenueContributors';
import CashCollectedAndMRR from './terminal/CashCollectedAndMRR';
import FailedPaymentQueue from './terminal/FailedPaymentQueue';
import LeadsBySource from './terminal/LeadsBySource';
import BookingRateByFunnel from './terminal/BookingRateByFunnel';
import NotificationsCard from './calendar/NotificationsCard';
import { useLoading } from '@/contexts/LoadingContext';

export default function TerminalDashboard() {
  const [filteredColumn, setFilteredColumn] = useState<string | null>(null);
  const { setLoading: setGlobalLoading } = useLoading();
  const [componentLoadingStates, setComponentLoadingStates] = useState<Record<string, boolean>>({
    topRevenue: true,
    cashCollected: true,
    pipeline: true,
    kanban: true,
    notifications: true,
    failedPayments: true,
    leadsBySource: true,
    bookingRate: true,
  });
  const loadingInitialized = useRef(false);
  const allLoadedRef = useRef(false);

  // Set loading to true only once when component mounts
  useEffect(() => {
    if (!loadingInitialized.current) {
      setGlobalLoading(true, 'Loading Terminal dashboard...');
      loadingInitialized.current = true;
    }
  }, [setGlobalLoading]);

  // Update global loading state based on component states - only turn off when ALL are loaded
  useEffect(() => {
    const allLoaded = Object.values(componentLoadingStates).every(loading => !loading);
    
    if (allLoaded && !allLoadedRef.current) {
      allLoadedRef.current = true;
      // Small delay to ensure smooth transition
      setTimeout(() => {
        setGlobalLoading(false);
      }, 200);
    }
    // Don't set loading to true again if components are still loading - it's already true
  }, [componentLoadingStates, setGlobalLoading]);

  const handleComponentLoaded = (componentName: string) => {
    setComponentLoadingStates(prev => {
      // Only update if this component hasn't already reported as loaded
      if (prev[componentName] === false) {
        return prev; // Already loaded, don't update
      }
      return {
        ...prev,
        [componentName]: false,
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Terminal</h2>
      </div>

      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calendar Notifications */}
        <NotificationsCard onLoadComplete={() => handleComponentLoaded('notifications')} />

        {/* Cash Collected & Current MRR */}
        <CashCollectedAndMRR onLoadComplete={() => handleComponentLoaded('cashCollected')} />
      </div>

      {/* Revenue Contributors & Failed Payment Queue Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Revenue Contributors */}
        <TopRevenueContributors onLoadComplete={() => handleComponentLoaded('topRevenue')} />

        {/* Failed Payment Queue */}
        <FailedPaymentQueue onLoadComplete={() => handleComponentLoaded('failedPayments')} />
      </div>

      {/* Pipeline Snapshot */}
      <PipelineSnapshot 
        onFilterChange={setFilteredColumn}
        onLoadComplete={() => handleComponentLoaded('pipeline')}
      />

      {/* Kanban Board */}
      <div className="mt-6">
        <ClientKanbanBoard 
          filteredColumn={filteredColumn}
          onLoadComplete={() => handleComponentLoaded('kanban')}
        />
      </div>

      {/* Bottom Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by Source */}
        <LeadsBySource onLoadComplete={() => handleComponentLoaded('leadsBySource')} />

        {/* Booking Rate by Funnel */}
        <BookingRateByFunnel onLoadComplete={() => handleComponentLoaded('bookingRate')} />
      </div>
    </div>
  );
}

