'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  apiClient,
  type ContentAngleCard,
  type ContentAngleItem,
  type ContentAngleMap,
  type ContentAngleStage,
} from '@/lib/api';

const STAGES: Array<{
  id: ContentAngleStage;
  pillsKey: 'format_pills_tof' | 'format_pills_mof' | 'format_pills_bof';
  chip: string;
}> = [
  { id: 'tof', pillsKey: 'format_pills_tof', chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  { id: 'mof', pillsKey: 'format_pills_mof', chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  { id: 'bof', pillsKey: 'format_pills_bof', chip: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300' },
];

type ContentAngleMapViewProps = {
  orgId?: string;
  organizationName?: string | null;
  isActive?: boolean;
  plain?: boolean;
};

function formatUpdated(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function errDetail(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
    if (detail) return String(detail);
  }
  return fallback;
}

function AngleCard({
  title,
  items,
  canGenerate,
  regenerating,
  onSave,
  onRegenerate,
  onAdd,
  onDelete,
}: {
  title: string;
  items: ContentAngleItem[];
  canGenerate: boolean;
  regenerating: boolean;
  onSave: (id: string, text: string) => Promise<void>;
  onRegenerate: () => Promise<void>;
  onAdd: (text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200/70 dark:border-white/10 bg-white/40 dark:bg-white/[0.03] p-3.5 h-auto">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        <button
          type="button"
          className="cam-no-print text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40"
          disabled={regenerating || !canGenerate}
          onClick={() => onRegenerate()}
        >
          {regenerating ? '…' : 'Regen'}
        </button>
      </div>
      <ul className="divide-y divide-gray-200/70 dark:divide-white/10">
        {items.map((row) => {
          const editing = editingId === row.id;
          return (
            <li key={row.id} className="py-1.5 flex items-center gap-2">
              {editing ? (
                <input
                  className="flex-1 text-sm px-2 py-1 rounded-md glass-input focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={async () => {
                    const next = draft.trim();
                    setEditingId(null);
                    if (next && next !== row.text) await onSave(row.id, next);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 text-left text-sm text-gray-800 dark:text-gray-200 hover:text-sky-700 dark:hover:text-sky-300"
                  onClick={() => {
                    setDraft(row.text);
                    setEditingId(row.id);
                  }}
                >
                  {row.text}
                </button>
              )}
              <button
                type="button"
                className="cam-no-print text-gray-400 hover:text-rose-500 text-xs leading-none"
                aria-label="Delete"
                onClick={() => onDelete(row.id)}
              >
                ×
              </button>
            </li>
          );
        })}
        {adding ? (
          <li className="py-1.5">
            <input
              className="w-full text-sm px-2 py-1 rounded-md glass-input focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              value={draft}
              autoFocus
              placeholder="Angle"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={async () => {
                const next = draft.trim();
                setAdding(false);
                if (next) await onAdd(next);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setAdding(false);
              }}
            />
          </li>
        ) : (
          <li className="pt-1.5 cam-no-print">
            <button
              type="button"
              className="text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              onClick={() => {
                setDraft('');
                setAdding(true);
              }}
            >
              + Add
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function StagePills({
  stage,
  pills,
  onChange,
}: {
  stage: ContentAngleStage;
  pills: string[];
  onChange: (stage: ContentAngleStage, pills: string[]) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const meta = STAGES.find((s) => s.id === stage);

  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5 border-b border-gray-200/70 dark:border-white/10 last:border-0">
      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta?.chip}`}>
        {stage.toUpperCase()}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {pills.map((pill) => (
          <span
            key={pill}
            className="inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full bg-white/50 dark:bg-white/5 border border-gray-200/80 dark:border-white/10 text-gray-700 dark:text-gray-300"
          >
            {pill}
            <button
              type="button"
              className="cam-no-print text-gray-400 hover:text-rose-500 leading-none"
              aria-label={`Remove ${pill}`}
              onClick={() => onChange(stage, pills.filter((p) => p !== pill))}
            >
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <input
            className="w-36 text-[11px] px-2 py-0.5 rounded-full glass-input focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            value={draft}
            autoFocus
            placeholder="Format"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={async () => {
              const next = draft.trim();
              setAdding(false);
              setDraft('');
              if (next && !pills.some((p) => p.toLowerCase() === next.toLowerCase())) {
                await onChange(stage, [...pills, next]);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setAdding(false);
                setDraft('');
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="cam-no-print text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 px-1.5"
            onClick={() => {
              setDraft('');
              setAdding(true);
            }}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

export default function ContentAngleMapView({
  orgId,
  organizationName,
  isActive = true,
  plain = false,
}: ContentAngleMapViewProps) {
  const [data, setData] = useState<ContentAngleMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenCard, setRegenCard] = useState<ContentAngleCard | null>(null);

  const load = useCallback(async () => {
    const row = orgId
      ? await apiClient.getAdminContentAngleMap(orgId)
      : await apiClient.getContentAngleMap();
    setData(row);
    setError(null);
  }, [orgId]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e: unknown) {
        if (!cancelled) setError(errDetail(e, 'Could not load map.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive, load]);

  const displayName = data?.organization_name || organizationName || '';
  const updated = formatUpdated(data?.last_generated_at);

  const saveAngle = useCallback(
    async (card: ContentAngleCard, id: string, text: string) => {
      const payload = { card, id, text };
      const row = orgId
        ? await apiClient.patchAdminContentAngleMapAngle(orgId, payload)
        : await apiClient.patchContentAngleMapAngle(payload);
      setData(row);
    },
    [orgId]
  );

  const addAngle = useCallback(
    async (card: ContentAngleCard, text: string) => {
      await saveAngle(card, crypto.randomUUID(), text);
    },
    [saveAngle]
  );

  const deleteAngle = useCallback(
    async (card: ContentAngleCard, id: string) => {
      const row = orgId
        ? await apiClient.deleteAdminContentAngleMapAngle(orgId, { card, id })
        : await apiClient.deleteContentAngleMapAngle({ card, id });
      setData(row);
    },
    [orgId]
  );

  const savePills = useCallback(
    async (stage: ContentAngleStage, pills: string[]) => {
      const row = orgId
        ? await apiClient.putAdminContentAngleMapPills(orgId, { stage, pills })
        : await apiClient.putContentAngleMapPills({ stage, pills });
      setData(row);
    },
    [orgId]
  );

  const regenerate = useCallback(
    async (card: ContentAngleCard) => {
      setRegenCard(card);
      try {
        const row = orgId
          ? await apiClient.regenerateAdminContentAngleMap(orgId, { card, full: false })
          : await apiClient.regenerateContentAngleMap({ card, full: false });
        setData(row);
        setError(null);
      } catch (e: unknown) {
        setError(errDetail(e, 'Regen failed.'));
      } finally {
        setRegenCard(null);
      }
    },
    [orgId]
  );

  return (
    <section className={plain ? '' : 'glass-card p-5 rounded-lg border border-gray-200 dark:border-white/10'}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          {plain ? null : (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 digitized-text">
              Content Angle Map
            </h3>
          )}
          {updated ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{updated}</p>
          ) : null}
          {error ? <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{error}</p> : null}
        </div>
        <button
          type="button"
          className="cam-no-print text-xs font-medium px-2.5 py-1 rounded-md glass-button-secondary hover:border-sky-400/40"
          onClick={() => window.print()}
        >
          Export
        </button>
      </div>

      <div id="content-angle-map-print">
        <p className="hidden print:block text-sm font-semibold mb-3">
          Content Angle Map{displayName ? ` · ${displayName}` : ''}
        </p>

        {loading && !data ? (
          <div className="h-24 rounded-lg bg-gray-200/60 dark:bg-white/5 animate-pulse" />
        ) : (
          <div className="space-y-4">
            <div>
              {STAGES.map((stage) => (
                <StagePills
                  key={stage.id}
                  stage={stage.id}
                  pills={data?.[stage.pillsKey] || []}
                  onChange={savePills}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <AngleCard
                title="ICP"
                items={data?.icp_angles || []}
                canGenerate={Boolean(data?.can_generate_icp)}
                regenerating={regenCard === 'icp'}
                onSave={(id, text) => saveAngle('icp', id, text)}
                onRegenerate={() => regenerate('icp')}
                onAdd={(text) => addAngle('icp', text)}
                onDelete={(id) => deleteAngle('icp', id)}
              />
              <AngleCard
                title="Brand"
                items={data?.personal_brand_angles || []}
                canGenerate={Boolean(data?.can_generate_brand)}
                regenerating={regenCard === 'personal_brand'}
                onSave={(id, text) => saveAngle('personal_brand', id, text)}
                onRegenerate={() => regenerate('personal_brand')}
                onAdd={(text) => addAngle('personal_brand', text)}
                onDelete={(id) => deleteAngle('personal_brand', id)}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
