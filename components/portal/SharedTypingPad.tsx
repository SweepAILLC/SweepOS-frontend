import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  apiClient,
  MAX_PORTAL_SHARED_PADS,
  type PortalSharedPad,
  type PortalSharedPadSummary,
} from '@/lib/api';

const POLL_MS = 2000;
const SAVE_DEBOUNCE_MS = 350;
const TAB_LIST_POLL_MS = 8000;

/** Match http(s) URLs for live link rendering. */
const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/gi;

function linkifyText(text: string): ReactNode[] {
  if (!text) return [];
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, 'gi');
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const href = match[0];
    nodes.push(
      <a
        key={`${match.index}-${href}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-600 dark:text-sky-400 underline underline-offset-2 break-all hover:text-sky-500"
        onClick={(e) => e.stopPropagation()}
      >
        {href}
      </a>
    );
    last = match.index + href.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function LinkifiedContent({ text, onStartEdit }: { text: string; onStartEdit: () => void }) {
  const lines = text.split('\n');
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onStartEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onStartEdit();
        }
      }}
      className="w-full min-h-[220px] sm:min-h-[280px] resize-y rounded-lg border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-black/20 px-3 py-3 text-sm text-gray-900 dark:text-gray-100 leading-relaxed whitespace-pre-wrap break-words cursor-text text-left"
    >
      {text.trim() ? (
        lines.map((line, i) => (
          <Fragment key={i}>
            {linkifyText(line)}
            {i < lines.length - 1 ? '\n' : null}
          </Fragment>
        ))
      ) : (
        <span className="text-gray-400 dark:text-gray-500">
          Start typing — your consultant and team see this live. Click to edit; links stay clickable when viewing.
        </span>
      )}
    </div>
  );
}

type SharedTypingPadProps = {
  /** Admin owner dashboard viewing another org. */
  orgId?: string;
  isActive?: boolean;
  className?: string;
  title?: string;
  subtitle?: string;
};

export default function SharedTypingPad({
  orgId,
  isActive = true,
  className = '',
  title = 'Shared space',
  subtitle = 'Live notes — typing syncs for everyone in this org’s consulting portal.',
}: SharedTypingPadProps) {
  const [tabs, setTabs] = useState<PortalSharedPadSummary[]>([]);
  const [activePadId, setActivePadId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [revision, setRevision] = useState(0);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'live' | 'saving' | 'saved' | 'error'>('live');
  const [editing, setEditing] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const contentRef = useRef(content);
  const revisionRef = useRef(revision);
  const activePadIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightSaveRef = useRef(false);
  const inFlightFetchRef = useRef(false);
  const failStreakRef = useRef(0);
  const mountedRef = useRef(true);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  contentRef.current = content;
  revisionRef.current = revision;
  activePadIdRef.current = activePadId;

  const applyRemote = useCallback((pad: PortalSharedPad) => {
    if (pad.unchanged) return;
    setContent(pad.content ?? '');
    setRevision(pad.revision ?? 0);
    setUpdatedByName(pad.updated_by_name ?? null);
    setUpdatedAt(pad.updated_at ?? null);
    contentRef.current = pad.content ?? '';
    revisionRef.current = pad.revision ?? 0;
    if (pad.title) {
      setTabs((prev) =>
        prev.map((t) => (t.id === pad.id ? { ...t, title: pad.title, revision: pad.revision } : t))
      );
    }
  }, []);

  const loadTabs = useCallback(async () => {
    if (!isActive) return;
    try {
      const rows = orgId
        ? await apiClient.listAdminOrgPortalSharedPads(orgId)
        : await apiClient.listPortalSharedPads();
      if (!mountedRef.current) return;
      const list = Array.isArray(rows) ? rows : [];
      setTabs(list);
      setActivePadId((prev) => {
        if (prev && list.some((t) => t.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (err as { message?: string })?.message ||
        'Failed to load shared spaces';
      setError(String(message));
    }
  }, [isActive, orgId]);

  const fetchPad = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isActive) return;
      const padId = activePadIdRef.current;
      if (!padId) return;
      if (inFlightFetchRef.current) return;
      inFlightFetchRef.current = true;
      try {
        if (!opts?.silent) setLoading(true);
        const pad = orgId
          ? await apiClient.getAdminOrgPortalSharedPadById(
              orgId,
              padId,
              revisionRef.current || undefined
            )
          : await apiClient.getPortalSharedPadById(padId, revisionRef.current || undefined);

        if (!mountedRef.current) return;
        if (!pad || typeof pad !== 'object') {
          throw new Error('Shared space unavailable');
        }
        if (activePadIdRef.current !== padId) return;

        failStreakRef.current = 0;

        if (dirtyRef.current) {
          setError(null);
          return;
        }

        if (!pad.unchanged) {
          applyRemote(pad);
        }
        setError(null);
        setSyncState((s) => (s === 'saving' ? s : 'live'));
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        failStreakRef.current += 1;
        const message =
          (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
            ?.detail ||
          (err as { message?: string })?.message ||
          'Failed to load shared space';
        if (!opts?.silent || failStreakRef.current >= 2) {
          setError(String(message));
          setSyncState('error');
        }
      } finally {
        inFlightFetchRef.current = false;
        if (mountedRef.current && !opts?.silent) setLoading(false);
      }
    },
    [applyRemote, isActive, orgId]
  );

  const persist = useCallback(async () => {
    if (inFlightSaveRef.current) return;
    if (!dirtyRef.current) return;
    const padId = activePadIdRef.current;
    if (!padId) return;
    inFlightSaveRef.current = true;
    setSyncState('saving');
    const toSave = contentRef.current;
    const base = revisionRef.current;
    try {
      const pad = orgId
        ? await apiClient.putAdminOrgPortalSharedPadById(orgId, padId, {
            content: toSave,
            base_revision: base,
          })
        : await apiClient.putPortalSharedPadById(padId, {
            content: toSave,
            base_revision: base,
          });
      if (!mountedRef.current) return;
      if (!pad || typeof pad !== 'object') {
        throw new Error('Shared space save failed');
      }
      if (activePadIdRef.current !== padId) return;
      if (contentRef.current === toSave) {
        dirtyRef.current = false;
        setSyncState('saved');
      } else {
        setSyncState('saving');
      }
      setRevision(pad.revision ?? 0);
      revisionRef.current = pad.revision ?? 0;
      setUpdatedByName(pad.updated_by_name ?? null);
      setUpdatedAt(pad.updated_at ?? null);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const message =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (err as { message?: string })?.message ||
        'Failed to save';
      setError(String(message));
      setSyncState('error');
    } finally {
      inFlightSaveRef.current = false;
      if (dirtyRef.current && mountedRef.current) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => void persist(), SAVE_DEBOUNCE_MS);
      }
    }
  }, [orgId]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setSyncState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persist(), SAVE_DEBOUNCE_MS);
  }, [persist]);

  const flushAndSwitch = useCallback(
    async (nextId: string) => {
      if (nextId === activePadIdRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (dirtyRef.current) {
        await persist();
      }
      dirtyRef.current = false;
      revisionRef.current = 0;
      setRevision(0);
      setContent('');
      setEditing(false);
      setRenamingId(null);
      setActivePadId(nextId);
    },
    [persist]
  );

  const handleAddTab = async () => {
    if (creating || tabs.length >= MAX_PORTAL_SHARED_PADS) return;
    setCreating(true);
    setError(null);
    try {
      if (dirtyRef.current) await persist();
      const created = orgId
        ? await apiClient.createAdminOrgPortalSharedPad(orgId)
        : await apiClient.createPortalSharedPad();
      await loadTabs();
      setActivePadId(created.id);
      setEditing(true);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (err as { message?: string })?.message ||
        'Failed to add tab';
      setError(String(message));
    } finally {
      setCreating(false);
    }
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const padId = renamingId;
    const next = renameDraft.trim();
    const current = tabs.find((t) => t.id === padId);
    setRenamingId(null);
    if (!next || !current || next === current.title) return;
    try {
      const updated = orgId
        ? await apiClient.renameAdminOrgPortalSharedPad(orgId, padId, next)
        : await apiClient.renamePortalSharedPad(padId, next);
      setTabs((prev) =>
        prev.map((t) => (t.id === padId ? { ...t, title: updated.title || next } : t))
      );
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (err as { message?: string })?.message ||
        'Failed to rename';
      setError(String(message));
    }
  };

  const handleDeleteTab = async (padId: string) => {
    if (deletingId || tabs.length <= 1) return;
    const tab = tabs.find((t) => t.id === padId);
    const label = tab?.title || 'Shared space';
    if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;

    setDeletingId(padId);
    setError(null);
    try {
      if (padId === activePadIdRef.current) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        dirtyRef.current = false;
      }
      if (orgId) {
        await apiClient.deleteAdminOrgPortalSharedPad(orgId, padId);
      } else {
        await apiClient.deletePortalSharedPad(padId);
      }
      const remaining = tabs.filter((t) => t.id !== padId);
      setTabs(remaining);
      if (renamingId === padId) setRenamingId(null);
      if (activePadIdRef.current === padId) {
        const next = remaining[0];
        setActivePadId(next?.id ?? null);
        setContent('');
        setRevision(0);
        revisionRef.current = 0;
        setEditing(false);
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
          ?.detail ||
        (err as { message?: string })?.message ||
        'Failed to delete tab';
      setError(String(message));
      void loadTabs();
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isActive) return;
    void loadTabs();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void loadTabs();
    }, TAB_LIST_POLL_MS);
    return () => window.clearInterval(id);
  }, [isActive, loadTabs]);

  useEffect(() => {
    if (!isActive || !activePadId) return;
    revisionRef.current = 0;
    dirtyRef.current = false;
    void fetchPad();
  }, [fetchPad, isActive, activePadId, orgId]);

  useEffect(() => {
    if (!isActive || !activePadId) return;
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchPad({ silent: true });
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchPad, isActive, activePadId]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const statusLabel =
    syncState === 'saving'
      ? 'Syncing…'
      : syncState === 'saved'
        ? 'Saved'
        : syncState === 'error'
          ? 'Sync error'
          : 'Live';

  const atTabLimit = tabs.length >= MAX_PORTAL_SHARED_PADS;

  return (
    <section
      className={`glass-card p-4 sm:p-5 rounded-xl border border-gray-200 dark:border-white/10 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text">
            {title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {subtitle} Double-click a tab name to rename. Use × to delete (keep at least one). Up to{' '}
            {MAX_PORTAL_SHARED_PADS} tabs.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] tabular-nums">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
              syncState === 'error'
                ? 'border-red-300 text-red-700 dark:text-red-300'
                : syncState === 'saving'
                  ? 'border-amber-300 text-amber-800 dark:text-amber-200'
                  : 'border-emerald-300/70 text-emerald-800 dark:text-emerald-200'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                syncState === 'error'
                  ? 'bg-red-500'
                  : syncState === 'saving'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-emerald-500 animate-pulse'
              }`}
            />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3 border-b border-gray-200/80 dark:border-white/10 pb-2">
        {tabs.map((tab) => {
          const active = tab.id === activePadId;
          const renaming = renamingId === tab.id;
          return (
            <div
              key={tab.id}
              className={`group relative max-w-[10rem] sm:max-w-[12rem] rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-sky-400/60 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-100'
                  : 'border-transparent bg-gray-100/80 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-1">
                {renaming ? (
                  <input
                    ref={renameInputRef}
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void commitRename();
                      }
                      if (e.key === 'Escape') {
                        setRenamingId(null);
                      }
                    }}
                    maxLength={120}
                    className="w-full min-w-[5rem] bg-transparent outline-none text-xs font-medium"
                    aria-label="Rename shared space tab"
                  />
                ) : (
                  <button
                    type="button"
                    title="Double-click to rename"
                    onClick={() => void flushAndSwitch(tab.id)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenamingId(tab.id);
                      setRenameDraft(tab.title || 'Shared space');
                    }}
                    className="block min-w-0 flex-1 truncate text-left"
                  >
                    {tab.title || 'Shared space'}
                  </button>
                )}
                {tabs.length > 1 ? (
                  <button
                    type="button"
                    title={`Delete ${tab.title || 'tab'}`}
                    aria-label={`Delete ${tab.title || 'shared space tab'}`}
                    disabled={deletingId === tab.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDeleteTab(tab.id);
                    }}
                    className="shrink-0 rounded px-0.5 text-[11px] leading-none text-gray-400 opacity-70 hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => void handleAddTab()}
          disabled={creating || atTabLimit}
          title={atTabLimit ? `Maximum ${MAX_PORTAL_SHARED_PADS} tabs` : 'Add shared space'}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-gray-300 dark:border-white/20 text-gray-500 hover:text-gray-800 dark:hover:text-gray-100 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          +
        </button>
        <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
          {tabs.length}/{MAX_PORTAL_SHARED_PADS}
        </span>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-300 mb-2">{error}</p> : null}

      {loading && !content && !editing ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Loading…</p>
      ) : editing ? (
        <textarea
          value={content}
          autoFocus
          onChange={(e) => {
            setContent(e.target.value);
            contentRef.current = e.target.value;
            scheduleSave();
          }}
          onBlur={() => {
            if (dirtyRef.current) void persist();
            setEditing(false);
          }}
          placeholder="Start typing — your consultant and team see this live…"
          spellCheck
          className="w-full min-h-[220px] sm:min-h-[280px] resize-y rounded-lg border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-black/20 px-3 py-3 text-sm text-gray-900 dark:text-gray-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        />
      ) : (
        <LinkifiedContent text={content} onStartEdit={() => setEditing(true)} />
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
        <span>
          {updatedByName
            ? `Last edit by ${updatedByName}`
            : 'Waiting for the first edit'}
          {updatedAt
            ? ` · ${new Date(updatedAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}`
            : ''}
          {!editing ? ' · Click text to edit · Links open in a new tab' : ''}
        </span>
        <span className="tabular-nums">rev {revision || 1}</span>
      </div>
    </section>
  );
}
