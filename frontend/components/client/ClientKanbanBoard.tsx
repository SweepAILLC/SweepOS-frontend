import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { apiClient, peekCachedClientsList } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { recipientsFromClients, getEmailsForClient } from '@/lib/clientEmails';
import { compareClientsForBoardColumn, isLeadPipelineColumn, type BoardLifecycleColumn } from '@/lib/leadFollowUp';
import {
  PIPELINE_COLUMNS,
  normalizeLifecycleColumn,
  withNormalizedLifecycle,
  type PipelineColumnId,
} from '@/lib/pipelineColumns';
import {
  CALL_INSIGHT_BOARD_TAGS,
  formatInsightTagLabel,
} from '@/lib/callInsightChips';
import { clientMatchesBoardSearch } from '@/lib/clientBoardSearch';
import { hasOutstandingOfferBalance } from '@/lib/clientOfferBalance';
import { Client } from '@/types/client';
import type { BrevoStatus } from '@/types/integration';
import { STRIPE_DATA_UPDATED_EVENT, TERMINAL_CLIENTS_UPDATED_EVENT, invalidateStripeAndTerminalAfterWebhook } from '@/lib/cache';
import {
  getPipelineClients,
  patchPipelineClient,
  setPipelineClients,
  subscribePipelineClients,
} from '@/lib/pipelineStore';
import ClientCard, { MERGE_DROP_ID, SLOT_DROP_ID } from './ClientCard';
import ClientDetailDrawer from './ClientDetailDrawer';
import { CALL_INSIGHTS_REANALYZED_EVENT, CLIENT_MERGED_EVENT } from './IntelligenceSection';
import ShinyButton from '../ui/ShinyButton';
import EmailComposer from '../brevo/EmailComposer';

const COLUMNS = PIPELINE_COLUMNS;

type ColumnId = PipelineColumnId;

function hydratePipelineClients(): Client[] {
  const fromStore = getPipelineClients();
  if (fromStore.length > 0) return fromStore;
  const cached = peekCachedClientsList();
  if (!cached?.length) return [];
  return cached.map((client) => {
    const column = normalizeLifecycleColumn(client.lifecycle_state);
    return column && column !== client.lifecycle_state
      ? { ...client, lifecycle_state: column }
      : client;
  });
}

interface ClientKanbanBoardProps {
  filteredColumn?: string | null;
  onLoadComplete?: () => void;
  /** False when pipeline tab is hidden but kept mounted. */
  isActive?: boolean;
  /** Clear snapshot column filter when a client leaves the active filter column. */
  onClientLifecycleChanged?: (columnId: PipelineColumnId) => void;
}

export default function ClientKanbanBoard({
  filteredColumn = null,
  onLoadComplete,
  isActive = true,
  onClientLifecycleChanged,
}: ClientKanbanBoardProps = {}) {
  const [clients, setClients] = useState<Client[]>(() => hydratePipelineClients());
  const [loading, setLoading] = useState(() => hydratePipelineClients().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<ColumnId | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  /** Empty = no tag filter. Non-empty = show clients that have any selected insight tag (OR). */
  const [selectedInsightTags, setSelectedInsightTags] = useState<Set<string>>(() => new Set());
  /** When true, only clients with an outstanding offer balance (same rule as the card chip). */
  const [balanceDueFilter, setBalanceDueFilter] = useState(false);
  const hasCalledOnLoadComplete = useRef(false);
  const pipelineLoadStartedRef = useRef(false);
  const [createFormData, setCreateFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    instagram: '',
    lifecycle_state: 'nurturing' as ColumnId,
    notes: '',
  });

  const resetCreateForm = () => {
    setCreateFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      instagram: '',
      lifecycle_state: 'nurturing',
      notes: '',
    });
  };
  const [syncingRefreshing, setSyncingRefreshing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [mergingCards, setMergingCards] = useState(false);
  const [callInsightTags, setCallInsightTags] = useState<Record<string, { tags: string[]; headline: string }>>({});
  const [healthRefreshToken, setHealthRefreshToken] = useState(0);
  const [brevoStatus, setBrevoStatus] = useState<BrevoStatus | null>(null);
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<Array<{ email: string; name?: string }>>([]);
  const [emailComposerKey, setEmailComposerKey] = useState(0);
  const [healthScores, setHealthScores] = useState<Record<string, { score: number; grade: string }>>({});
  const [activeDragClient, setActiveDragClient] = useState<Client | null>(null);
  const [filtersDropdownOpen, setFiltersDropdownOpen] = useState(false);
  const filtersDropdownRef = useRef<HTMLDivElement>(null);

  // Refs to avoid re-creating poll intervals with stale state
  const clientsRef = useRef<Client[]>([]);
  const selectedClientIdRef = useRef<string | null>(null);
  const loadInFlightRef = useRef<Promise<Client[] | undefined> | null>(null);
  const tagsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!filtersDropdownOpen) return;
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const el = filtersDropdownRef.current;
      if (el && !el.contains(e.target as Node)) setFiltersDropdownOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltersDropdownOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersDropdownOpen]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const clientIdsKey = useMemo(
    () => clients.map((c) => c.id).filter(Boolean).join(','),
    [clients],
  );

  useEffect(() => {
    if (!isActive) return;
    const ids = clientIdsKey ? clientIdsKey.split(',') : [];
    if (ids.length === 0) {
      setHealthScores({});
      return;
    }
    let cancelled = false;
    void apiClient
      .getClientsHealthScores(ids)
      .then((map) => {
        if (cancelled) return;
        const next: Record<string, { score: number; grade: string }> = {};
        for (const id of ids) {
          const row = map[id];
          if (row && typeof row.score === 'number') {
            next[id] = { score: row.score, grade: row.grade };
          }
        }
        setHealthScores(next);
      })
      .catch(() => {
        if (!cancelled) setHealthScores({});
      });
    return () => {
      cancelled = true;
    };
  }, [clientIdsKey, isActive]);

  // Load board when the pipeline tab is first opened (always fetch — do not skip due to stale cache/store).
  useEffect(() => {
    if (!isActive) return;
    if (pipelineLoadStartedRef.current) return;
    pipelineLoadStartedRef.current = true;
    void loadClients(true, true, false, false).catch((err) => {
      console.error('[KanbanBoard] Initial load failed:', err);
    });
  }, [isActive]);

  useEffect(() => {
    return subscribePipelineClients(() => {
      const store = getPipelineClients();
      if (store.length === 0) return;
      clientsRef.current = store;
      setClients([...store]);
    });
  }, []);

  useEffect(() => {
    if (!isActive) return;
    if (clients.length === 0) return;
    setPipelineClients(clients);
  }, [clients, isActive]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await apiClient.getBrevoStatus();
        if (!cancelled) setBrevoStatus(s);
      } catch {
        if (!cancelled) setBrevoStatus({ connected: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive]);

  // When Stripe sync/webhook updates land, lightly refresh (no calendar sync).
  useEffect(() => {
    const onStripe = () => {
      if (!isActive) return;
      void loadClients(false, true, true, true, false);
    };
    window.addEventListener(STRIPE_DATA_UPDATED_EVENT, onStripe as EventListener);
    return () => window.removeEventListener(STRIPE_DATA_UPDATED_EVENT, onStripe as EventListener);
  }, [isActive]);

  // Keep refs in sync
  clientsRef.current = clients;
  selectedClientIdRef.current = selectedClient?.id ?? null;

  const refreshBoardTags = useCallback(async () => {
    const ids = clientsRef.current.map((c) => c.id);
    if (ids.length === 0) {
      setCallInsightTags({});
      return;
    }
    try {
      const tagMap = await apiClient.getClientsCallInsightTags(ids);
      setCallInsightTags((prev) => {
        const next: Record<string, { tags: string[]; headline: string }> = {};
        for (const c of clientsRef.current) {
          next[c.id] = tagMap[c.id] ?? prev[c.id] ?? { tags: [], headline: '' };
        }
        return next;
      });
    } catch (tagErr) {
      console.warn('[KanbanBoard] Failed to refresh call insight tags:', tagErr);
    }
  }, []);

  const scheduleBoardTagRefresh = useCallback(() => {
    if (tagsDebounceRef.current) clearTimeout(tagsDebounceRef.current);
    tagsDebounceRef.current = setTimeout(() => {
      tagsDebounceRef.current = null;
      void refreshBoardTags();
    }, 500);
  }, [refreshBoardTags]);

  const loadClients = async (
    forceRefresh = false,
    skipSync = false,
    notifyPipeline = true,
    background = false,
    fetchTags = true,
    /** When true (manual refresh), calendar sync may auto-move pipeline stages. */
    applyPipelineRules = false,
  ): Promise<Client[] | undefined> => {
    if (loadInFlightRef.current) {
      return loadInFlightRef.current;
    }

    const run = async (): Promise<Client[] | undefined> => {
      if (background) {
        setRefreshing(true);
      } else if (clientsRef.current.length === 0) {
        setLoading(true);
      }
      try {
        if (!skipSync) {
          try {
            await apiClient.syncCheckIns(
              applyPipelineRules ? undefined : { applyPipelineRules: false },
            );
          } catch (syncErr) {
            console.warn('[KanbanBoard] Check-in sync failed (board will still load):', syncErr);
          }
        }
        const data = await apiClient.getClients(undefined, forceRefresh);
        const normalized = (data as Client[]).map((client) => {
          const column = normalizeLifecycleColumn(client.lifecycle_state);
          return column && column !== client.lifecycle_state
            ? { ...client, lifecycle_state: column }
            : client;
        });

        clientsRef.current = normalized;
        setClients([...normalized]);
        setPipelineClients(normalized);

        if (notifyPipeline && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(TERMINAL_CLIENTS_UPDATED_EVENT));
        }

        if (fetchTags && normalized.length > 0) {
          await refreshBoardTags();
        } else if (normalized.length === 0) {
          setCallInsightTags({});
        }

        return normalized;
      } catch (error) {
        console.error('Failed to load clients:', error);
        throw error;
      } finally {
        setLoading(false);
        setRefreshing(false);
        if (!hasCalledOnLoadComplete.current && onLoadComplete) {
          hasCalledOnLoadComplete.current = true;
          onLoadComplete();
        }
      }
    };

    const promise = run().finally(() => {
      loadInFlightRef.current = null;
    });
    loadInFlightRef.current = promise;
    return promise;
  };

  const normalizeClient = useCallback(
    (client: Client): Client => withNormalizedLifecycle(client),
    [],
  );

  const applyClientUpdate = useCallback(
    (updated: Client) => {
      if (!updated?.id) return;
      const normalized = normalizeClient(updated);
      const column =
        normalizeLifecycleColumn(normalized.lifecycle_state) ??
        (normalized.lifecycle_state as PipelineColumnId);
      setClients((prev) => {
        const exists = prev.some((c) => c.id === normalized.id);
        if (exists) {
          return prev.map((c) => (c.id === normalized.id ? normalized : c));
        }
        return [normalized, ...prev];
      });
      setSelectedClient((sel) => (sel?.id === normalized.id ? normalized : sel));
      patchPipelineClient(normalized);
      if (column) onClientLifecycleChanged?.(column);
    },
    [normalizeClient, onClientLifecycleChanged],
  );

  const refreshSelectedClient = useCallback(async () => {
    const id = selectedClientIdRef.current;
    if (!id) return;
    try {
      const updated = await apiClient.getClient(id);
      applyClientUpdate(withNormalizedLifecycle(updated));
    } catch {
      /* keep optimistic board state */
    }
  }, [applyClientUpdate]);

  // Poll call-insight tags while pipeline tab is visible (debounced on bulk updates).
  useEffect(() => {
    if (!isActive) return;
    void refreshBoardTags();
    const interval = setInterval(() => void refreshBoardTags(), 60000);
    const onClientsUpdated = () => scheduleBoardTagRefresh();
    window.addEventListener(TERMINAL_CLIENTS_UPDATED_EVENT, onClientsUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener(TERMINAL_CLIENTS_UPDATED_EVENT, onClientsUpdated);
      if (tagsDebounceRef.current) clearTimeout(tagsDebounceRef.current);
    };
  }, [isActive, refreshBoardTags, scheduleBoardTagRefresh]);

  useEffect(() => {
    const onCallInsightsReanalyzed = () => scheduleBoardTagRefresh();
    window.addEventListener(CALL_INSIGHTS_REANALYZED_EVENT, onCallInsightsReanalyzed);
    return () => window.removeEventListener(CALL_INSIGHTS_REANALYZED_EVENT, onCallInsightsReanalyzed);
  }, [scheduleBoardTagRefresh]);

  useEffect(() => {
    const handleStripeConnected = () => {
      setTimeout(() => {
        void loadClients(false, true, true, true, false);
      }, 3000);
    };
    window.addEventListener('stripe-connected', handleStripeConnected);
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('stripe_connected') === 'true') {
      handleStripeConnected();
    }
    return () => window.removeEventListener('stripe-connected', handleStripeConnected);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    const c = clients.find((x) => x.id === id);
    setActiveDragClient(c ?? null);
  };

  const handleDragCancel = () => {
    setActiveDragClient(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setDragOverId(over ? (over.id as string) : null);
    if (over && COLUMNS.some(col => col.id === over.id)) {
      setActiveColumn(over.id as ColumnId);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveColumn(null);
    setDragOverId(null);

    if (!over) {
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    const findClientBySortableId = (sortableId: string): Client | undefined => {
      return filteredClients.find((c) => c.id === sortableId);
    };

    const draggedClient = findClientBySortableId(activeId);
    if (!draggedClient) {
      console.error('[KANBAN] Could not find dragged client with sortable ID:', activeId);
      return;
    }

    // Drop on another card = merge (dragged card merges into target)
    if (overId.startsWith('merge-')) {
      const targetId = overId.replace(/^merge-/, '');
      if (targetId && targetId !== activeId) {
        const targetClient = findClientBySortableId(targetId);
        if (targetClient) {
          const draggedName = [draggedClient.first_name, draggedClient.last_name].filter(Boolean).join(' ') || draggedClient.email || 'Unknown';
          const targetName = [targetClient.first_name, targetClient.last_name].filter(Boolean).join(' ') || targetClient.email || 'Unknown';
          const confirmed = window.confirm(
            `Merge "${draggedName}" into "${targetName}"? This will combine their data into one client and remove the other card.`
          );
          if (!confirmed) return;
          setMergingCards(true);
          try {
            const keptClient = await apiClient.mergeClients([draggedClient.id, targetClient.id]);
            const keptId = keptClient?.id;
            const removedId = keptId === draggedClient.id ? targetClient.id : draggedClient.id;
            // Optimistically remove the merged-away card so it disappears immediately
            setClients((prev) =>
              prev.filter((c) => c.id !== removedId).map((c) => (c.id === keptId && keptClient ? { ...c, ...keptClient } : c))
            );
            // If drawer was showing the removed client, show the kept client instead
            if (selectedClient?.id === removedId) {
              setSelectedClient(keptClient || selectedClient);
            } else if (selectedClient?.id === keptId && keptClient) {
              setSelectedClient(keptClient);
            }
            if (keptId && typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent(CLIENT_MERGED_EVENT, { detail: { keptClientId: keptId } })
              );
            }
          } catch (err: any) {
            alert(err?.response?.data?.detail || 'Failed to merge clients.');
          } finally {
            setMergingCards(false);
          }
        }
        return;
      }
    }

    // Drop on slot above a card = insert above (cross-column move) or merge slot in another column
    if (overId.startsWith('slot-')) {
      const insertAboveClientId = overId.replace(/^slot-/, '');
      const targetClient = findClientBySortableId(insertAboveClientId);
      if (targetClient) {
        const newColumnId =
          normalizeLifecycleColumn(targetClient.lifecycle_state) ??
          (targetClient.lifecycle_state as ColumnId);
        const currentColumnId = normalizeLifecycleColumn(draggedClient.lifecycle_state);
        if (newColumnId === currentColumnId) {
          // Column order is automatic (follow-up urgency + health); ignore same-column reorder.
          return;
        }
        await updateClientState(draggedClient.id, newColumnId, draggedClient);
      }
      return;
    }

    // Drop on column
    const columnId = COLUMNS.find(col => col.id === overId);
    if (columnId) {
      await updateClientState(draggedClient.id, columnId.id, draggedClient);
      return;
    }

    // Fallback: over is sortable id (card) – cross-column move only (same-column order is automatic)
    const targetClient = findClientBySortableId(overId);
    if (targetClient) {
      const newColumnId =
        normalizeLifecycleColumn(targetClient.lifecycle_state) ??
        (targetClient.lifecycle_state as ColumnId);
      const currentColumnId = normalizeLifecycleColumn(draggedClient.lifecycle_state);
      if (newColumnId === currentColumnId) {
        return;
      }
      await updateClientState(draggedClient.id, newColumnId, draggedClient);
    }
  };

  const updateClientState = async (clientId: string, newColumnId: ColumnId, draggedClient?: Client) => {
    // If draggedClient is provided (from merged clients), use it directly
    // Otherwise, find the client in the raw clients array
    let client = draggedClient;
    if (!client) {
      client = clients.find((c) => c.id === clientId);
    }
    
    if (!client) {
      console.error('[KANBAN] Could not find client with ID:', clientId);
      return;
    }

    const targetColumn =
      normalizeLifecycleColumn(newColumnId) ?? (newColumnId as PipelineColumnId);
    const currentColumn = normalizeLifecycleColumn(client.lifecycle_state);

    // Don't update if already in the target column (including legacy aliases e.g. warm_lead → booked)
    if (currentColumn === targetColumn) {
      return;
    }

    // Check if moving FROM offboarding to another column
    // If so, reset program fields
    const isMovingFromOffboarding = currentColumn === 'offboarding' && targetColumn !== 'offboarding';
    
    // Prepare update data
    const updateData: any = {
      lifecycle_state: targetColumn,
    };
    
    // If moving from offboarding, reset program fields
    if (isMovingFromOffboarding) {
      updateData.program_progress_percent = null;
      updateData.program_duration_days = null;
      updateData.program_start_date = null;
      updateData.program_end_date = null;
      console.log(`[KANBAN] Moving client from offboarding to ${newColumnId}, resetting program fields`);
    }

    const buildOptimistic = (base: Client): Client => {
      const next: Client = { ...base, lifecycle_state: targetColumn };
      if (isMovingFromOffboarding) {
        next.program_progress_percent = undefined;
        next.program_duration_days = undefined;
        next.program_start_date = undefined;
        next.program_end_date = undefined;
      }
      return next;
    };

    const previous = client;
    applyClientUpdate(buildOptimistic(previous));

    try {
      const updated = await apiClient.updateClient(clientId, updateData);
      applyClientUpdate(updated);
    } catch (error) {
      applyClientUpdate(previous);
      console.error('Failed to update client:', error);
      alert('Failed to update client. Please try again.');
    }
  };

  const normalizeEmail = (email: string | undefined | null): string | null => {
    if (!email) return null;
    const normalized = email.replace(/\s+/g, '').toLowerCase().trim();
    return normalized.length > 0 ? normalized : null;
  };

  // Duplicate groups (same email) for "Merge duplicates" - persisted via API, not in-memory
  const duplicateGroups = useMemo(() => {
    const emailMap = new Map<string, Client[]>();
    clients.forEach((client) => {
      const norm = normalizeEmail(client.email);
      if (norm) {
        if (!emailMap.has(norm)) emailMap.set(norm, []);
        emailMap.get(norm)!.push(client);
      }
    });
    return Array.from(emailMap.values()).filter((group) => group.length > 1);
  }, [clients]);

  const [mergingDuplicates, setMergingDuplicates] = useState(false);
  const requireBrevoForEmail = (): boolean => {
    if (!brevoStatus?.connected) {
      alert('Connect Brevo under Integrations → Brevo (email) to send messages.');
      return false;
    }
    return true;
  };

  const openEmailComposer = (recipients: Array<{ email: string; name?: string }>) => {
    if (recipients.length === 0) {
      alert('No clients with email addresses in this selection.');
      return;
    }
    if (!requireBrevoForEmail()) return;
    setEmailRecipients(recipients);
    setEmailComposerKey((k) => k + 1);
    setEmailComposerOpen(true);
  };

  const handleEmailAllContacts = () => {
    openEmailComposer(recipientsFromClients(clients));
  };

  const handleEmailColumn = (columnId: ColumnId) => {
    const columnClients = clients.filter((c) => c.lifecycle_state === columnId);
    openEmailComposer(recipientsFromClients(columnClients));
  };

  const handleMergeDuplicates = async () => {
    if (duplicateGroups.length === 0) return;
    setMergingDuplicates(true);
    try {
      for (const group of duplicateGroups) {
        const kept = await apiClient.mergeClients(group.map((c) => c.id));
        if (kept?.id && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(CLIENT_MERGED_EVENT, { detail: { keptClientId: kept.id } })
          );
        }
      }
      await loadClients(true, true, false, true, false);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to merge duplicates.');
    } finally {
      setMergingDuplicates(false);
    }
  };

  const handleRefreshSync = async () => {
    setSyncingRefreshing(true);
    setSyncError(null);
    try {
      // 1) Stripe customers / payments → reconcile onto the board (new customers if not already present)
      await apiClient.syncStripeData(false, true);
      try {
        const { last_updated_ms } = await apiClient.getStripeLastUpdated();
        if (last_updated_ms != null) invalidateStripeAndTerminalAfterWebhook(last_updated_ms);
      } catch {
        /* keep */
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(STRIPE_DATA_UPDATED_EVENT));
      }

      // 1b) Whop customers / payments → reconcile onto the board (optional; only if connected)
      try {
        const whopStatus = await apiClient.getWhopStatus(false);
        if (whopStatus?.connected) {
          await apiClient.postWhopSync(false);
        }
      } catch {
        /* keep */
      }

      // 2) Calendar (Cal.com / Calendly) attendees → check-ins → warm leads on the board
      await apiClient.syncCheckIns();

      // Reload list once; skip embedded check-in sync (already ran above).
      await loadClients(true, true, true, false, true, true);

      // Drawer IntelligenceSection uses this to refetch AI insights / health.
      setHealthRefreshToken((t) => t + 1);

      // Trigger a single call-insight AI re-analysis for the currently open drawer client (if any).
      // This is the same action as the in-drawer "Re-analyze" button; do not block the refresh.
      const selectedId = selectedClientIdRef.current;
      if (selectedId) {
        void (async () => {
          try {
            await apiClient.postClientCallInsightsRefresh(selectedId);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent(CALL_INSIGHTS_REANALYZED_EVENT, { detail: { clientId: selectedId } })
              );
            }
          } catch {
            /* keep */
          }
        })();
      }
    } catch (err: unknown) {
      console.error('[KanbanBoard] Refresh sync failed:', err);
      setSyncError(formatApiError(err, 'Sync could not finish. Check Stripe / calendar connections and try again.'));
    } finally {
      setSyncingRefreshing(false);
    }
  };

  const toggleInsightTagFilter = useCallback((tag: string) => {
    setSelectedInsightTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const clearBoardFilters = useCallback(() => {
    setSelectedInsightTags(new Set());
    setBalanceDueFilter(false);
  }, []);

  const toggleBalanceDueFilter = useCallback(() => {
    setBalanceDueFilter((v) => !v);
  }, []);

  const activeFilterCount = selectedInsightTags.size + (balanceDueFilter ? 1 : 0);

  const balanceDueCount = useMemo(
    () => clients.filter((c) => hasOutstandingOfferBalance(c)).length,
    [clients],
  );

  const insightTagCounts = useMemo(() => {
    const counts: Partial<Record<string, number>> = {};
    for (const tag of CALL_INSIGHT_BOARD_TAGS) counts[tag] = 0;
    for (const c of clients) {
      for (const t of callInsightTags[c.id]?.tags ?? []) {
        if (typeof t === 'string' && t in counts) {
          counts[t] = (counts[t] ?? 0) + 1;
        }
      }
    }
    return counts as Record<string, number>;
  }, [clients, callInsightTags]);

  // Filter clients by search query and optional insight tag chips (OR within tags)
  const filteredClients = useMemo(() => {
    let list = clients;
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      list = list.filter((client) => clientMatchesBoardSearch(client, searchQuery));
    }
    if (selectedInsightTags.size > 0) {
      list = list.filter((client) => {
        const tags = callInsightTags[client.id]?.tags ?? [];
        return tags.some((t) => selectedInsightTags.has(t));
      });
    }
    if (balanceDueFilter) {
      list = list.filter((client) => hasOutstandingOfferBalance(client));
    }
    return list;
  }, [clients, searchQuery, selectedInsightTags, balanceDueFilter, callInsightTags]);

  const getClientsForColumn = (columnId: ColumnId) => {
    // If a filter is active and this column doesn't match, return empty array
    if (filteredColumn && filteredColumn !== columnId) {
      return [];
    }
    
    // Filter filtered clients by column
    // For merged clients, show them only in the column that matches their merged lifecycle_state
    // This ensures each merged client appears in exactly one column
    const columnClients = filteredClients.filter((client) => {
      const matches = normalizeLifecycleColumn(client.lifecycle_state) === columnId;
      
      // Debug logging for state mismatches (especially for offboarding column)
      if (columnId === 'offboarding') {
        if (client.program_progress_percent && client.program_progress_percent >= 75 && client.program_progress_percent < 100) {
          if (!matches) {
            console.warn('[KanbanBoard] ⚠️ Client should be in offboarding but is not:', {
              id: client.id,
              email: client.email,
              lifecycle_state: client.lifecycle_state,
              progress: client.program_progress_percent,
              expectedColumn: 'offboarding',
              actualColumn: client.lifecycle_state
            });
          } else {
            console.log('[KanbanBoard] ✅ Client correctly in offboarding column:', {
              id: client.id,
              email: client.email,
              progress: client.program_progress_percent
            });
          }
        }
      }
      
      return matches;
    });
    
    // Log column counts for debugging
    if (columnId === 'offboarding' && columnClients.length > 0) {
      console.log(`[KanbanBoard] Offboarding column has ${columnClients.length} client(s)`);
    }
    
    const scoreFor = (id: string) => healthScores[id]?.score;
    return [...columnClients].sort((a, b) =>
      compareClientsForBoardColumn(a, b, columnId as BoardLifecycleColumn, scoreFor),
    );
  };

  const handleDeleteClient = async (client: Client) => {
    const confirmMessage = `Are you sure you want to delete "${[client.first_name, client.last_name].filter(Boolean).join(' ') || 'this client'}"?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      await apiClient.deleteClient(client.id, false);
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      if (selectedClient?.id === client.id) {
        setIsDrawerOpen(false);
        setSelectedClient(null);
      }
    } catch (error: any) {
      console.error('Failed to delete client:', error);
      alert(error?.response?.data?.detail || 'Failed to delete client. Please try again.');
    }
  };

  const handleCreateClient = async () => {
    if (!createFormData.first_name && !createFormData.last_name && !createFormData.email) {
      alert('Please provide at least a name or email');
      return;
    }

    setCreating(true);
    try {
      const clientData = {
        first_name: createFormData.first_name || undefined,
        last_name: createFormData.last_name || undefined,
        email: createFormData.email || undefined,
        phone: createFormData.phone || undefined,
        instagram: createFormData.instagram || undefined,
        lifecycle_state: createFormData.lifecycle_state,
        notes: createFormData.notes || undefined,
      };

      const newClient = await apiClient.createClient(clientData);
      const created: Client = {
        ...newClient,
        lifecycle_state:
          normalizeLifecycleColumn(newClient.lifecycle_state) ?? createFormData.lifecycle_state,
      };

      applyClientUpdate(created);
      setIsCreateModalOpen(false);
      resetCreateForm();
      setSelectedClient(created);
      setIsDrawerOpen(true);
    } catch (error: any) {
      console.error('Failed to create client:', error);
      alert(error?.response?.data?.detail || 'Failed to create client. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  if (loading && clients.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading clients...</div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">Client Management</h2>
            {refreshing ? (
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0" aria-live="polite">
                Updating…
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {duplicateGroups.length > 0 && (
              <button
                type="button"
                onClick={handleMergeDuplicates}
                disabled={mergingDuplicates}
                className="px-3 py-2.5 text-sm glass-button neon-glow rounded-md disabled:opacity-50 min-h-[44px]"
              >
                {mergingDuplicates ? 'Merging...' : `Merge ${duplicateGroups.length} duplicate group(s)`}
              </button>
            )}
            <button
              type="button"
              onClick={handleEmailAllContacts}
              disabled={clients.length === 0}
              className="px-3 py-2 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50 flex items-center gap-2 min-h-[44px]"
              title={
                brevoStatus?.connected
                  ? 'Compose an email to all clients on the board (emails deduplicated)'
                  : 'Connect Brevo in Integrations first'
              }
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Email all
            </button>
            <button
              type="button"
              onClick={handleRefreshSync}
              disabled={syncingRefreshing}
              aria-busy={syncingRefreshing}
              className="px-3 py-2 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50 flex items-center gap-2 min-h-[44px]"
              title="Sync Stripe customers, then calendar attendees, then Fathom calls and AI insights"
            >
              <svg className={`w-4 h-4 flex-shrink-0 ${syncingRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncingRefreshing ? 'Syncing…' : 'Refresh'}
            </button>
            <ShinyButton onClick={() => setIsCreateModalOpen(true)}>
            <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Client
          </ShinyButton>
          </div>
        </div>
        {syncError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200 flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">{syncError}</span>
            <button
              type="button"
              className="text-xs font-medium underline underline-offset-2 shrink-0"
              onClick={() => setSyncError(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {duplicateGroups.length > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            You have duplicate client cards (same email). Click &quot;Merge duplicate group(s)&quot; to combine them into one profile per person.
          </p>
        )}
        
        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
            placeholder="Search name, email, phone, Instagram, notes…"
            aria-label="Search clients on board"
            className="block w-full pl-10 pr-3 py-2 rounded-md leading-5 sm:text-sm bg-white/10 dark:bg-white/5 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 border-2 border-gray-300 dark:border-gray-600 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={filtersDropdownRef}>
            <button
              type="button"
              id="board-filters-trigger"
              aria-haspopup="dialog"
              aria-controls="board-filters-panel"
              aria-expanded={filtersDropdownOpen}
              onClick={() => setFiltersDropdownOpen((o) => !o)}
              className={`inline-flex items-center gap-2 min-h-[40px] px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                activeFilterCount > 0
                  ? 'border-primary-500/40 bg-primary-500/10 text-primary-900 dark:text-primary-100'
                  : 'border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-200 hover:bg-white/70 dark:hover:bg-gray-800/50'
              }`}
            >
              <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              <span>Filters</span>
              {activeFilterCount > 0 ? (
                <span className="tabular-nums rounded-full bg-primary-600/90 px-1.5 py-0.5 text-[11px] font-semibold text-white dark:bg-primary-500/90">
                  {activeFilterCount}
                </span>
              ) : null}
              <svg
                className={`w-4 h-4 shrink-0 opacity-60 transition-transform ${filtersDropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {filtersDropdownOpen ? (
              <div
                id="board-filters-panel"
                role="dialog"
                aria-modal="false"
                aria-labelledby="board-filters-trigger"
                className="absolute left-0 top-full z-50 mt-1 w-[min(100vw-2rem,280px)] rounded-lg border border-gray-200/80 bg-white/95 p-2 shadow-lg backdrop-blur-sm dark:border-gray-600 dark:bg-gray-900/95"
              >
                <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Board filters (multi-select)
                </p>
                <ul className="max-h-[min(60vh,320px)] space-y-0.5 overflow-y-auto py-0.5">
                  {CALL_INSIGHT_BOARD_TAGS.map((tag) => {
                    const checked = selectedInsightTags.has(tag);
                    const n = insightTagCounts[tag] ?? 0;
                    return (
                      <li key={tag}>
                        <label
                          className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                            checked
                              ? 'bg-primary-500/12 text-gray-900 dark:text-gray-100'
                              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/80'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800"
                            checked={checked}
                            onChange={() => toggleInsightTagFilter(tag)}
                          />
                          <span className="min-w-0 flex-1 capitalize">{formatInsightTagLabel(tag)}</span>
                          <span className="shrink-0 tabular-nums text-xs text-gray-500 dark:text-gray-400">({n})</span>
                        </label>
                      </li>
                    );
                  })}
                  <li>
                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                        balanceDueFilter
                          ? 'bg-primary-500/12 text-gray-900 dark:text-gray-100'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800"
                        checked={balanceDueFilter}
                        onChange={toggleBalanceDueFilter}
                      />
                      <span className="min-w-0 flex-1">Balance due</span>
                      <span className="shrink-0 tabular-nums text-xs text-gray-500 dark:text-gray-400">
                        ({balanceDueCount})
                      </span>
                    </label>
                  </li>
                </ul>
                <div className="mt-1.5 border-t border-gray-200 pt-1.5 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => {
                      clearBoardFilters();
                    }}
                    disabled={activeFilterCount === 0}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    Clear all filters
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug max-w-xl">
            Tags match <strong className="font-medium text-gray-600 dark:text-gray-300">any</strong> selection; balance
            due adds clients with payments below offer total. Counts are for the full board.
          </p>
        </div>

        {(searchQuery.trim() || selectedInsightTags.size > 0 || balanceDueFilter) && (
          <div className="text-sm text-gray-600 dark:text-gray-400 digitized-text">
            Showing {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
            {searchQuery.trim() ? (
              <>
                {' '}
                matching &quot;{searchQuery.trim()}&quot;
              </>
            ) : null}
            {selectedInsightTags.size > 0 ? (
              <>
                {' '}
                with tag{selectedInsightTags.size !== 1 ? 's' : ''}{' '}
                {Array.from(selectedInsightTags)
                  .map((t) => formatInsightTagLabel(t))
                  .join(', ')}
              </>
            ) : null}
            {balanceDueFilter ? (
              <>
                {' '}
                with balance due on offer
              </>
            ) : null}
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragOver={handleDragOver}
        onDragEnd={async (e) => {
          await handleDragEnd(e);
          setActiveDragClient(null);
        }}
      >
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 -mx-1 px-1 sm:mx-0 sm:px-0 scroll-smooth touch-pan-x min-w-0">
          {COLUMNS.map((column) => {
            const columnClients = getClientsForColumn(column.id);
            if (filteredColumn && filteredColumn !== column.id) {
              return null;
            }
            return (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                clients={columnClients}
                isActive={activeColumn === column.id}
                dragOverId={dragOverId}
                mergingCards={mergingCards}
                onClientClick={(client) => {
                  setSelectedClient(client);
                  setIsDrawerOpen(true);
                }}
                onClientDelete={handleDeleteClient}
                callInsightTags={callInsightTags}
                onEmailColumn={handleEmailColumn}
              />
            );
          })}
        </div>
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
          {activeDragClient ? (
            <div className="glass-card neon-glow p-3 rounded-lg shadow-2xl ring-2 ring-primary-500/40 cursor-grabbing max-w-[260px] rotate-1 scale-[1.02] transition-transform">
              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {[activeDragClient.first_name, activeDragClient.last_name].filter(Boolean).join(' ') ||
                  activeDragClient.email ||
                  'Client'}
              </div>
              {activeDragClient.email && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{activeDragClient.email}</div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ClientDetailDrawer
        client={selectedClient}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedClient(null);
        }}
        onClientSaved={applyClientUpdate}
        healthRefreshToken={healthRefreshToken}
        onHealthScoreLoaded={(cid) => {
          apiClient
            .getClientsCallInsightTags([cid])
            .then((tagMap) => {
              const row = tagMap[cid];
              if (row) setCallInsightTags((prev) => ({ ...prev, [cid]: row }));
            })
            .catch(() => {});
        }}
        onUpdate={() => {
          void refreshSelectedClient();
        }}
      />

      {/* Create Client Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:glass-card rounded-lg shadow-lg border border-gray-200 dark:border-white/10 neon-glow p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Create New Client</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={createFormData.first_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, first_name: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="John"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={createFormData.last_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, last_name: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={createFormData.phone}
                  onChange={(e) => setCreateFormData({ ...createFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Instagram
                </label>
                <input
                  type="text"
                  value={createFormData.instagram}
                  onChange={(e) => setCreateFormData({ ...createFormData, instagram: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="@username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Pipeline column
                </label>
                <select
                  value={createFormData.lifecycle_state}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      lifecycle_state: e.target.value as ColumnId,
                    })
                  }
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={createFormData.notes}
                  onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Additional notes about this client..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  resetCreateForm();
                }}
                className="glass-button-secondary px-4 py-2 text-sm font-medium rounded-md hover:bg-white/20"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateClient}
                disabled={creating}
                className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailComposerOpen && emailRecipients.length > 0 && (
        <EmailComposer
          key={emailComposerKey}
          recipients={emailRecipients}
          onClose={() => {
            setEmailComposerOpen(false);
            setEmailRecipients([]);
          }}
          onSuccess={async () => {
            const recipients = [...emailRecipients];
            setEmailComposerOpen(false);
            setEmailRecipients([]);
            const nowIso = new Date().toISOString();
            const norm = (e: string) => e.replace(/\s+/g, '').toLowerCase();
            const recipientKeys = new Set(recipients.map((r) => norm(r.email)));
            const toTouch = clients.filter((c) =>
              getEmailsForClient(c).some((em) => recipientKeys.has(norm(em))),
            );
            try {
              const updatedRows = await Promise.all(
                toTouch.map((c) => {
                  const nextMeta =
                    c.meta && typeof c.meta === 'object' ? { ...c.meta } : {};
                  delete (nextMeta as Record<string, unknown>).follow_up_due_at;
                  return apiClient.updateClient(c.id, {
                    last_activity_at: nowIso,
                    meta: nextMeta as Client['meta'],
                  });
                }),
              );
              for (const updated of updatedRows) {
                applyClientUpdate(updated);
              }
            } catch (err) {
              console.error('[KanbanBoard] Follow-up reset after email failed:', err);
            }
          }}
        />
      )}

    </>
  );
}

interface KanbanColumnProps {
  id: ColumnId;
  title: string;
  clients: Client[];
  isActive: boolean;
  dragOverId: string | null;
  mergingCards: boolean;
  onClientClick: (client: Client) => void;
  onClientDelete?: (client: Client) => void;
  callInsightTags?: Record<string, { tags: string[]; headline: string }>;
  onEmailColumn?: (columnId: ColumnId) => void;
}

function KanbanColumn({
  id,
  title,
  clients,
  isActive,
  dragOverId,
  mergingCards,
  onClientClick,
  onClientDelete,
  callInsightTags = {},
  onEmailColumn,
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: id,
  });
  const isLeadColumn = isLeadPipelineColumn(id);

  return (
    <div className="flex-shrink-0 w-[220px] min-w-[220px] sm:w-[240px] sm:min-w-[240px]">
      <div
        ref={setNodeRef}
        className={`glass-card p-3 sm:p-4 min-h-[280px] sm:min-h-[400px] transition-all duration-200 ease-out ${
          isActive ? 'neon-glow ring-2 ring-primary-500/25' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 digitized-text flex-1 min-w-0 leading-snug">
            {title} ({clients.length})
          </h3>
          {onEmailColumn ? (
            <button
              type="button"
              onClick={() => onEmailColumn(id)}
              disabled={clients.length === 0}
              className="flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:text-primary-600 hover:bg-white/10 dark:text-gray-400 dark:hover:text-primary-400 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Email everyone in this column"
              aria-label={`Email ${title} column`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <SortableContext
          items={clients.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onClick={() => onClientClick(client)}
                onDelete={onClientDelete}
                isMergeTarget={dragOverId === MERGE_DROP_ID(client.id)}
                showSlotLineAbove={dragOverId === SLOT_DROP_ID(client.id)}
                insightTags={callInsightTags[client.id]?.tags}
                isLeadColumn={isLeadColumn}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

