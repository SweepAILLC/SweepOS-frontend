import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Transition } from '@headlessui/react';
import { apiClient } from '@/lib/api';
import { Client } from '@/types/client';

interface CheckIn {
  id: string;
  event_id: string;
  event_uri?: string;
  provider: string;
  title: string;
  start_time: string;
  end_time?: string;
  location?: string;
  meeting_url?: string;
  attendee_email: string;
  attendee_name?: string;
  completed: boolean;
  cancelled: boolean;
  created_at?: string;
}

interface ClientCheckInCalendarProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onCloseBoth?: () => void; // Callback to close both calendar and drawer
}

export default function ClientCheckInCalendar({
  client,
  isOpen,
  onClose,
  onCloseBoth,
}: ClientCheckInCalendarProps) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [manualCheckInTime, setManualCheckInTime] = useState('12:00');
  const [manualCheckInDuration, setManualCheckInDuration] = useState(60); // Duration in minutes

  useEffect(() => {
    if (isOpen && client) {
      loadCheckIns();
    }
  }, [isOpen, client]);

  useEffect(() => {
    // Reset time input when date changes
    if (selectedDate) {
      setShowTimeInput(false);
      setManualCheckInTime('12:00');
      setManualCheckInDuration(60);
    }
  }, [selectedDate]);

  const loadCheckIns = async () => {
    if (!client) return;
    
    setLoading(true);
    try {
      const data = await apiClient.getClientCheckIns(client.id, 100);
      setCheckIns(data || []);
    } catch (error) {
      console.error('Failed to load check-ins:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    const startTime = Date.now();
    const minDuration = 800; // Minimum 800ms to ensure animation is visible
    
    try {
      await apiClient.syncCheckIns();
      await loadCheckIns(); // Reload after sync
    } catch (error: any) {
      console.error('Failed to sync check-ins:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to sync check-ins. Please try again.';
      alert(`Failed to sync check-ins: ${errorMessage}`);
    } finally {
      // Ensure minimum duration for animation visibility
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDuration - elapsed);
      await new Promise(resolve => setTimeout(resolve, remaining));
      setSyncing(false);
    }
  };

  const handleMarkComplete = async (checkInId: string, currentlyCompleted: boolean) => {
    try {
      await apiClient.updateCheckIn(checkInId, !currentlyCompleted);
      await loadCheckIns(); // Reload to show updated state
    } catch (error: any) {
      console.error('Failed to update check-in:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to update check-in. Please try again.';
      alert(`Failed to update check-in: ${errorMessage}`);
    }
  };

  const handleDelete = async (checkInId: string) => {
    if (!confirm('Are you sure you want to delete this check-in?')) {
      return;
    }
    
    try {
      await apiClient.deleteCheckIn(checkInId);
      await loadCheckIns(); // Reload to remove deleted check-in
    } catch (error: any) {
      console.error('Failed to delete check-in:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to delete check-in. Please try again.';
      alert(`Failed to delete check-in: ${errorMessage}`);
    }
  };

  const handleMarkDayAsChecked = async (date: Date, time?: string, duration?: number) => {
    if (!client) return;
    
    // Parse time string (HH:MM format) or use default noon
    let hours = 12;
    let minutes = 0;
    if (time) {
      const [h, m] = time.split(':').map(Number);
      hours = h || 12;
      minutes = m || 0;
    }
    
    // Create a manual check-in for this day at specified time
    const startTime = new Date(date);
    startTime.setHours(hours, minutes, 0, 0);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (duration || 60));
    
    try {
      await apiClient.createManualCheckIn(
        client.id,
        "Manual Check-In",
        startTime.toISOString(),
        endTime.toISOString()
      );
      await loadCheckIns();
      setShowTimeInput(false);
      setManualCheckInTime('12:00');
      setManualCheckInDuration(60);
    } catch (error: any) {
      console.error('Failed to create check-in:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to create check-in. Please try again.';
      alert(`Failed to create check-in: ${errorMessage}`);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
  };

  // Get check-ins for the selected month
  const getCheckInsForMonth = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    
    return checkIns.filter(checkIn => {
      const checkInDate = new Date(checkIn.start_time);
      return checkInDate.getFullYear() === year && checkInDate.getMonth() === month;
    });
  };

  // Get all unique dates with check-ins
  const getDatesWithCheckIns = () => {
    const dates = new Set<string>();
    checkIns.forEach(checkIn => {
      const date = new Date(checkIn.start_time);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      dates.add(dateKey);
    });
    return Array.from(dates).map(key => {
      const [year, month, day] = key.split('-').map(Number);
      return new Date(year, month, day);
    }).sort((a, b) => a.getTime() - b.getTime());
  };

  // Calendar grid helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days: (Date | null)[] = [];
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const hasCheckInOnDate = (date: Date | null) => {
    if (!date) return false;
    return checkIns.some(checkIn => {
      const checkInDate = new Date(checkIn.start_time);
      return (
        checkInDate.getFullYear() === date.getFullYear() &&
        checkInDate.getMonth() === date.getMonth() &&
        checkInDate.getDate() === date.getDate()
      );
    });
  };

  const getCheckInsForDate = (date: Date | null) => {
    if (!date) return [];
    return checkIns.filter(checkIn => {
      const checkInDate = new Date(checkIn.start_time);
      return (
        checkInDate.getFullYear() === date.getFullYear() &&
        checkInDate.getMonth() === date.getMonth() &&
        checkInDate.getDate() === date.getDate()
      );
    });
  };

  const isToday = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const monthName = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const days = getDaysInMonth(selectedMonth);
  const monthCheckIns = getCheckInsForMonth();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  const selectedDateCheckIns = selectedDate ? getCheckInsForDate(selectedDate) : [];

  const content = (
    <div className="fixed inset-0 z-[100]">
      {/* Clickable area between modals - closes both */}
      <div 
        className="fixed inset-0 pointer-events-auto bg-transparent"
        style={{ left: 'calc(672px + 24rem + 1rem)' }} // Start after the calendar panel + modal width (w-96 = 24rem)
        onClick={() => {
          if (onCloseBoth) {
            onCloseBoth();
          } else {
            onClose();
          }
        }}
      />
      
      {/* Slide-in panel */}
      <Transition
        show={isOpen}
        as={React.Fragment}
        enter="transform transition ease-out duration-300"
        enterFrom="-translate-x-full"
        enterTo="translate-x-0"
        leave="transform transition ease-in duration-200"
        leaveFrom="translate-x-0"
        leaveTo="-translate-x-full"
      >
        <div 
          className="fixed left-0 top-0 bottom-0 w-full max-w-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden pointer-events-auto relative flex flex-col z-[100]"
        >
            <div className="p-6 flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Check-In History
                  </h2>
                  {client && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {client.first_name} {client.last_name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <svg
                      className={`w-5 h-5 flex-shrink-0 ${syncing ? 'animate-spin' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <span>{syncing ? 'Syncing...' : 'Sync Calendar'}</span>
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
                  <p className="mt-2 text-gray-600 dark:text-gray-400">Loading check-ins...</p>
                </div>
              ) : (
                <>
                  {/* Calendar View */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <button
                        onClick={() => navigateMonth('prev')}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {monthName}
                      </h3>
                      <button
                        onClick={() => navigateMonth('next')}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1 mb-4">
                      {/* Day headers */}
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2">
                          {day}
                        </div>
                      ))}
                      
                      {/* Calendar days */}
                      {days.map((date, idx) => {
                        const hasCheckIn = hasCheckInOnDate(date);
                        const isTodayDate = isToday(date);
                        const dateCheckIns = getCheckInsForDate(date);
                        const allCompleted = dateCheckIns.length > 0 && dateCheckIns.every(ci => ci.completed);
                        const hasCompleted = dateCheckIns.some(ci => ci.completed);
                        const isSelected = selectedDate && date && 
                          selectedDate.getFullYear() === date.getFullYear() &&
                          selectedDate.getMonth() === date.getMonth() &&
                          selectedDate.getDate() === date.getDate();
                        
                        return (
                          <div
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (date) {
                                // If no check-ins exist for this date, open modal to set time
                                if (!hasCheckIn) {
                                  console.log('Setting selected date:', date);
                                  setSelectedDate(date);
                                  setShowTimeInput(true);
                                } else {
                                  // If check-ins exist but are NOT all completed (blue dot), remove them
                                  // If all completed (green checkmark), open modal to view/manage
                                  if (!allCompleted && dateCheckIns.length > 0) {
                                    // Remove all check-ins for this date (blue dot - incomplete)
                                    const deletePromises = dateCheckIns.map(checkIn => 
                                      apiClient.deleteCheckIn(checkIn.id)
                                    );
                                    Promise.all(deletePromises)
                                      .then(() => loadCheckIns())
                                      .catch((error: any) => {
                                        console.error('Failed to delete check-ins:', error);
                                        alert('Failed to remove check-ins. Please try again.');
                                      });
                                  } else {
                                    // Open the modal to view/manage completed check-ins
                                    setSelectedDate(date);
                                  }
                                }
                              }
                            }}
                            title={hasCheckIn ? (!allCompleted ? "Click to remove check-in" : "Click to view check-ins") : "Click to mark a check-in"}
                            className={`
                              aspect-square p-1 border rounded transition-all
                              ${date ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700' : ''}
                              ${isTodayDate ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'border-gray-200 dark:border-gray-700'}
                              ${hasCheckIn ? (allCompleted ? 'bg-green-50 dark:bg-green-900/20' : hasCompleted ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-blue-50 dark:bg-blue-900/20') : ''}
                              ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                            `}
                          >
                            {date && (
                              <>
                                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                  {date.getDate()}
                                </div>
                                {hasCheckIn && (
                                  <div className="flex justify-center">
                                    {allCompleted ? (
                                      <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    ) : hasCompleted ? (
                                      <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                      </svg>
                                    ) : (
                                      <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400"></div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Check-in List */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="flex items-center justify-between mb-4 flex-shrink-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Check-Ins ({monthCheckIns.length})
                      </h3>
                      {selectedDate && (
                        <button
                          onClick={() => setSelectedDate(null)}
                          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                    {selectedDate && (
                      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Showing check-ins for: <span className="font-semibold">
                            {selectedDate.toLocaleDateString('en-US', { 
                              month: 'long', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </span>
                          <span className="ml-2 text-gray-500 dark:text-gray-400">
                            ({getCheckInsForDate(selectedDate).length} check-in{getCheckInsForDate(selectedDate).length !== 1 ? 's' : ''})
                          </span>
                        </p>
                      </div>
                    )}
                    
                    {monthCheckIns.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <p>No check-ins found for this month.</p>
                        <p className="text-sm mt-2">Click "Sync Calendar" to sync with your calendar.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(selectedDate 
                          ? monthCheckIns.filter(checkIn => {
                              const checkInDate = new Date(checkIn.start_time);
                              return (
                                checkInDate.getFullYear() === selectedDate.getFullYear() &&
                                checkInDate.getMonth() === selectedDate.getMonth() &&
                                checkInDate.getDate() === selectedDate.getDate()
                              );
                            })
                          : monthCheckIns
                        ).map(checkIn => (
                          <div
                            id={`checkin-${checkIn.id}`}
                            key={checkIn.id}
                            className={`
                              p-4 rounded-lg border
                              ${checkIn.cancelled ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600' : ''}
                              ${checkIn.completed ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'}
                            `}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                    {checkIn.title}
                                  </h4>
                                  {checkIn.completed && !checkIn.cancelled && (
                                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                  {checkIn.cancelled && (
                                    <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                                      Cancelled
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {formatDate(checkIn.start_time)}
                                  {checkIn.end_time && ` - ${formatTime(checkIn.end_time)}`}
                                </p>
                                {checkIn.meeting_url && (
                                  <a
                                    href={checkIn.meeting_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
                                  >
                                    Join Meeting →
                                  </a>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                                  {checkIn.provider}
                                </span>
                                {/* Action buttons */}
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleMarkComplete(checkIn.id, checkIn.completed)}
                                    className={`
                                      p-1.5 rounded transition-colors
                                      ${checkIn.completed 
                                        ? 'text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30' 
                                        : 'text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                      }
                                    `}
                                    title={checkIn.completed ? 'Mark as incomplete' : 'Mark as complete'}
                                  >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => handleDelete(checkIn.id)}
                                    className="p-1.5 rounded text-red-400 hover:text-red-600 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Delete check-in"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </Transition>

      {/* Day Details Modal - shows when a date is selected */}
      {selectedDate && (
        <div 
          className="fixed left-[calc(672px+1rem)] top-0 bottom-0 z-[110] pointer-events-auto flex items-start pt-6"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-96 max-h-[calc(100vh-3rem)] overflow-y-auto border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {selectedDate.toLocaleDateString('en-US', { 
                      weekday: 'long',
                      month: 'long', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {selectedDateCheckIns.length} check-in{selectedDateCheckIns.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedDateCheckIns.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p className="mb-4">No check-ins scheduled for this day.</p>
                  {!showTimeInput ? (
                    <button
                      onClick={() => setShowTimeInput(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      Mark Day as Checked
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 text-left">
                            Time
                          </label>
                          <input
                            type="time"
                            value={manualCheckInTime}
                            onChange={(e) => setManualCheckInTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 text-left">
                            Duration (minutes)
                          </label>
                          <select
                            value={manualCheckInDuration}
                            onChange={(e) => setManualCheckInDuration(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value={15}>15 minutes</option>
                            <option value={30}>30 minutes</option>
                            <option value={60}>1 hour</option>
                            <option value={90}>1.5 hours</option>
                            <option value={120}>2 hours</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => {
                            if (selectedDate) {
                              handleMarkDayAsChecked(selectedDate, manualCheckInTime, manualCheckInDuration);
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                        >
                          Create Check-In
                        </button>
                        <button
                          onClick={() => {
                            setShowTimeInput(false);
                            setManualCheckInTime('12:00');
                            setManualCheckInDuration(60);
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDateCheckIns.map(checkIn => (
                    <div
                      key={checkIn.id}
                      className={`
                        p-4 rounded-lg border
                        ${checkIn.cancelled ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600' : ''}
                        ${checkIn.completed ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'}
                      `}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                              {checkIn.title}
                            </h4>
                            {checkIn.completed && !checkIn.cancelled && (
                              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                            {checkIn.cancelled && (
                              <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                                Cancelled
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {formatTime(checkIn.start_time)}
                            {checkIn.end_time && ` - ${formatTime(checkIn.end_time)}`}
                          </p>
                          {checkIn.meeting_url && (
                            <a
                              href={checkIn.meeting_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
                            >
                              Join Meeting →
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={async () => {
                            await handleMarkComplete(checkIn.id, checkIn.completed);
                            await loadCheckIns(); // Refresh to update the modal
                          }}
                          className={`
                            flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors
                            ${checkIn.completed 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40' 
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }
                          `}
                        >
                          {checkIn.completed ? '✓ Completed' : 'Mark Complete'}
                        </button>
                        <button
                          onClick={async () => {
                            await handleDelete(checkIn.id);
                            await loadCheckIns(); // Refresh to update the modal
                            // If no more check-ins for this date, close the modal
                            const remaining = selectedDateCheckIns.filter(ci => ci.id !== checkIn.id);
                            if (remaining.length === 0) {
                              setSelectedDate(null);
                            }
                          }}
                          className="px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/40 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Render using portal to escape Dialog's focus trap
  return typeof window !== 'undefined' 
    ? createPortal(content, document.body)
    : null;
}

