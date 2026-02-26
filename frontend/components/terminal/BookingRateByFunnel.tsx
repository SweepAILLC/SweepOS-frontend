import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { Funnel } from '@/types/funnel';

interface FunnelBookingRate {
  funnel: Funnel;
  visitors: number;
  formSubmits: number;
  bookings: number;
  ctr: number; // Click-through rate (visitors to form submit)
  formToBooking: number; // Form submit to booking conversion
  overallConversion: number; // Overall visitors to booking
}

interface BookingRateByFunnelProps {
  onLoadComplete?: () => void;
}

export default function BookingRateByFunnel({ onLoadComplete }: BookingRateByFunnelProps = {}) {
  const [funnelRates, setFunnelRates] = useState<FunnelBookingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const hasCalledOnLoadComplete = useRef(false);

  useEffect(() => {
    loadFunnelRates();
  }, []);

  // Live polling for accurate terminal funnel data (refresh every 60s; bypass cache)
  useEffect(() => {
    const interval = setInterval(() => loadFunnelRates(true), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadFunnelRates = async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      // Get all funnels
      const funnels = await apiClient.getFunnels();
      
      const rates: FunnelBookingRate[] = [];
      
      for (const funnel of funnels) {
        try {
          const analytics = await apiClient.getFunnelAnalytics(funnel.id, 30, forceRefresh);
          
          const visitors = analytics.total_visitors || 0;
          const bookings = analytics.total_conversions || 0; // Use conversions instead of bookings
          const overallConversion = analytics.overall_conversion_rate || 0;
          
          // Use conversion rates already calculated in step_counts
          let formSubmits = 0;
          let ctr = 0;
          let formToBooking = 0;
          
          // Find form submit step and use its conversion rate
          if (analytics.step_counts && analytics.step_counts.length > 0) {
            // Look for form-related step
            const formStep = analytics.step_counts.find((step: any) => {
              const eventName = step.event_name?.toLowerCase() || '';
              return eventName.includes('form') && 
                     (eventName.includes('submit') || eventName.includes('complete') || eventName.includes('started'));
            });
            
            if (formStep) {
              formSubmits = formStep.count || 0;
              // Use the conversion_rate from step_counts (already calculated)
              ctr = formStep.conversion_rate || 0;
            } else {
              // If no form step, use first step with conversion rate as proxy
              const firstStepWithRate = analytics.step_counts.find((step: any) => 
                step.conversion_rate !== null && step.conversion_rate !== undefined
              );
              if (firstStepWithRate) {
                formSubmits = firstStepWithRate.count || 0;
                ctr = firstStepWithRate.conversion_rate || 0;
              }
            }
            
            // Find booking step and use its conversion rate
            const bookingStep = analytics.step_counts.find((step: any) => {
              const eventName = step.event_name?.toLowerCase() || '';
              return eventName.includes('booking') || eventName.includes('payment') || eventName.includes('purchase');
            });
            
            if (bookingStep && formSubmits > 0) {
              // Use the conversion_rate from step_counts (already calculated)
              formToBooking = bookingStep.conversion_rate || 0;
            } else if (formSubmits > 0) {
              // Fallback: calculate from bookings
              formToBooking = (bookings / formSubmits) * 100;
            }
          }
          
          rates.push({
            funnel,
            visitors,
            formSubmits,
            bookings,
            ctr,
            formToBooking,
            overallConversion,
          });
        } catch (error) {
          console.warn(`Failed to load analytics for funnel ${funnel.id}:`, error);
        }
      }
      
      // Sort by overall conversion rate
      rates.sort((a, b) => b.overallConversion - a.overallConversion);
      
      setFunnelRates(rates);
    } catch (error) {
      console.error('Failed to load funnel booking rates:', error);
    } finally {
      setLoading(false);
      if (!hasCalledOnLoadComplete.current && onLoadComplete) {
        hasCalledOnLoadComplete.current = true;
        onLoadComplete();
      }
    }
  };

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Booking Rate by Funnel
      </h3>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      ) : funnelRates.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          No funnel data available.
        </p>
      ) : (
        <div className="space-y-4">
          {funnelRates.map((rate) => (
            <div
              key={rate.funnel.id}
              className="p-3 sm:p-4 glass-panel rounded-lg min-w-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0">
                  {rate.funnel.name}
                </h4>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {rate.overallConversion.toFixed(1)}% Overall
                </span>
              </div>
              
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Visitors → Form Submit</span>
                  <span className="text-gray-900 dark:text-gray-100 font-medium break-all">
                    {rate.visitors.toLocaleString()} → {rate.formSubmits.toLocaleString()} ({rate.ctr.toFixed(1)}%)
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Form Submit → Booking</span>
                  <span className="text-gray-900 dark:text-gray-100 font-medium break-all">
                    {rate.formSubmits.toLocaleString()} → {rate.bookings.toLocaleString()} ({rate.formToBooking.toFixed(1)}%)
                  </span>
                </div>
                
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 digitized-text">
                      Total Bookings
                    </span>
                    <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                      {rate.bookings.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

