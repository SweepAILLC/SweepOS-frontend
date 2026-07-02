import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCorners,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  useDroppable,
  type CollisionDetection,
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
  removePipelineClient,
  setPipelineClients,
  subscribePipelineClients,
  pipelineClientsEqual,
} from '@/lib/pipelineStore';
import { ORG_CHANGED_EVENT, orgIdFromAccessToken } from '@/lib/orgScope';
import ClientCard, { MERGE_DROP_ID } from './ClientCard';
import ClientDetailDrawer from './ClientDetailDrawer';

function mergeClientRow(existing: Client, incoming: Client): Client {
  const incomingMs = incoming.updated_at ? Date.parse(incoming.updated_at) : 0;
  const existingMs = existing.updated_at ? Date.parse(existing.updated_at) : 0;
  const incomingIsStale =
    incomingMs > 0 && existingMs > 0 && incomingMs < existingMs;

  const merged: Client = {
    ...existing,
    ...incoming,
    offer_enrollment:
      'offer_enrollment' in incoming ? incoming.offer_enrollment : existing.offer_enrollment,
    meta: 'meta' in incoming ? incoming.meta : existing.meta,
  };

  // Avoid a slower PATCH (e.g. program clear while still dead) overwriting a newer column move.
  if (incomingIsStale && incoming.lifecycle_state !== existing.lifecycle_state) {
    merged.lifecycle_state = existing.lifecycle_state;
  }

  return merged;
}

const LIFECYCLE_MERGE_PRIORITY: Record<string, number> = {
  active: 7,
  offboarding: 6,
  booked: 5,
  qualified: 4,
  nurturing: 3,
  cold_lead: 2,
  dead: 1,
};

function clientCreatedAtMs(c: Client): number {
  return c.created_at ? Date.parse(c.created_at) : Number.MAX_SAFE_INTEGER;
}

/** Matches backend merge: oldest client (by created_at) is kept. */
function pickMergeKeep(...clients: Client[]): Client {
  return [...clients].sort((a, b) => clientCreatedAtMs(a) - clientCreatedAtMs(b))[0];
}

/** Approximate server-side field merge for instant board updates. */
function buildOptimisticMergedClient(keep: Client, toRemove: Client[]): Client {
  const all = [keep, ...toRemove];
  let bestState = keep;
  for (const c of all) {
    const priority = LIFECYCLE_MERGE_PRIORITY[c.lifecycle_state] ?? 0;
    const bestPriority = LIFECYCLE_MERGE_PRIORITY[bestState.lifecycle_state] ?? 0;
    if (priority > bestPriority) bestState = c;
  }

  let merged: Client = { ...keep, lifecycle_state: bestState.lifecycle_state };

  for (const c of toRemove) {
    if (c.first_name?.trim() && !merged.first_name?.trim()) merged.first_name = c.first_name;
    if (c.last_name?.trim() && !merged.last_name?.trim()) merged.last_name = c.last_name;
    if (c.phone?.trim() && !merged.phone?.trim()) merged.phone = c.phone;
    if (c.instagram?.trim() && !merged.instagram?.trim()) merged.instagram = c.instagram;
    if (c.stripe_customer_id?.trim() && !merged.stripe_customer_id?.trim()) {
      merged.stripe_customer_id = c.stripe_customer_id;
    }
    merged.estimated_mrr = Math.max(merged.estimated_mrr ?? 0, c.estimated_mrr ?? 0);
    merged.lifetime_revenue_cents = Math.max(
      merged.lifetime_revenue_cents ?? 0,
      c.lifetime_revenue_cents ?? 0,
    );
    if (c.notes?.trim()) {
      merged.notes = merged.notes?.trim()
        ? `${merged.notes.trim()}\n${c.notes.trim()}`
        : c.notes.trim();
    }
  }

  const byLower = new Map<string, string>();
  for (const c of all) {
    for (const e of getEmailsForClient(c)) {
      const key = e.toLowerCase();
      if (!byLower.has(key)) byLower.set(key, e);
    }
  }
  const sortedKeys = Array.from(byLower.keys()).sort();
  if (sortedKeys.length > 0) {
    merged.email = byLower.get(sortedKeys[0])!;
    merged.emails =
      sortedKeys.length > 1 ? sortedKeys.slice(1).map((k) => byLower.get(k)!) : merged.emails ?? [];
  }

  const bestProgram = all.reduce((best, c) =>
    (c.program_progress_percent ?? 0) > (best.program_progress_percent ?? 0) ? c : best,
  );
  if (bestProgram.program_progress_percent != null) {
    merged.program_start_date = bestProgram.program_start_date;
    merged.program_duration_days = bestProgram.program_duration_days;
    merged.program_end_date = bestProgram.program_end_date;
    merged.program_progress_percent = bestProgram.program_progress_percent;
  }

  return merged;
}

import { CALL_INSIGHTS_REANALYZED_EVENT, CLIENT_MERGED_EVENT } from './IntelligenceSection';
import ShinyButton from '../ui/ShinyButton';
import EmailComposer from '../brevo/EmailComposer';
import { KanbanSkeleton } from '@/components/ui/SkeletonLoader';
import { PremiumReveal } from '@/components/ui/PremiumMotion';
import { COLUMN_STAGGER_MS } from '@/lib/premiumMotion';

const COLUMNS = PIPELINE_COLUMNS;

type ColumnId = PipelineColumnId;

const COLUMN_ID_SET = new Set<string>(COLUMNS.map((c) => c.id));

/** Merge on cards; column body everywhere else (empty space, gaps, column bottom). */
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length === 0) {
    return closestCorners(args);
  }

  const mergeHits = pointerHits.filter(({ id }) => String(id).startsWith('merge-'));
  if (mergeHits.length > 0) return mergeHits;

  const columnHits = pointerHits.filter(({ id }) => COLUMN_ID_SET.has(String(id)));
  if (columnHits.length > 0) return columnHits;

  const cardHits = pointerHits.filter(({ id }) => {
    const sid = String(id);
    return !sid.startsWith('merge-') && !COLUMN_ID_SET.has(sid);
  });
  if (cardHits.length > 0) return cardHits;

  return pointerHits;
};

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
  const orgIdRef = useRef(orgIdFromAccessToken());
  const shouldAnimateColumns = useRef(hydratePipelineClients().length === 0);
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
  const [dragBatchCount, setDragBatchCount] = useState(0);
  const [dragBatchIds, setDragBatchIds] = useState<Set<string>>(() => new Set());
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(() => new Set());
  const [filtersDropdownOpen, setFiltersDropdownOpen] = useState(false);
  const filtersDropdownRef = useRef<HTMLDivElement>(null);
  const dragBatchRef = useRef<Set<string>>(new Set());

  // Refs to avoid re-creating poll intervals with stale state
  const clientsRef = useRef<Client[]>([]);
  const selectedClientIdRef = useRef<string | null>(null);
  const loadInFlightRef = useRef<Promise<Client[] | undefined> | null>(null);
  const tagsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Suppress store → board echo while board → store sync runs (avoids update depth loop). */
  const syncingToStoreRef = useRef(false);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedClientIds(new Set());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleClientSelection = useCallback((clientId: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }, []);

  const clearClientSelection = useCallback(() => {
    setSelectedClientIds(new Set());
  }, []);

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
    const currentOrg = orgIdFromAccessToken();
    if (orgIdRef.current !== currentOrg) {
      orgIdRef.current = currentOrg;
      pipelineLoadStartedRef.current = false;
      clientsRef.current = [];
      setClients([]);
    }
    if (pipelineLoadStartedRef.current) return;
    pipelineLoadStartedRef.current = true;
    void (async () => {
      try {
        await apiClient.reconcileClientLifecycles(true);
      } catch (reconcileErr) {
        console.warn('[KanbanBoard] Lifecycle reconcile failed (board will still load):', reconcileErr);
      }
      await loadClients(true, true, false, false).catch((err) => {
        console.error('[KanbanBoard] Initial load failed:', err);
      });
    })();
  }, [isActive]);

  useEffect(() => {
    const onOrgChanged = () => {
      orgIdRef.current = orgIdFromAccessToken();
      pipelineLoadStartedRef.current = false;
      clientsRef.current = [];
      setClients([]);
      if (isActive) {
        pipelineLoadStartedRef.current = true;
        void (async () => {
          try {
            await apiClient.reconcileClientLifecycles(true);
          } catch (reconcileErr) {
            console.warn('[KanbanBoard] Lifecycle reconcile after org switch failed:', reconcileErr);
          }
          await loadClients(true, true, false, false).catch((err) => {
            console.error('[KanbanBoard] Reload after org switch failed:', err);
          });
        })();
      }
    };
    window.addEventListener(ORG_CHANGED_EVENT, onOrgChanged);
    return () => window.removeEventListener(ORG_CHANGED_EVENT, onOrgChanged);
  }, [isActive]);

  useEffect(() => {
    return subscribePipelineClients(() => {
      if (syncingToStoreRef.current) return;
      const store = getPipelineClients();
      if (store.length === 0) return;
      if (pipelineClientsEqual(clientsRef.current, store)) return;
      clientsRef.current = store;
      setClients([...store]);
    });
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const store = getPipelineClients();
    if (pipelineClientsEqual(clients, store)) return;
    syncingToStoreRef.current = true;
    setPipelineClients(clients);
    syncingToStoreRef.current = false;
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

  const applyOptimisticClientMerge = useCallback(
    (optimisticKept: Client, removedIds: string[]) => {
      const removedSet = new Set(removedIds);
      removePipelineClient(...removedIds);
      patchPipelineClient(optimisticKept);
      const next = clientsRef.current
        .filter((c) => !removedSet.has(c.id))
        .map((c) => (c.id === optimisticKept.id ? optimisticKept : c));
      clientsRef.current = next;
      setClients(next);
      setCallInsightTags((prev) => {
        if (!removedIds.some((id) => id in prev)) return prev;
        const updated = { ...prev };
        for (const id of removedIds) delete updated[id];
        return updated;
      });
      setHealthScores((prev) => {
        if (!removedIds.some((id) => id in prev)) return prev;
        const updated = { ...prev };
        for (const id of removedIds) delete updated[id];
        return updated;
      });
      setSelectedClient((sel) => {
        if (sel && removedSet.has(sel.id)) return optimisticKept;
        if (sel?.id === optimisticKept.id) return optimisticKept;
        return sel;
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(CLIENT_MERGED_EVENT, { detail: { keptClientId: optimisticKept.id } }),
        );
      }
    },
    [],
  );

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
      const prevRow = clientsRef.current.find((c) => c.id === normalized.id);
      const prevColumn = prevRow
        ? normalizeLifecycleColumn(prevRow.lifecycle_state) ?? (prevRow.lifecycle_state as PipelineColumnId)
        : null;
      const merged = prevRow ? mergeClientRow(prevRow, normalized) : normalized;

      if (column === 'dead' && prevColumn !== 'dead') {
        setHealthRefreshToken((t) => t + 1);
        setCallInsightTags((prev) => {
          const existing = prev[normalized.id];
          const tags = Array.from(new Set([...(existing?.tags ?? []), 'revive']));
          return {
            ...prev,
            [normalized.id]: { tags, headline: existing?.headline ?? '' },
          };
        });
        void refreshBoardTags();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(CALL_INSIGHTS_REANALYZED_EVENT, { detail: { clientId: normalized.id } }),
          );
        }
      }

      setClients((prev) => {
        const exists = prev.some((c) => c.id === normalized.id);
        const next = exists
          ? prev.map((c) => (c.id === normalized.id ? mergeClientRow(c, normalized) : c))
          : [merged, ...prev];
        clientsRef.current = next;
        return next;
      });
      setSelectedClient((sel) =>
        sel?.id === normalized.id ? mergeClientRow(sel, normalized) : sel,
      );
      patchPipelineClient(merged);
      if (column) onClientLifecycleChanged?.(column);
    },
    [normalizeClient, onClientLifecycleChanged, refreshBoardTags],
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

    const batch =
      selectedClientIds.has(id) && selectedClientIds.size > 1
        ? new Set(selectedClientIds)
        : new Set([id]);
    dragBatchRef.current = batch;
    setDragBatchIds(batch);
    setDragBatchCount(batch.size);
  };

  const handleDragCancel = () => {
    setActiveDragClient(null);
    dragBatchRef.current = new Set();
    setDragBatchIds(new Set());
    setDragBatchCount(0);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    const overId = over ? String(over.id) : null;
    setDragOverId(overId);

    if (overId && COLUMN_ID_SET.has(overId)) {
      setActiveColumn(overId as ColumnId);
    } else {
      setActiveColumn(null);
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

    // Drop on another card = merge (single) or bulk move (multi-select)
    if (overId.startsWith('merge-')) {
      const targetId = overId.replace(/^merge-/, '');
      const batch = dragBatchRef.current;
      if (targetId && targetId !== activeId) {
        const targetClient = findClientBySortableId(targetId);
        if (targetClient) {
          const newColumnId =
            normalizeLifecycleColumn(targetClient.lifecycle_state) ??
            (targetClient.lifecycle_state as ColumnId);

          if (batch.size > 1) {
            await updateClientsStateBulk(Array.from(batch), newColumnId);
            return;
          }

          const draggedName = [draggedClient.first_name, draggedClient.last_name].filter(Boolean).join(' ') || draggedClient.email || 'Unknown';
          const targetName = [targetClient.first_name, targetClient.last_name].filter(Boolean).join(' ') || targetClient.email || 'Unknown';
          const confirmed = window.confirm(
            `Merge "${draggedName}" into "${targetName}"? This will combine their data into one client and remove the other card.`
          );
          if (!confirmed) return;

          const keep = pickMergeKeep(draggedClient, targetClient);
          const removedId = keep.id === draggedClient.id ? targetClient.id : draggedClient.id;
          const optimisticKept = buildOptimisticMergedClient(
            keep,
            keep.id === draggedClient.id ? [targetClient] : [draggedClient],
          );
          const previousClients = clientsRef.current;
          const previousSelected = selectedClient;
          const previousTags = callInsightTags;
          const previousHealthScores = healthScores;

          setActiveDragClient(null);
          applyOptimisticClientMerge(optimisticKept, [removedId]);

          setMergingCards(true);
          void (async () => {
            try {
              const keptClient = await apiClient.mergeClients([draggedClient.id, targetClient.id]);
              if (keptClient?.id) {
                patchPipelineClient(keptClient);
                setClients((prev) =>
                  prev
                    .filter((c) => c.id !== removedId)
                    .map((c) => (c.id === keptClient.id ? mergeClientRow(c, keptClient) : c)),
                );
                setSelectedClient((sel) => {
                  if (sel?.id === removedId || sel?.id === keptClient.id) return keptClient;
                  return sel;
                });
              }
            } catch (err: any) {
              clientsRef.current = previousClients;
              setClients(previousClients);
              setPipelineClients(previousClients);
              setCallInsightTags(previousTags);
              setHealthScores(previousHealthScores);
              setSelectedClient(previousSelected);
              alert(err?.response?.data?.detail || 'Failed to merge clients.');
            } finally {
              setMergingCards(false);
            }
          })();
        }
        return;
      }
    }

    // Drop on column body (empty space, bottom of column, gaps between cards)
    if (COLUMN_ID_SET.has(overId)) {
      const batch = dragBatchRef.current;
      if (batch.size > 1) {
        await updateClientsStateBulk(Array.from(batch), overId as ColumnId);
      } else {
        await updateClientState(draggedClient.id, overId as ColumnId, draggedClient);
      }
      return;
    }

    // Drop directly on another card (not merge zone) — move to that card's column
    const targetClient = findClientBySortableId(overId);
    if (targetClient) {
      const newColumnId =
        normalizeLifecycleColumn(targetClient.lifecycle_state) ??
        (targetClient.lifecycle_state as ColumnId);
      const batch = dragBatchRef.current;
      if (batch.size > 1) {
        await updateClientsStateBulk(Array.from(batch), newColumnId);
        return;
      }
      const currentColumnId = normalizeLifecycleColumn(draggedClient.lifecycle_state);
      if (newColumnId === currentColumnId) {
        return;
      }
      await updateClientState(draggedClient.id, newColumnId, draggedClient);
    }
  };

  const buildColumnMovePayload = (client: Client, targetColumn: PipelineColumnId) => {
    const currentColumn = normalizeLifecycleColumn(client.lifecycle_state);
    const isLeavingProgramDrivenColumn =
      (currentColumn === 'offboarding' || currentColumn === 'dead') && targetColumn !== currentColumn;
    const updateData: Record<string, unknown> = {
      lifecycle_state: targetColumn,
    };
    if (isLeavingProgramDrivenColumn) {
      updateData.program_progress_percent = null;
      updateData.program_duration_days = null;
      updateData.program_start_date = null;
      updateData.program_end_date = null;
    }
    return { updateData, isLeavingProgramDrivenColumn };
  };

  const buildOptimisticColumnMove = (client: Client, targetColumn: PipelineColumnId): Client => {
    const { isLeavingProgramDrivenColumn } = buildColumnMovePayload(client, targetColumn);
    const next: Client = { ...client, lifecycle_state: targetColumn };
    if (isLeavingProgramDrivenColumn) {
      next.program_progress_percent = undefined;
      next.program_duration_days = undefined;
      next.program_start_date = undefined;
      next.program_end_date = undefined;
    }
    return next;
  };

  const updateClientsStateBulk = async (clientIds: string[], newColumnId: ColumnId) => {
    const targetColumn =
      normalizeLifecycleColumn(newColumnId) ?? (newColumnId as PipelineColumnId);

    const toMove: Client[] = [];
    const previousById = new Map<string, Client>();

    for (const id of clientIds) {
      const client = clientsRef.current.find((c) => c.id === id);
      if (!client) continue;
      const currentColumn = normalizeLifecycleColumn(client.lifecycle_state);
      if (currentColumn === targetColumn) continue;
      previousById.set(id, client);
      toMove.push(client);
    }

    if (toMove.length === 0) return;

    for (const client of toMove) {
      applyClientUpdate(buildOptimisticColumnMove(client, targetColumn));
    }

    const failed: Client[] = [];
    await Promise.all(
      toMove.map(async (client) => {
        const { updateData } = buildColumnMovePayload(client, targetColumn);
        try {
          const updated = await apiClient.updateClient(client.id, updateData);
          if (updated) applyClientUpdate(withNormalizedLifecycle(updated));
        } catch (error) {
          console.error('Failed to update client:', error);
          failed.push(client);
        }
      }),
    );

    for (const client of failed) {
      const previous = previousById.get(client.id);
      if (previous) applyClientUpdate(previous);
    }

    if (failed.length > 0) {
      alert(`Failed to move ${failed.length} of ${toMove.length} client(s).`);
    } else {
      clearClientSelection();
    }
  };

  const moveSelectionToColumn = async (newColumnId: ColumnId) => {
    if (selectedClientIds.size === 0) return;
    await updateClientsStateBulk(Array.from(selectedClientIds), newColumnId);
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

    const { updateData } = buildColumnMovePayload(client, targetColumn);

    const previous = client;
    applyClientUpdate(buildOptimisticColumnMove(previous, targetColumn));

    try {
      const updated = await apiClient.updateClient(clientId, updateData);
      if (updated) applyClientUpdate(withNormalizedLifecycle(updated));
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

    const previousClients = clientsRef.current;
    const previousSelected = selectedClient;
    const previousTags = callInsightTags;
    const previousHealthScores = healthScores;

    const mergePlans = duplicateGroups.map((group) => {
      const keep = pickMergeKeep(...group);
      const removedIds = group.filter((c) => c.id !== keep.id).map((c) => c.id);
      const optimisticKept = buildOptimisticMergedClient(
        keep,
        group.filter((c) => c.id !== keep.id),
      );
      return { group, keep, removedIds, optimisticKept };
    });

    let working = [...previousClients];
    for (const plan of mergePlans) {
      const removedSet = new Set(plan.removedIds);
      working = working
        .filter((c) => !removedSet.has(c.id))
        .map((c) => (c.id === plan.optimisticKept.id ? plan.optimisticKept : c));
    }
    clientsRef.current = working;
    setClients(working);
    setPipelineClients(working);
    for (const plan of mergePlans) {
      for (const id of plan.removedIds) removePipelineClient(id);
      patchPipelineClient(plan.optimisticKept);
    }
    setCallInsightTags((prev) => {
      const allRemoved = new Set(mergePlans.flatMap((p) => p.removedIds));
      if (![...allRemoved].some((id) => id in prev)) return prev;
      const next = { ...prev };
      for (const id of allRemoved) delete next[id];
      return next;
    });
    setHealthScores((prev) => {
      const allRemoved = new Set(mergePlans.flatMap((p) => p.removedIds));
      if (![...allRemoved].some((id) => id in prev)) return prev;
      const next = { ...prev };
      for (const id of allRemoved) delete next[id];
      return next;
    });
    setSelectedClient((sel) => {
      if (!sel) return sel;
      for (const plan of mergePlans) {
        if (plan.removedIds.includes(sel.id)) return plan.optimisticKept;
        if (sel.id === plan.optimisticKept.id) return plan.optimisticKept;
      }
      return sel;
    });

    setMergingDuplicates(true);
    try {
      for (const plan of mergePlans) {
        const kept = await apiClient.mergeClients(plan.group.map((c) => c.id));
        if (kept?.id) {
          patchPipelineClient(kept);
          setClients((prev) =>
            prev
              .filter((c) => !plan.removedIds.includes(c.id))
              .map((c) => (c.id === kept.id ? mergeClientRow(c, kept) : c)),
          );
        }
        if (kept?.id && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(CLIENT_MERGED_EVENT, { detail: { keptClientId: kept.id } }),
          );
        }
      }
    } catch (err: any) {
      clientsRef.current = previousClients;
      setClients(previousClients);
      setPipelineClients(previousClients);
      setCallInsightTags(previousTags);
      setHealthScores(previousHealthScores);
      setSelectedClient(previousSelected);
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
      try {
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
      } catch (stripeErr) {
        console.warn('[KanbanBoard] Stripe sync failed (continuing with calendar + board reload):', stripeErr);
        setSyncError(formatApiError(stripeErr, 'Stripe sync had issues. Calendar and clients will still refresh.'));
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

      // 2) Calendar (Cal.com / Calendly) attendees → check-ins
      await apiClient.syncCheckIns({ applyPipelineRules: false });

      // 3) Force lifecycle rules for all clients (payments, sales calls, program progress)
      try {
        await apiClient.reconcileClientLifecycles(true);
      } catch (reconcileErr) {
        console.warn('[KanbanBoard] Lifecycle reconcile failed during refresh:', reconcileErr);
      }

      // Reload list once; skip embedded check-in sync (already ran above).
      await loadClients(true, true, true, false, true, false);

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

    const id = client.id;
    const previousClients = clientsRef.current;
    const previousSelected = selectedClient;

    const withoutDeleted = previousClients.filter((c) => c.id !== id);
    removePipelineClient(id);
    clientsRef.current = withoutDeleted;
    setClients(withoutDeleted);
    setCallInsightTags((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setHealthScores((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (selectedClient?.id === id) {
      setIsDrawerOpen(false);
      setSelectedClient(null);
    }

    try {
      await apiClient.deleteClient(id, false);
    } catch (error: any) {
      console.error('Failed to delete client:', error);
      clientsRef.current = previousClients;
      setClients(previousClients);
      setPipelineClients(previousClients);
      if (previousSelected?.id === id) {
        setSelectedClient(previousSelected);
        setIsDrawerOpen(true);
      }
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

        {selectedClientIds.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-sm">
            <span className="font-medium text-primary-900 dark:text-primary-100">
              {selectedClientIds.size} selected
            </span>
            <span className="hidden text-gray-500 dark:text-gray-400 sm:inline">
              Drag to a column or use Move to
            </span>
            <select
              defaultValue=""
              onChange={(e) => {
                const col = e.target.value as ColumnId;
                if (col) void moveSelectionToColumn(col);
                e.target.value = '';
              }}
              className="rounded-md border border-gray-300 bg-white/80 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900/60 dark:text-gray-100"
              aria-label="Move selected clients to column"
            >
              <option value="" disabled>
                Move to…
              </option>
              {COLUMNS.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={clearClientSelection}
              className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Clear (Esc)
            </button>
          </div>
        ) : null}

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
        collisionDetection={kanbanCollisionDetection}
        autoScroll={{ threshold: { x: 0.15, y: 0.15 }, acceleration: 8 }}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragOver={handleDragOver}
        onDragEnd={async (e) => {
          await handleDragEnd(e);
          setActiveDragClient(null);
          dragBatchRef.current = new Set();
          setDragBatchIds(new Set());
          setDragBatchCount(0);
        }}
      >
        {loading && clients.length === 0 ? (
          <KanbanSkeleton />
        ) : (
          <div className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto pb-4 -mx-1 px-1 sm:mx-0 sm:px-0 scroll-smooth touch-pan-x min-w-0">
            {COLUMNS.map((column, columnIndex) => {
              const columnClients = getClientsForColumn(column.id);
              if (filteredColumn && filteredColumn !== column.id) {
                return null;
              }
              return (
                <PremiumReveal
                  key={column.id}
                  delayMs={columnIndex * COLUMN_STAGGER_MS}
                  animate={shouldAnimateColumns.current}
                  className="flex w-[220px] min-w-[220px] shrink-0 flex-col self-stretch sm:w-[240px] sm:min-w-[240px]"
                >
                  <KanbanColumn
                    id={column.id}
                    title={column.title}
                    clients={columnClients}
                    isActive={activeColumn === column.id}
                    dragOverId={dragOverId}
                    mergingCards={mergingCards}
                    selectedClientIds={selectedClientIds}
                    dragBatchIds={dragBatchIds}
                    activeDragClientId={activeDragClient?.id ?? null}
                    onToggleClientSelection={toggleClientSelection}
                    onClientClick={(client) => {
                      const latest = clientsRef.current.find((c) => c.id === client.id) ?? client;
                      setSelectedClient(latest);
                      setIsDrawerOpen(true);
                    }}
                    onClientDelete={handleDeleteClient}
                    callInsightTags={callInsightTags}
                    onEmailColumn={handleEmailColumn}
                  />
                </PremiumReveal>
              );
            })}
          </div>
        )}
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
          {activeDragClient ? (
            <div className="relative glass-card neon-glow p-3 rounded-lg shadow-2xl ring-2 ring-primary-500/40 cursor-grabbing max-w-[260px] rotate-1 scale-[1.02] transition-transform">
              {dragBatchCount > 1 ? (
                <span className="absolute -top-2 -right-2 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary-600 px-1.5 text-xs font-bold text-white shadow-md">
                  {dragBatchCount}
                </span>
              ) : null}
              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {[activeDragClient.first_name, activeDragClient.last_name].filter(Boolean).join(' ') ||
                  activeDragClient.email ||
                  'Client'}
              </div>
              {dragBatchCount > 1 ? (
                <div className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                  Moving {dragBatchCount} clients
                </div>
              ) : activeDragClient.email ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{activeDragClient.email}</div>
              ) : null}
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
                if (updated) applyClientUpdate(updated);
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
  selectedClientIds: Set<string>;
  dragBatchIds: Set<string>;
  activeDragClientId: string | null;
  onToggleClientSelection: (clientId: string) => void;
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
  selectedClientIds,
  dragBatchIds,
  activeDragClientId,
  onToggleClientSelection,
  onClientClick,
  onClientDelete,
  callInsightTags = {},
  onEmailColumn,
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id });
  const isLeadColumn = isLeadPipelineColumn(id);

  return (
    <div
      className={`glass-card flex min-h-[280px] flex-1 flex-col p-3 transition-all duration-200 ease-out sm:min-h-[400px] sm:p-4 ${
        isActive ? 'neon-glow ring-2 ring-primary-500/40 bg-primary-500/5' : ''
      }`}
    >
      <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
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
      <div ref={setNodeRef} className="flex min-h-0 flex-1 flex-col">
        <SortableContext items={clients.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onClick={() => onClientClick(client)}
                onDelete={onClientDelete}
                isMergeTarget={dragOverId === MERGE_DROP_ID(client.id)}
                isSelected={selectedClientIds.has(client.id)}
                isInDragBatch={
                  dragBatchIds.has(client.id) && client.id !== activeDragClientId
                }
                onToggleSelect={() => onToggleClientSelection(client.id)}
                insightTags={callInsightTags[client.id]?.tags}
                isLeadColumn={isLeadColumn}
              />
            ))}
          </div>
        </SortableContext>
        <div className="min-h-16 flex-1" aria-hidden />
      </div>
    </div>
  );
}

