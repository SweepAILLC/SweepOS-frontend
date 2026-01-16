import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Client, ClientPaymentsResponse } from '@/types/client';
import { apiClient } from '@/lib/api';

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
  
  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    notes: '',
    program_start_date: '',
    program_duration_days: undefined as number | undefined,
  });

  useEffect(() => {
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
      setIsEditing(false);
      loadPayments();
    }
  }, [client]);

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
        notes: formData.notes,
      };
      
      // Include program fields only if they're being changed
      // Compare with current client values to determine if we need to update
      const currentStartDate = client.program_start_date 
        ? new Date(client.program_start_date).toISOString().split('T')[0] 
        : '';
      const currentDuration = client.program_duration_days || undefined;
      
      // Only include program_start_date if it changed
      if (formData.program_start_date !== currentStartDate) {
        if (formData.program_start_date && formData.program_start_date.trim() !== '') {
          updateData.program_start_date = new Date(formData.program_start_date + 'T00:00:00').toISOString();
        } else {
          updateData.program_start_date = null; // Clear if removed
        }
      }
      
      // Only include program_duration_days if it changed
      if (formData.program_duration_days !== currentDuration) {
        if (formData.program_duration_days !== undefined && formData.program_duration_days !== null && formData.program_duration_days > 0) {
          updateData.program_duration_days = formData.program_duration_days;
        } else {
          updateData.program_duration_days = null; // Clear if removed
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

  if (!client) return null;

  const formatDate = (date: string | null) => {
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
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
                  <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                    {/* Header */}
                    <div className="px-4 py-6 sm:px-6 border-b">
                      <div className="flex items-center justify-between">
                        <Dialog.Title className="text-lg font-medium text-gray-900">
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
                                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {loading ? 'Saving...' : 'Save'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
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
                          <h3 className="text-sm font-medium text-gray-900 mb-4">Contact Information</h3>
                          <dl className="space-y-4">
                            <div>
                              <dt className="text-sm font-medium text-gray-500">First Name</dt>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={formData.first_name}
                                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                              ) : (
                                <dd className="mt-1 text-sm text-gray-900">
                                  {client.first_name || 'N/A'}
                                </dd>
                              )}
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500">Last Name</dt>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={formData.last_name}
                                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                              ) : (
                                <dd className="mt-1 text-sm text-gray-900">
                                  {client.last_name || 'N/A'}
                                </dd>
                              )}
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500">Email</dt>
                              {isEditing ? (
                                <input
                                  type="email"
                                  value={formData.email}
                                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                              ) : (
                                <dd className="mt-1 text-sm text-gray-900">
                                  {client.email || 'N/A'}
                                </dd>
                              )}
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500">Phone / SMS</dt>
                              {isEditing ? (
                                <input
                                  type="tel"
                                  value={formData.phone}
                                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                  placeholder="+1234567890"
                                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                              ) : (
                                <dd className="mt-1 text-sm text-gray-900">
                                  {client.phone || 'N/A'}
                                </dd>
                              )}
                            </div>
                          </dl>
                        </div>

                        {/* Financial Summary */}
                        <div className="border-t pt-6">
                          <h3 className="text-sm font-medium text-gray-900 mb-4">Financial Summary</h3>
                          <dl className="space-y-4">
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Total Amount Paid</dt>
                              <dd className="mt-1 text-lg font-semibold text-gray-900">
                                {formatCurrency(totalPaid)}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500">Estimated MRR</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {formatCurrency(client.estimated_mrr || 0)}
                              </dd>
                            </div>

                            {client.stripe_customer_id && (
                              <div>
                                <dt className="text-sm font-medium text-gray-500">Stripe Customer ID</dt>
                                <dd className="mt-1 text-sm text-gray-900 font-mono">
                                  {client.stripe_customer_id}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        {/* Payment History */}
                        <div className="border-t pt-6">
                          <h3 className="text-sm font-medium text-gray-900 mb-4">Payment History</h3>
                          {paymentsLoading ? (
                            <div className="text-sm text-gray-500">Loading payments...</div>
                          ) : payments && payments.payments.length > 0 ? (
                            <div className="space-y-2">
                              {payments.payments.map((payment) => (
                                <div
                                  key={payment.id}
                                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                >
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {formatCurrency(payment.amount)}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {payment.created_at
                                        ? formatDate(payment.created_at)
                                        : 'Unknown date'}
                                    </div>
                                  </div>
                                  <div className="text-right">
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
                                        className="ml-2 text-xs text-blue-600 hover:text-blue-800"
                                      >
                                        Receipt
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">No payments found</div>
                          )}
                        </div>

                        {/* Program Timeline */}
                        <div className="border-t pt-6">
                          <h3 className="text-sm font-medium text-gray-900 mb-4">Program Timeline</h3>
                          <dl className="space-y-4">
                            {isEditing ? (
                              <>
                                <div>
                                  <dt className="text-sm font-medium text-gray-500 mb-1">Program Start Date</dt>
                                  <input
                                    type="date"
                                    value={formData.program_start_date}
                                    onChange={(e) => setFormData({ ...formData, program_start_date: e.target.value })}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                  />
                                </div>
                                <div>
                                  <dt className="text-sm font-medium text-gray-500 mb-1">Program Duration (Days)</dt>
                                  <input
                                    type="number"
                                    min="1"
                                    value={formData.program_duration_days || ''}
                                    onChange={(e) => setFormData({ 
                                      ...formData, 
                                      program_duration_days: e.target.value ? parseInt(e.target.value) : undefined 
                                    })}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                    placeholder="e.g., 90"
                                  />
                                  <p className="mt-1 text-xs text-gray-500">
                                    Client will automatically move to offboarding at 75% and dead when expired
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                {client.program_start_date && client.program_duration_days ? (
                                  <>
                                    <div>
                                      <dt className="text-sm font-medium text-gray-500">Program Start Date</dt>
                                      <dd className="mt-1 text-sm text-gray-900">
                                        {formatDate(client.program_start_date)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-sm font-medium text-gray-500">Program Duration</dt>
                                      <dd className="mt-1 text-sm text-gray-900">
                                        {client.program_duration_days} days
                                      </dd>
                                    </div>
                                    {client.program_end_date && (
                                      <div>
                                        <dt className="text-sm font-medium text-gray-500">Program End Date</dt>
                                        <dd className="mt-1 text-sm text-gray-900">
                                          {formatDate(client.program_end_date)}
                                        </dd>
                                      </div>
                                    )}
                                    {client.program_progress_percent !== undefined && client.program_progress_percent !== null && (
                                      <div>
                                        <dt className="text-sm font-medium text-gray-500 mb-2">Program Progress</dt>
                                        <dd className="mt-1">
                                          <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="text-gray-900">{client.program_progress_percent.toFixed(1)}% Complete</span>
                                            <span className="text-gray-500">
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
                                  <div className="text-sm text-gray-500">
                                    No program timeline set. Client will remain in current state unless manually moved.
                                  </div>
                                )}
                              </>
                            )}
                          </dl>
                        </div>

                        {/* Notes */}
                        <div className="border-t pt-6">
                          <h3 className="text-sm font-medium text-gray-900 mb-4">Notes</h3>
                          {isEditing ? (
                            <textarea
                              value={formData.notes}
                              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                              rows={6}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              placeholder="Add notes about this client..."
                            />
                          ) : (
                            <div className="text-sm text-gray-900 whitespace-pre-wrap">
                              {client.notes || 'No notes'}
                            </div>
                          )}
                        </div>

                        {/* Metadata */}
                        <div className="border-t pt-6">
                          <h3 className="text-sm font-medium text-gray-900 mb-4">Additional Info</h3>
                          <dl className="space-y-2">
                            <div>
                              <dt className="text-sm font-medium text-gray-500">Lifecycle State</dt>
                              <dd className="mt-1">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {client.lifecycle_state.replace('_', ' ').toUpperCase()}
                                </span>
                              </dd>
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500">Last Activity</dt>
                              <dd className="mt-1 text-sm text-gray-900">
                                {formatDate(client.last_activity_at)}
                              </dd>
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500">Created</dt>
                              <dd className="mt-1 text-sm text-gray-900">
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
  );
}
