import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Client, ClientPaymentsResponse } from '@/types/client';
import { apiClient } from '@/lib/api';
import { dispatchManualPaymentCreated } from '@/lib/cache';
import {
  computeLeadFollowUpBar,
  followUpIsoToDateInput,
  dateInputToFollowUpIso,
  LEAD_PIPELINE_COLUMNS,
} from '@/lib/leadFollowUp';
import {
  getNextPipelineStage,
  getPipelineStageTitle,
  normalizeLifecycleColumn,
  withNormalizedLifecycle,
} from '@/lib/pipelineColumns';
import { BrevoStatus } from '@/types/integration';
import EmailComposer from '../brevo/EmailComposer';
import ClientCheckInCalendar from './ClientCheckInCalendar';
import ClientHealthScoreContent from './ClientHealthScoreContent';
import IntelligenceSection from './IntelligenceSection';
import OfferEnrollmentSection from './OfferEnrollmentSection';
import AIRecommendationsSection from './aiRecommendations/AIRecommendationsSection';

interface ClientDetailDrawerProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  /** After PATCH /clients/:id — merge into board + drawer before full reload (instant follow-up, etc.). */
  onClientSaved?: (client: Client) => void;
  healthRefreshToken?: number;
  /** Called when the in-drawer health score loads so the board card tag can update instantly. */
  onHealthScoreLoaded?: (clientId: string, score: number, grade: string) => void;
}

export default function ClientDetailDrawer({
  client,
  isOpen,
  onClose,
  onUpdate,
  onClientSaved,
  healthRefreshToken = 0,
  onHealthScoreLoaded,
}: ClientDetailDrawerProps) {
  const [savingFields, setSavingFields] = useState(false);
  const [advancingStage, setAdvancingStage] = useState(false);
  const [payments, setPayments] = useState<ClientPaymentsResponse | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [brevoStatus, setBrevoStatus] = useState<BrevoStatus | null>(null);
  const [brevoLoading, setBrevoLoading] = useState(false);
  const [addingToBrevo, setAddingToBrevo] = useState(false);
  const [clientInBrevo, setClientInBrevo] = useState(false);
  const [checkingBrevoContact, setCheckingBrevoContact] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailComposerDraft, setEmailComposerDraft] = useState<{
    initialSubject?: string;
    initialHtmlContent?: string;
    initialTextContent?: string;
  } | null>(null);
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
  const [engagementOpen, setEngagementOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    emails: [] as string[],
    phone: '',
    instagram: '',
    notes: '',
    program_start_date: '',
    program_end_date: '',
    follow_up_due_date: '',
  });
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const fieldBlurSave = () => {
    void saveClientFields();
  };

  useEffect(() => {
    if (!isOpen) setEngagementOpen(false);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setShowCheckInCalendar(false);
    
    if (client) {
      setFormData({
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        email: client.email || '',
        emails: Array.isArray(client.emails) ? [...client.emails] : [],
        phone: client.phone || '',
        instagram: client.instagram || '',
        notes: client.notes || '',
        program_start_date: client.program_start_date 
          ? new Date(client.program_start_date).toISOString().split('T')[0] 
          : '',
        program_end_date: client.program_end_date 
          ? new Date(client.program_end_date).toISOString().split('T')[0] 
          : '',
        follow_up_due_date: followUpIsoToDateInput(
          typeof client.meta?.follow_up_due_at === 'string' ? client.meta.follow_up_due_at : null,
        ),
      });
      loadPayments();
      loadBrevoStatus();
      loadNextCheckIn();
      
      // Automatically trigger automation when drawer opens
      // The get_client endpoint will update the state based on progress
      if (isOpen && client.program_start_date && client.program_end_date) {
        apiClient.getClient(client.id).then((updatedClient) => {
          const normalized = withNormalizedLifecycle(updatedClient);
          if (normalized.lifecycle_state !== client.lifecycle_state) {
            onClientSaved?.(normalized);
          }
        }).catch((error) => {
          console.error('[ClientDetailDrawer] Error fetching updated client:', error);
        });
      }
    }
  }, [client, isOpen]);

  // When the board triggers a refresh (Stripe/Whop/calendar sync), reload the drawer's
  // transactions + calendar summary even if the selected client didn't change.
  useEffect(() => {
    if (!isOpen || !client) return;
    loadPayments();
    loadNextCheckIn();
  }, [healthRefreshToken]);

  const getAllClientEmails = (c: Client) => {
    const set = new Set<string>();
    if (c.email?.trim()) set.add(c.email.trim());
    if (Array.isArray(c.emails)) c.emails.forEach((e) => e?.trim() && set.add(e.trim()));
    return Array.from(set);
  };

  // Check if client is in Brevo when Brevo status is loaded
  useEffect(() => {
    if (brevoStatus?.connected && client && getAllClientEmails(client).length > 0) {
      checkClientInBrevo();
    } else {
      setClientInBrevo(false);
    }
  }, [brevoStatus, client?.email, client?.emails]);

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
    const emails = client ? getAllClientEmails(client) : [];
    if (!client || emails.length === 0 || !brevoStatus?.connected) {
      setClientInBrevo(false);
      return;
    }

    setCheckingBrevoContact(true);
    try {
      const existingContact = await apiClient.getBrevoContactByEmail(emails[0]);
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
    const emails = client ? getAllClientEmails(client) : [];
    if (!client || emails.length === 0) {
      alert('Client must have at least one email address to send email');
      return;
    }
    setEmailComposerDraft(null);
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


  const saveClientFields = async (data?: typeof formData) => {
    if (!client || savingFields || advancingStage) return;
    const snapshot = data ?? formDataRef.current;
    setSavingFields(true);
    try {
      const updateData: Record<string, unknown> = {};

      const setIfChanged = (key: keyof typeof snapshot, value: unknown, current: unknown) => {
        const normalized = value === '' ? null : value;
        const currentNorm = current === '' || current === undefined ? null : current;
        if (JSON.stringify(normalized) !== JSON.stringify(currentNorm)) {
          updateData[key as string] = normalized;
        }
      };

      setIfChanged('first_name', snapshot.first_name, client.first_name ?? '');
      setIfChanged('last_name', snapshot.last_name, client.last_name ?? '');
      setIfChanged('email', snapshot.email || null, client.email ?? null);
      setIfChanged(
        'emails',
        snapshot.emails?.length ? snapshot.emails : null,
        client.emails?.length ? client.emails : null,
      );
      setIfChanged('phone', snapshot.phone, client.phone ?? '');
      setIfChanged('instagram', snapshot.instagram, client.instagram ?? '');
      setIfChanged('notes', snapshot.notes, client.notes ?? '');

      const currentStartDate = client.program_start_date
        ? new Date(client.program_start_date).toISOString().split('T')[0]
        : '';
      const currentEndDate = client.program_end_date
        ? new Date(client.program_end_date).toISOString().split('T')[0]
        : '';

      if (snapshot.program_start_date !== currentStartDate) {
        if (snapshot.program_start_date && snapshot.program_start_date.trim() !== '') {
          updateData.program_start_date = new Date(snapshot.program_start_date + 'T00:00:00').toISOString();
        } else {
          updateData.program_start_date = null;
        }
      }

      if (snapshot.program_end_date !== currentEndDate) {
        if (snapshot.program_end_date && snapshot.program_end_date.trim() !== '') {
          updateData.program_end_date = new Date(snapshot.program_end_date + 'T00:00:00').toISOString();
        } else {
          updateData.program_end_date = null;
        }
      }

      const isLeadClient =
        (LEAD_PIPELINE_COLUMNS as readonly string[]).includes(client.lifecycle_state);
      if (isLeadClient) {
        const currentInput = followUpIsoToDateInput(
          typeof client.meta?.follow_up_due_at === 'string' ? client.meta.follow_up_due_at : null,
        );
        const nextInput = (snapshot.follow_up_due_date || '').trim();
        if (currentInput !== nextInput) {
          const nextMeta: Record<string, unknown> = {
            ...(client.meta && typeof client.meta === 'object' ? { ...client.meta } : {}),
          };
          if (nextInput) {
            try {
              nextMeta.follow_up_due_at = dateInputToFollowUpIso(nextInput);
            } catch {
              alert('Invalid follow-up date');
              setSavingFields(false);
              return;
            }
          } else {
            delete nextMeta.follow_up_due_at;
          }
          updateData.meta = nextMeta;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return;
      }

      const updated = await apiClient.updateClient(client.id, updateData);
      onClientSaved?.(withNormalizedLifecycle(updated));
    } catch (error) {
      console.error('Failed to update client:', error);
      alert('Failed to update client. Please try again.');
    } finally {
      setSavingFields(false);
    }
  };

  const handleAdvanceStage = async () => {
    if (!client || advancingStage) return;
    const normalizedLifecycle =
      normalizeLifecycleColumn(client.lifecycle_state) ?? client.lifecycle_state;
    const nextStage = getNextPipelineStage(normalizedLifecycle);
    if (!nextStage) return;

    const previous = client;
    const updateData: Record<string, unknown> = { lifecycle_state: nextStage.id };
    if (normalizedLifecycle === 'offboarding' && nextStage.id !== 'offboarding') {
      updateData.program_progress_percent = null;
      updateData.program_duration_days = null;
      updateData.program_start_date = null;
      updateData.program_end_date = null;
    }

    const optimistic = withNormalizedLifecycle({
      ...client,
      lifecycle_state: nextStage.id,
    });
    onClientSaved?.(optimistic);

    setAdvancingStage(true);
    try {
      const updated = await apiClient.updateClient(client.id, updateData);
      onClientSaved?.(withNormalizedLifecycle(updated));
    } catch (error: unknown) {
      onClientSaved?.(previous);
      console.error('Failed to advance client stage:', error);
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to move client to the next stage. Please try again.';
      alert(typeof detail === 'string' ? detail : 'Failed to move client to the next stage. Please try again.');
    } finally {
      setAdvancingStage(false);
    }
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

  const followUpBar = useMemo(() => {
    if (!client) return null;
    const isLeadLocal =
      (LEAD_PIPELINE_COLUMNS as readonly string[]).includes(client.lifecycle_state);
    if (!isLeadLocal) return null;
    let effective: Client = client;
    const baseMeta: Record<string, unknown> =
      client.meta && typeof client.meta === 'object' ? { ...client.meta } : {};
    const trimmed = formData.follow_up_due_date?.trim();
    if (trimmed) {
      try {
        baseMeta.follow_up_due_at = dateInputToFollowUpIso(trimmed);
        effective = { ...client, meta: baseMeta as Client['meta'] };
      } catch {
        effective = client;
      }
    } else {
      delete baseMeta.follow_up_due_at;
      effective = { ...client, meta: baseMeta as Client['meta'] };
    }
    return computeLeadFollowUpBar(effective);
  }, [client, formData.follow_up_due_date]);

  if (!client) return null;

  const isLead =
    (LEAD_PIPELINE_COLUMNS as readonly string[]).includes(client.lifecycle_state);

  const normalizedLifecycle =
    normalizeLifecycleColumn(client.lifecycle_state) ?? client.lifecycle_state;
  const nextStage = getNextPipelineStage(normalizedLifecycle);
  const currentStageTitle = getPipelineStageTitle(normalizedLifecycle);

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

  const totalPaid = payments?.total_amount_paid || (client?.lifetime_revenue_cents ?? 0) / 100;
  const recordedPaidCents =
    payments?.total_amount_paid_cents ?? client?.lifetime_revenue_cents ?? 0;
  const planContractCents = client.offer_enrollment?.total_cents ?? 0;
  const planOwedCents =
    planContractCents > 0 ? Math.max(0, planContractCents - recordedPaidCents) : null;

  return (
    <>
    <Transition show={isOpen} as={Fragment}>
      <Dialog 
        as="div" 
        className="relative z-50" 
        onClose={onClose}
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
                <Dialog.Panel className="pointer-events-auto w-screen max-w-2xl flex h-full flex-col bg-white dark:glass-card rounded-lg shadow-lg border border-gray-200 dark:border-white/10">
                  <div className="flex flex-1 min-h-0 overflow-hidden flex flex-col">
                    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    <div className="flex-shrink-0 px-4 py-4 sm:px-6 border-b border-gray-200 dark:border-white/10">
                        <div className="flex items-center justify-between gap-3">
                        <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0">
                          Client Profile
                        </Dialog.Title>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {savingFields ? (
                                <span className="text-xs text-gray-400 dark:text-gray-500" aria-live="polite">
                                  Saving…
                                </span>
                              ) : null}
                              {client?.first_name && client?.last_name && brevoStatus?.connected && (
                                clientInBrevo && getAllClientEmails(client).length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={handleEmailClient}
                                    disabled={checkingBrevoContact}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                                    title="Send email to this client via Brevo"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    {checkingBrevoContact ? 'Checking...' : 'Email'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={handleAddToBrevo}
                                    disabled={addingToBrevo || getAllClientEmails(client).length === 0}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                                    title="Add this client as a contact in Brevo"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                    </svg>
                                    {addingToBrevo ? 'Adding...' : 'Add to Brevo'}
                                  </button>
                                )
                              )}
                              <button
                                type="button"
                                onClick={() => setShowCheckInCalendar(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-green-300 dark:border-green-500/50 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                                title="View and sync check-in calendar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Calendar
                              </button>
                              {nextStage ? (
                                <button
                                  type="button"
                                  onClick={() => void handleAdvanceStage()}
                                  disabled={advancingStage || savingFields}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-blue-300 dark:border-blue-500/50 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                                  title={`Move from ${currentStageTitle} to ${nextStage.title}`}
                                >
                                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                  </svg>
                                  <span className="truncate max-w-[10rem] sm:max-w-none">
                                    {advancingStage ? 'Moving…' : `→ ${nextStage.title}`}
                                  </span>
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={onClose}
                                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                aria-label="Close"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                        </div>
                    </div>

                    {/* Content - scrollable: holistic profile → engagement → checklist */}
                    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                      <div className="space-y-6">
                        <IntelligenceSection
                          client={client}
                          refreshToken={healthRefreshToken}
                          showChecklist={false}
                          onClientUpdated={onUpdate}
                          onClientPatched={onClientSaved}
                          onOpenEmailComposerWithDraft={(draft) => {
                            const emails = getAllClientEmails(client);
                            if (emails.length === 0) {
                              alert('Add an email address to this client to compose a message.');
                              return;
                            }
                            setEmailComposerDraft({
                              initialSubject: draft.subject,
                              initialHtmlContent: draft.bodyHtml,
                              initialTextContent: draft.bodyText,
                            });
                            setShowEmailComposer(true);
                          }}
                        />

                        <div className="border-t border-gray-200 dark:border-white/10 pt-4">
                          <button
                            type="button"
                            onClick={() => setEngagementOpen((o) => !o)}
                            className="flex w-full items-center justify-between gap-2 text-left rounded-lg px-1 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                            aria-expanded={engagementOpen}
                          >
                            <span>Engagement (health score)</span>
                            <svg
                              className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${engagementOpen ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {engagementOpen ? (
                            <div className="mt-3">
                              <ClientHealthScoreContent
                                client={client}
                                refreshToken={healthRefreshToken}
                                engagementStrip
                                showFactors={false}
                                onScoreLoaded={onHealthScoreLoaded}
                              />
                            </div>
                          ) : null}
                        </div>

                        <AIRecommendationsSection
                          client={client}
                          refreshToken={healthRefreshToken}
                          embedded
                          onOpenEmailComposerWithDraft={(draft) => {
                            const emails = getAllClientEmails(client);
                            if (emails.length === 0) {
                              alert('Add an email address to this client to compose a message.');
                              return;
                            }
                            setEmailComposerDraft({
                              initialSubject: draft.subject,
                              initialHtmlContent: draft.bodyHtml,
                              initialTextContent: draft.bodyText,
                            });
                            setShowEmailComposer(true);
                          }}
                        />

                        {/* Basic Info */}
                        <div>
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Contact Information</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <dl className="space-y-4">
                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">First Name</dt>
                              <input
                                type="text"
                                value={formData.first_name}
                                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                onBlur={fieldBlurSave}
                                className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              />
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Last Name</dt>
                              <input
                                type="text"
                                value={formData.last_name}
                                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                onBlur={fieldBlurSave}
                                className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              />
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Primary email</dt>
                              <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                onBlur={fieldBlurSave}
                                className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100 mb-1">Additional emails</dt>
                              <div className="space-y-2">
                                {formData.emails.map((e, i) => (
                                  <div key={i} className="flex gap-2 items-center">
                                    <input
                                      type="email"
                                      value={e}
                                      onChange={(ev) => {
                                        const next = [...formData.emails];
                                        next[i] = ev.target.value;
                                        setFormData({ ...formData, emails: next });
                                      }}
                                      onBlur={fieldBlurSave}
                                      className="flex-1 rounded-md glass-input focus:ring-blue-500 sm:text-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = {
                                          ...formData,
                                          emails: formData.emails.filter((_, j) => j !== i),
                                        };
                                        setFormData(next);
                                        void saveClientFields(next);
                                      }}
                                      className="text-red-400 hover:text-red-600 text-sm"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = { ...formData, emails: [...formData.emails, ''] };
                                    setFormData(next);
                                  }}
                                  className="text-sm text-primary-500 hover:text-primary-600"
                                >
                                  + Add email
                                </button>
                              </div>
                            </div>

                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Phone / SMS</dt>
                              <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                onBlur={fieldBlurSave}
                                placeholder="+1234567890"
                                className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              />
                            </div>
                          </dl>
                          
                          <dl className="space-y-4">
                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Instagram</dt>
                              <input
                                type="text"
                                value={formData.instagram}
                                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                                onBlur={fieldBlurSave}
                                placeholder="@username"
                                className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              />
                            </div>
                          </dl>
                          </div>
                        </div>

                        {/* Financial Summary */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-6">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Financial Summary</h3>
                          <dl className="space-y-3">
                            <div>
                              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                Total amount paid
                              </dt>
                              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                {formatCurrency(totalPaid)}
                              </dd>
                              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                                Plan “paid” matches this total.
                              </p>
                            </div>

                            {client.offer_enrollment?.slot && planContractCents > 0 && (
                              <div className="rounded-lg bg-gray-50/80 dark:bg-white/[0.04] px-3 py-2 space-y-1">
                                <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                  Offer plan
                                </dt>
                                <dd className="text-sm text-gray-900 dark:text-gray-100">
                                  {client.offer_enrollment.name_snapshot ||
                                    client.offer_enrollment.slot.replace(/:/g, ' · ')}
                                </dd>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-gray-700 dark:text-gray-300">
                                  <span>
                                    Contract{' '}
                                    <strong>{formatCurrency(planContractCents / 100)}</strong>
                                  </span>
                                  <span>
                                    Paid <strong>{formatCurrency(recordedPaidCents / 100)}</strong>
                                  </span>
                                  {planOwedCents != null && (
                                    <span className="text-gray-900 dark:text-gray-100">
                                      Owed <strong>{formatCurrency(planOwedCents / 100)}</strong>
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            <div>
                              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                Estimated MRR
                              </dt>
                              <dd className="mt-0.5 text-sm tabular-nums text-gray-900 dark:text-gray-100">
                                {formatCurrency(client.estimated_mrr || 0)}
                              </dd>
                            </div>

                            {client.stripe_customer_id && (
                              <div>
                                <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Stripe Customer ID</dt>
                                <dd className="mt-1 text-xs text-gray-900 dark:text-gray-100 font-mono break-all">
                                  {client.stripe_customer_id}
                                </dd>
                              </div>
                            )}
                          </dl>

                          <OfferEnrollmentSection
                            client={client}
                            recordedPaidCents={recordedPaidCents}
                            minimal
                            onSaved={(updated) => {
                              if (updated) onClientSaved?.(updated);
                              else void loadPayments();
                            }}
                          />
                        </div>

                        {/* Check-Ins Section */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-6">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Check-Ins</h3>
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
                                No upcoming check-ins. Use the <strong>Calendar</strong> button in the header to sync with your calendar and view check-in history.
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
                                    dispatchManualPaymentCreated();
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
                            <div>
                              <dt className="text-sm font-medium text-gray-500 dark:text-gray-100 mb-1">Program Start Date</dt>
                              <input
                                type="date"
                                value={formData.program_start_date}
                                onChange={(e) => setFormData({ ...formData, program_start_date: e.target.value })}
                                onBlur={fieldBlurSave}
                                className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              />
                            </div>
                            <div>
                              <dt className="text-sm font-medium text-gray-500 mb-1">Program End Date</dt>
                              <input
                                type="date"
                                value={formData.program_end_date}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    program_end_date: e.target.value,
                                  })
                                }
                                onBlur={fieldBlurSave}
                                min={formData.program_start_date || undefined}
                                className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              />
                              <p className="mt-1 text-xs text-gray-500">
                                Client will automatically move to offboarding at 75% and dead when expired
                              </p>
                            </div>
                            {client.program_duration_days ? (
                              <div>
                                <dt className="text-sm font-medium text-gray-500 dark:text-gray-100">Program Duration</dt>
                                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                  {client.program_duration_days} days
                                </dd>
                              </div>
                            ) : null}
                            {!isLead &&
                              client.program_progress_percent !== undefined &&
                              client.program_progress_percent !== null && (
                                <div>
                                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-100 mb-2">Program Progress</dt>
                                  <dd className="mt-1">
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-900 dark:text-gray-100">
                                          {client.program_progress_percent.toFixed(1)}% Complete
                                        </span>
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
                                          style={{
                                            width: `${Math.min(100, Math.max(0, client.program_progress_percent))}%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </dd>
                                </div>
                              )}
                            {isLead ? (
                              <div>
                                <dt className="text-sm font-medium text-gray-500 dark:text-gray-100 mb-1">
                                  Follow-up due date
                                </dt>
                                <input
                                  type="date"
                                  value={formData.follow_up_due_date}
                                  onChange={(e) =>
                                    setFormData({ ...formData, follow_up_due_date: e.target.value })
                                  }
                                  onBlur={fieldBlurSave}
                                  className="mt-1 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  Optional. Clear the field to use a 14-day window from last activity (see timer
                                  below). Dates use your local calendar day.
                                </p>
                              </div>
                            ) : null}
                            {isLead && followUpBar ? (
                              <div>
                                <dt className="text-sm font-medium text-gray-500 dark:text-gray-100 mb-2">Follow-up</dt>
                                <dd className="mt-1">
                                  <div
                                    className="space-y-1"
                                    title={
                                      followUpBar.hasExplicitDue
                                        ? 'Specific follow-up date (profile or call insight)'
                                        : 'Default 14 days from last activity (or created date)'
                                    }
                                  >
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-gray-900 dark:text-gray-100">
                                        {followUpBar.percent.toFixed(1)}% to due date
                                      </span>
                                      <span className="text-gray-500 dark:text-gray-100">
                                        {followUpBar.percent >= 100 ? 'Due' : 'Open'}
                                      </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-3">
                                      <div
                                        className={`h-3 rounded-full transition-all ${
                                          followUpBar.percent >= 100
                                            ? 'bg-red-500'
                                            : followUpBar.percent >= 75
                                              ? 'bg-yellow-500'
                                              : 'bg-blue-500'
                                        }`}
                                        style={{
                                          width: `${Math.min(100, Math.max(0, followUpBar.percent))}%`,
                                        }}
                                      />
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-100 mt-1">
                                      {followUpBar.subtitle}
                                    </p>
                                  </div>
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        </div>

                        {/* Notes */}
                        <div className="border-t border-gray-200 dark:border-white/10 pt-6">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">Notes</h3>
                          <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            onBlur={fieldBlurSave}
                            rows={6}
                            className="block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            placeholder="Add notes about this client..."
                          />
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
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>

    {/* Calendar modal - overlay to the right of the drawer (original position) */}
    {showCheckInCalendar && client && (
      <ClientCheckInCalendar
        client={client}
        isOpen={showCheckInCalendar}
        onClose={() => {
          setShowCheckInCalendar(false);
          loadNextCheckIn();
        }}
        onCloseBoth={() => {
          setShowCheckInCalendar(false);
          onClose();
        }}
        inline={false}
      />
    )}

    {/* Email Composer Modal */}
    {showEmailComposer && client && getAllClientEmails(client).length > 0 && (
      <EmailComposer
        key={`email-${client.id}-${emailComposerDraft?.initialSubject ?? 'blank'}-${(emailComposerDraft?.initialTextContent ?? '').length}`}
        recipients={getAllClientEmails(client).map((email) => ({
          email,
          name: client.first_name && client.last_name ? `${client.first_name} ${client.last_name}` : undefined,
        }))}
        initialSubject={emailComposerDraft?.initialSubject}
        initialHtmlContent={emailComposerDraft?.initialHtmlContent}
        initialTextContent={emailComposerDraft?.initialTextContent}
        onClose={() => {
          setShowEmailComposer(false);
          setEmailComposerDraft(null);
        }}
        onSuccess={() => {
          setShowEmailComposer(false);
          setEmailComposerDraft(null);
        }}
      />
    )}

    </>
  );
}
