import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Client, ClientPaymentsResponse } from '@/types/client';
import { apiClient } from '@/lib/api';
import { BrevoStatus } from '@/types/integration';
import EmailComposer from '../brevo/EmailComposer';
import ClientCheckInCalendar from './ClientCheckInCalendar';

interface ClientDetailDrawerProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ClientDetailDrawer({
  client,
  isOpen,
  onClose,
  onUpdate,
}: ClientDetailDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState<ClientPaymentsResponse | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [brevoStatus, setBrevoStatus] = useState<BrevoStatus | null>(null);
  const [brevoLoading, setBrevoLoading] = useState(false);
  const [addingToBrevo, setAddingToBrevo] = useState(false);
  const [clientInBrevo, setClientInBrevo] = useState(false);
  const [checkingBrevoContact, setCheckingBrevoContact] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showManualPaymentForm, setShowManualPaymentForm] = useState(false);
  const [manualPaymentForm, setManualPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    description: '',
    payment_method: '',
    receipt_url: '',
  });
  const [submittingManualPayment, setSubmittingManualPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [showCheckInCalendar, setShowCheckInCalendar] = useState(false);
  const [nextCheckIn, setNextCheckIn] = useState<any>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    instagram: '',
    notes: '',
    program_start_date: '',
    program_end_date: '',
  });

  useEffect(() => {
    // Close calendar modal when drawer opens or client changes
    if (isOpen) {
      setShowCheckInCalendar(false);
    }
    
    if (client) {
      setFormData({
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        email: client.email || '',
        phone: client.phone || '',
        instagram: client.instagram || '',
        notes: client.notes || '',
        program_start_date: client.program_start_date 
          ? new Date(client.program_start_date).toISOString().split('T')[0] 
          : '',
        program_end_date: client.program_end_date 
          ? new Date(client.program_end_date).toISOString().split('T')[0] 
          : '',
      });
      setIsEditing(false);
      loadPayments();
      loadBrevoStatus();
      loadNextCheckIn();
      
      // Automatically trigger automation when drawer opens
      // The get_client endpoint will update the state based on progress
      if (isOpen && client.program_start_date && client.program_end_date) {
        apiClient.getClient(client.id).then((updatedClient) => {
          // If state changed, refresh the board to show updated column
          if (updatedClient.lifecycle_state !== client.lifecycle_state) {
            console.log('[ClientDetailDrawer] State changed, refreshing board...');
            onUpdate();
          }
        }).catch((error) => {
          console.error('[ClientDetailDrawer] Error fetching updated client:', error);
        });
      }
    }
  }, [client, isOpen]);

  // Check if client is in Brevo when Brevo status is loaded
  useEffect(() => {
    if (brevoStatus?.connected && client?.email) {
      checkClientInBrevo();
    } else {
      setClientInBrevo(false);
    }
  }, [brevoStatus, client?.email]);

  const loadBrevoStatus = async () => {
    setBrevoLoading(true);
    try {
      const status = await apiClient.getBrevoStatus();
      setBrevoStatus(status);
    } catch (error) {
      console.error('Failed to load Brevo status:', error);
      setBrevoStatus({ connected: false });
    } finally {
      setBrevoLoading(false);
    }
  };

  const checkClientInBrevo = async () => {
    if (!client || !client.email || !brevoStatus?.connected) {
      setClientInBrevo(false);
      return;
    }

    setCheckingBrevoContact(true);
    try {
      const existingContact = await apiClient.getBrevoContactByEmail(client.email);
      setClientInBrevo(existingContact !== null);
    } catch (error: any) {
      // If 404, contact doesn't exist
      if (error.response?.status === 404) {
        setClientInBrevo(false);
      } else {
        console.error('Error checking if client is in Brevo:', error);
        setClientInBrevo(false);
      }
    } finally {
      setCheckingBrevoContact(false);
    }
  };

  const handleEmailClient = () => {
    if (!client || !client.email) {
      alert('Client must have an email address to send email');
      return;
    }
    setShowEmailComposer(true);
  };

  const loadPayments = async () => {
    if (!client) return;
    setPaymentsLoading(true);
    try {
      // If this is a merged client, pass all merged client IDs to fetch payments from all
      const mergedClientIds = client.meta?.merged_client_ids;
      const data = await apiClient.getClientPayments(client.id, mergedClientIds);
      setPayments(data);
    } catch (error) {
      console.error('Failed to load payments:', error);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const loadNextCheckIn = async () => {
    if (!client) return;
    try {
      const data = await apiClient.getNextCheckIn(client.id);
      setNextCheckIn(data);
    } catch (error) {
      console.error('Failed to load next check-in:', error);
      setNextCheckIn(null);
    }
  };


  const handleSave = async () => {
    if (!client) return;
    setLoading(true);
    try {
      // Prepare update data with program fields
      const updateData: any = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        instagram: formData.instagram,
        notes: formData.notes,
      };
      
      // Include program fields only if they're being changed
      // Compare with current client values to determine if we need to update
      const currentStartDate = client.program_start_date 
        ? new Date(client.program_start_date).toISOString().split('T')[0] 
        : '';
      const currentEndDate = client.program_end_date 
        ? new Date(client.program_end_date).toISOString().split('T')[0] 
        : '';
      
      // Only include program_start_date if it changed
      if (formData.program_start_date !== currentStartDate) {
        if (formData.program_start_date && formData.program_start_date.trim() !== '') {
          updateData.program_start_date = new Date(formData.program_start_date + 'T00:00:00').toISOString();
        } else {
          updateData.program_start_date = null; // Clear if removed
        }
      }
      
      // Only include program_end_date if it changed
      if (formData.program_end_date !== currentEndDate) {
        if (formData.program_end_date && formData.program_end_date.trim() !== '') {
          updateData.program_end_date = new Date(formData.program_end_date + 'T00:00:00').toISOString();
        } else {
          updateData.program_end_date = null; // Clear if removed
        }
      }
      
      await apiClient.updateClient(client.id, updateData);
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to update client:', error);
      alert('Failed to update client. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (client) {
      setFormData({
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        email: client.email || '',
        phone: client.phone || '',
        notes: client.notes || '',
        program_start_date: client.program_start_date 
          ? new Date(client.program_start_date).toISOString().split('T')[0] 
          : '',
        program_duration_days: client.program_duration_days || undefined,
      });
    }
    setIsEditing(false);
  };

  const handleAddToBrevo = async () => {
    if (!client || !client.email) {
      alert('Client must have an email address to add to Brevo');
      return;
    }

    if (!client.first_name || !client.last_name) {
      alert('Client must have both first name and last name to add to Brevo');
      return;
    }

    if (!brevoStatus?.connected) {
      alert('Brevo is not connected. Please connect Brevo first.');
      return;
    }

    if (!confirm(`Add/Update ${client.first_name} ${client.last_name} (${client.email}) in Brevo?`)) {
      return;
    }

    setAddingToBrevo(true);
    try {
      const attributes: Record<string, any> = {
        FIRSTNAME: client.first_name,
        LASTNAME: client.last_name,
      };
      
      if (client.phone) {
        attributes.SMS = client.phone;
        attributes.PHONE = client.phone;
      }

      // First, try to check if contact exists by trying to get it
      // If it exists, update it; if not, create it
      let contactExists = false;
      try {
        const existingContact = await apiClient.getBrevoContactByEmail(client.email);
        contactExists = existingContact !== null;
      } catch (error: any) {
        // If 404, contact doesn't exist - that's fine, we'll create it
        if (error.response?.status !== 404) {
          console.warn('Error checking for existing contact:', error);
        }
      }

      if (contactExists) {
        // Update existing contact using PUT endpoint
        // According to Brevo API: https://developers.brevo.com/reference/update-contact
        // We can use email as identifier with identifierType=email_id
        await apiClient.updateBrevoContact(
          client.email,
          { attributes },
          'email_id'
        );
        alert(`Successfully updated ${client.first_name} ${client.last_name} in Brevo!`);
      } else {
        // Create new contact
        await apiClient.createBrevoContact({
          email: client.email,
          attributes,
          updateEnabled: false, // Don't update on create, we handle that separately
        });
        alert(`Successfully added ${client.first_name} ${client.last_name} to Brevo!`);
      }
      
      // Refresh Brevo status in case it changed
      await loadBrevoStatus();
    } catch (error: any) {
      console.error('Failed to add/update client in Brevo:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to add/update client in Brevo';
      
      // If update failed with 404, try creating instead
      if (error.response?.status === 404 && errorMessage.includes('not found')) {
        try {
          const attributes: Record<string, any> = {
            FIRSTNAME: client.first_name,
            LASTNAME: client.last_name,
          };
          if (client.phone) {
            attributes.SMS = client.phone;
            attributes.PHONE = client.phone;
          }
          await apiClient.createBrevoContact({
            email: client.email!,
            attributes,
            updateEnabled: false,
          });
          alert(`Successfully added ${client.first_name} ${client.last_name} to Brevo!`);
        } catch (createError: any) {
          alert(`Error adding to Brevo: ${createError.response?.data?.detail || createError.message || 'Failed to create contact'}`);
        }
      } else {
        alert(`Error adding/updating in Brevo: ${errorMessage}`);
      }
    } finally {
      setAddingToBrevo(false);
    }
  };

  if (!client) return null;

  const formatDate = (date: string | null | undefined) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const totalPaid = payments?.total_amount_paid || (client.lifetime_revenue_cents || 0) / 100;

  return (
    <>
    <Transition show={isOpen} as={Fragment}>
      <Dialog 
        as="div" 
        className="relative z-50" 
        static={showCheckInCalendar} // Prevent Dialog from blocking when calendar is open
        onClose={(e) => {
          // Don't close if calendar is open
          if (!showCheckInCalendar) {
            onClose();
          }
        }}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-500 sm:duration-700"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500 sm:duration-700"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-2xl">
                  <div className="flex h-full flex-col overflow-y-scroll bg-white dark:glass-card rounded-lg shadow-lg border border-gray-200 dark:border-white/10">
                    {/* Header */}
                    <div className="px-4 py-6 sm:px-6 border-b border-gray-200 dark:border-white/10">
                        <div className="flex items-center justify-between">
                        <Dialog.Title className="text-lg font-medium">
                          Client Profile
                        </Dialog.Title>
                        <div className="flex gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={handleCancel}
                                className="px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded"
                                disabled={loading}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSave}
                                disabled={loading}
                                className="px-3 py-1 text-sm glass-button neon-glow rounded disabled:opacity-50"
                              >
                                {loading ? 'Saving...' : 'Save'}
                              </button>
                            </>
                          ) : (
                            <>
                              {client.first_name && client.last_name && brevoStatus?.connected && (
                                <>
                                  {clientInBrevo && client.email ? (
                                    <button
                                      type="button"
                                      onClick={handleEmailClient}
                                      disabled={checkingBrevoContact || !client.email}
                                      className="px-3 py-1 text-sm glass-button-secondary hover:bg-white/20 rounded disabled:opacity-50"
                                      title="Send email to this client via Brevo"
                                    >
                                      {checkingBrevoContact ? 'Checking...' : 'Email'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={handleAddToBrevo}
                                      disabled={addingToBrevo || !client.email}
                                      className="px-3 py-1 text-sm glass-button-secondary hover:bg-white/20 rounded disabled:opacity-50"
                                      title="Add this client as a contact in Brevo"
                                    >
                                      {addingToBrevo ? 'Adding...' : 'Add to Brevo'}
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="px-3 py-1 text-sm glass-button neon-glow rounded"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="text-gray-400 hover:text-gray-500"
                                onClick={onClose}
                              >
                                <span className="sr-only">Close</span>
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 px-4 py-5 sm:px-6">
                      <div className="space-y-6">
                        {/* Basic Info */}
                        <div>
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Contact Information</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <dl className="space-y-4">
                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">First Name</dt>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={formData.first_name}
                                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                  className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                              ) : (
                                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                  {client.first_name || 'N/A'}
                                </dd>
                              )}
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Last Name</dt>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={formData.last_name}
                                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                  className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                              ) : (
                                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                  {client.last_name || 'N/A'}
                                </dd>
                              )}
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Email</dt>
                              {isEditing ? (
                                <input
                                  type="email"
                                  value={formData.email}
                                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                  className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                              ) : (
                                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                  {client.email || 'N/A'}
                                </dd>
                              )}
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Phone / SMS</dt>
                              {isEditing ? (
                                <input
                                  type="tel"
                                  value={formData.phone}
                                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                  placeholder="+1234567890"
                                  className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                              ) : (
                                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                  {client.phone || 'N/A'}
                                </dd>
                              )}
                            </div>
                          </dl>
                          
                          <dl className="space-y-4">
                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Instagram</dt>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={formData.instagram}
                                  onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                                  placeholder="@username"
                                  className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                              ) : (
                                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                  {client.instagram ? (client.instagram.startsWith('@') ? client.instagram : `@${client.instagram}`) : 'N/A'}
                                </dd>
                              )}
                            </div>
                          </dl>
                          </div>
                        </div>

                        {/* Financial Summary */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-6">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Financial Summary</h3>
                          <dl className="space-y-4">
                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Total Amount Paid</dt>
                              <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {formatCurrency(totalPaid)}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Estimated MRR</dt>
                              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                {formatCurrency(client.estimated_mrr || 0)}
                              </dd>
                            </div>

                            {client.stripe_customer_id && (
                              <div>
                                <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Stripe Customer ID</dt>
                                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
                                  {client.stripe_customer_id}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        {/* Check-Ins Section */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Check-Ins</h3>
                            <button
                              onClick={() => setShowCheckInCalendar(true)}
                              className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                            >
                              View Calendar
                            </button>
                          </div>
                          
                          {nextCheckIn ? (
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                              <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                </svg>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                                      Next Check-In
                                    </span>
                                  </div>
                                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                                    {nextCheckIn.title}
                                  </h4>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {new Date(nextCheckIn.start_time).toLocaleDateString('en-US', { 
                                      month: 'long', 
                                      day: 'numeric', 
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true 
                                    })}
                                  </p>
                                  {nextCheckIn.meeting_url && (
                                    <a
                                      href={nextCheckIn.meeting_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
                                    >
                                      Join Meeting →
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                No upcoming check-ins. Click "View Calendar" to sync with your calendar and view check-in history.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Payment History */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-6">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Payment History</h3>
                            <button
                              onClick={() => setShowManualPaymentForm(true)}
                              className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                            >
                              + Add Manual Payment
                            </button>
                          </div>
                          
                          {/* Manual Payment Form Modal */}
                          {showManualPaymentForm && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Add Manual Payment</h3>
                                <form onSubmit={async (e) => {
                                  e.preventDefault();
                                  if (!client) return;
                                  
                                  setSubmittingManualPayment(true);
                                  try {
                                    // Convert local date to ISO string preserving the user's local date
                                    // When user selects a date like "2024-01-15", treat it as that date at midnight in their local timezone
                                    let paymentDateISO: string | undefined;
                                    if (manualPaymentForm.payment_date) {
                                      // Parse the date string (YYYY-MM-DD) and create a date at midnight local time
                                      const [year, month, day] = manualPaymentForm.payment_date.split('-').map(Number);
                                      const localDate = new Date(year, month - 1, day, 0, 0, 0, 0); // month is 0-indexed
                                      // Convert to ISO string (this preserves the local date by converting to UTC)
                                      paymentDateISO = localDate.toISOString();
                                    }
                                    
                                    await apiClient.createManualPayment(
                                      client.id,
                                      parseFloat(manualPaymentForm.amount),
                                      paymentDateISO,
                                      manualPaymentForm.description || undefined,
                                      manualPaymentForm.payment_method || undefined,
                                      manualPaymentForm.receipt_url || undefined
                                    );
                                    setShowManualPaymentForm(false);
                                    setManualPaymentForm({
                                      amount: '',
                                      payment_date: new Date().toISOString().split('T')[0],
                                      description: '',
                                      payment_method: '',
                                      receipt_url: '',
                                    });
                                    // Reload payments
                                    loadPayments();
                                    onUpdate();
                                    // Dispatch custom event to refresh cash collected
                                    window.dispatchEvent(new CustomEvent('manualPaymentCreated'));
                                  } catch (error: any) {
                                    console.error('Failed to create manual payment:', error);
                                    alert(error?.response?.data?.detail || 'Failed to create manual payment');
                                  } finally {
                                    setSubmittingManualPayment(false);
                                  }
                                }}>
                                  <div className="space-y-4">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Amount ($)
                                      </label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        required
                                        value={manualPaymentForm.amount}
                                        onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, amount: e.target.value })}
                                        className="w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        placeholder="0.00"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Payment Date
                                      </label>
                                      <input
                                        type="date"
                                        required
                                        value={manualPaymentForm.payment_date}
                                        onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, payment_date: e.target.value })}
                                        className="w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Payment Method (optional)
                                      </label>
                                      <select
                                        value={manualPaymentForm.payment_method}
                                        onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, payment_method: e.target.value })}
                                        className="w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                      >
                                        <option value="">Select method...</option>
                                        <option value="cash">Cash</option>
                                        <option value="check">Check</option>
                                        <option value="bank_transfer">Bank Transfer</option>
                                        <option value="other">Other</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Description (optional)
                                      </label>
                                      <textarea
                                        value={manualPaymentForm.description}
                                        onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, description: e.target.value })}
                                        className="w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        rows={3}
                                        placeholder="Payment notes..."
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Receipt URL (optional)
                                      </label>
                                      <input
                                        type="url"
                                        value={manualPaymentForm.receipt_url}
                                        onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, receipt_url: e.target.value })}
                                        className="w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        placeholder="https://..."
                                      />
                                    </div>
                                  </div>
                                  <div className="mt-6 flex justify-end space-x-3">
                                    <button
                                      type="button"
                                      onClick={() => setShowManualPaymentForm(false)}
                                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={submittingManualPayment}
                                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                                    >
                                      {submittingManualPayment ? 'Adding...' : 'Add Payment'}
                                    </button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          )}
                          {paymentsLoading ? (
                            <div className="text-sm text-gray-500 dark:text-gray-100">Loading payments...</div>
                          ) : payments && payments.payments.length > 0 ? (
                            <div className="space-y-2">
                              {payments.payments.map((payment) => (
                                <div
                                  key={payment.id}
                                  className="flex items-center justify-between p-3 bg-white dark:glass-panel rounded-lg border border-gray-200 dark:border-white/10 shadow-sm"
                                >
                                  <div>
                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      {formatCurrency(payment.amount)}
                                      {payment.type === 'manual_payment' && (
                                        <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(Manual)</span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-100">
                                      {payment.created_at
                                        ? formatDate(payment.created_at)
                                        : 'Unknown date'}
                                    </div>
                                    {payment.description && (
                                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        {payment.description}
                                      </div>
                                    )}
                                    {payment.payment_method && (
                                      <div className="text-xs text-gray-400 dark:text-gray-500">
                                        Method: {payment.payment_method}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right flex items-center gap-2">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        payment.status === 'succeeded'
                                          ? 'bg-green-100 text-green-800'
                                          : payment.status === 'failed'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-gray-100 text-gray-800'
                                      }`}
                                    >
                                      {payment.status}
                                    </span>
                                    {payment.receipt_url && (
                                      <a
                                        href={payment.receipt_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800"
                                      >
                                        Receipt
                                      </a>
                                    )}
                                    {payment.type === 'manual_payment' && client && (
                                      <button
                                        onClick={async () => {
                                          if (!confirm('Are you sure you want to delete this manual payment?')) {
                                            return;
                                          }
                                          setDeletingPaymentId(payment.id);
                                          try {
                                            await apiClient.deleteManualPayment(client.id, payment.id);
                                            loadPayments();
                                            onUpdate();
                                          } catch (error: any) {
                                            console.error('Failed to delete manual payment:', error);
                                            alert(error?.response?.data?.detail || 'Failed to delete manual payment');
                                          } finally {
                                            setDeletingPaymentId(null);
                                          }
                                        }}
                                        disabled={deletingPaymentId === payment.id}
                                        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                                        title="Delete manual payment"
                                      >
                                        {deletingPaymentId === payment.id ? 'Deleting...' : 'Delete'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 dark:text-gray-100">No payments found</div>
                          )}
                        </div>

                        {/* Program Timeline */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-6">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Program Timeline</h3>
                          <dl className="space-y-4">
                            {isEditing ? (
                              <>
                                <div>
                                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-100 mb-1">Program Start Date</dt>
                                  <input
                                    type="date"
                                    value={formData.program_start_date}
                                    onChange={(e) => setFormData({ ...formData, program_start_date: e.target.value })}
                                    className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                  />
                                </div>
                                <div>
                                  <dt className="text-sm font-medium text-gray-500 mb-1">Program End Date</dt>
                                  <input
                                    type="date"
                                    value={formData.program_end_date}
                                    onChange={(e) => setFormData({ 
                                      ...formData, 
                                      program_end_date: e.target.value 
                                    })}
                                    min={formData.program_start_date || undefined}
                                    className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                  />
                                  <p className="mt-1 text-xs text-gray-500">
                                    Client will automatically move to offboarding at 75% and dead when expired
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                {client.program_start_date && client.program_end_date ? (
                                  <>
                                    <div>
                                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Program Start Date</dt>
                                      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                        {formatDate(client.program_start_date)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Program End Date</dt>
                                      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                        {formatDate(client.program_end_date)}
                                      </dd>
                                    </div>
                                    {client.program_duration_days && (
                                      <div>
                                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Program Duration</dt>
                                        <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                          {client.program_duration_days} days
                                        </dd>
                                      </div>
                                    )}
                                    {client.program_progress_percent !== undefined && client.program_progress_percent !== null && (
                                      <div>
                                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-100 mb-2">Program Progress</dt>
                                        <dd className="mt-1">
                                          <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="text-gray-900 dark:text-gray-100">{client.program_progress_percent.toFixed(1)}% Complete</span>
                                            <span className="text-gray-500 dark:text-gray-100">
                                              {client.program_progress_percent >= 100 
                                                ? 'Expired' 
                                                : client.program_progress_percent >= 75 
                                                ? 'Offboarding' 
                                                : 'Active'}
                                            </span>
                                          </div>
                                          <div className="w-full bg-gray-200 rounded-full h-3">
                                            <div
                                              className={`h-3 rounded-full transition-all ${
                                                client.program_progress_percent >= 100
                                                  ? 'bg-red-500'
                                                  : client.program_progress_percent >= 75
                                                  ? 'bg-yellow-500'
                                                  : 'bg-blue-500'
                                              }`}
                                              style={{ width: `${Math.min(100, Math.max(0, client.program_progress_percent))}%` }}
                                            />
                                          </div>
                                        </dd>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-sm text-gray-500 dark:text-gray-100">
                                    No program timeline set. Client will remain in current state unless manually moved.
                                  </div>
                                )}
                              </>
                            )}
                          </dl>
                        </div>

                        {/* Notes */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-6">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Notes</h3>
                          {isEditing ? (
                            <textarea
                              value={formData.notes}
                              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                              rows={6}
                              className="block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              placeholder="Add notes about this client..."
                            />
                          ) : (
                            <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                              {client.notes || 'No notes'}
                            </div>
                          )}
                        </div>

                        {/* Metadata */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-6">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Additional Info</h3>
                          <dl className="space-y-2">
                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Lifecycle State</dt>
                              <dd className="mt-1">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {client.lifecycle_state.replace('_', ' ').toUpperCase()}
                                </span>
                              </dd>
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Last Activity</dt>
                              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                {formatDate(client.last_activity_at)}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Created</dt>
                              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                {formatDate(client.created_at)}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>

    {/* Email Composer Modal */}
    {showEmailComposer && client && client.email && (
      <EmailComposer
        recipients={[{ email: client.email, name: client.first_name && client.last_name ? `${client.first_name} ${client.last_name}` : undefined }]}
        onClose={() => {
          setShowEmailComposer(false);
        }}
        onSuccess={() => {
          setShowEmailComposer(false);
        }}
      />
    )}

    {/* Check-In Calendar Modal */}
    {isOpen && (
      <ClientCheckInCalendar
        client={client}
        isOpen={showCheckInCalendar}
        onClose={() => {
          setShowCheckInCalendar(false);
          loadNextCheckIn(); // Refresh next check-in after closing
        }}
        onCloseBoth={() => {
          setShowCheckInCalendar(false);
          onClose(); // Close the drawer as well
        }}
      />
    )}
    </>
  );
}
