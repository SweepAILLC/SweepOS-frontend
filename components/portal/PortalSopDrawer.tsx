'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiClient } from '@/lib/api';
import { MAIN_ORG_ID } from '@/lib/orgScope';
import {
  RESOURCE_MD_STYLES,
  copyToClipboard,
  docMetaToResource,
  isSopResource,
  mergeDocsWithAiSkills,
  renderMarkdown,
  toMediaEmbedUrl,
  getMediaEmbedKind,
  resourceEmbedUrls,
  sopColorStyle,
  type Resource,
  type SopColorStyle,
} from '@/lib/resources';
import { useSopCategories } from '@/hooks/useSopCategories';
import { CreateSopModal, ResourceModal } from '@/components/ui/ResourcesPanel';
import SopThumb from '@/components/portal/SopThumb';
import SopCategoryManager from '@/components/portal/SopCategoryManager';

/** Collapsed rail / open panel widths — keep in sync with OrgPortalPanel padding. */
export const SOP_DRAWER_WIDTH_COLLAPSED = '3.75rem';
/** Half of the portal content area (viewport minus main navbar). */
export const SOP_DRAWER_WIDTH_OPEN =
  'calc((100vw - var(--app-sidebar-width, 14rem)) / 2)';

type PortalSopDrawerProps = {
  isActive?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, system owners in Sweep Internal can create/edit/reorder SOPs. Client portals must leave this off. */
  allowManage?: boolean;
  /** System owner previewing an org: that org's SOP locks apply. */
  asOrgId?: string;
};

const UNCATEGORIZED = 'uncategorized';
type SopGroupKey = string;

function SopRowBody({
  sop,
  loomThumbs,
  onOpen,
  dragHandle,
}: {
  sop: Resource;
  loomThumbs: Record<string, string | null>;
  onOpen: (sop: Resource) => void;
  dragHandle?: ReactNode;
}) {
  // Fixed row height + fixed thumbnail slot: every row is the same size regardless of content.
  return (
    <div className="flex h-[68px] items-center rounded-lg border border-gray-200/70 dark:border-white/10 bg-white dark:bg-white/[0.03] transition-colors hover:border-sky-300/60 hover:bg-sky-50/70 dark:hover:bg-sky-950/30">
      {dragHandle}
      <button
        type="button"
        onClick={() => onOpen(sop)}
        className="flex h-full min-w-0 flex-1 items-center gap-3 px-2.5 text-left"
      >
        <SopThumb urls={resourceEmbedUrls(sop)} loomThumbs={loomThumbs} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{sop.title}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-gray-500 dark:text-gray-400 line-clamp-2">
            {sop.description}
          </span>
        </span>
        <svg
          className="h-3.5 w-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

/** Section for a category the owner locked for this org: blurred placeholder rows under a lock. */
function LockedCategorySection({
  label,
  style,
  count,
}: {
  label: string;
  style: SopColorStyle;
  count: number;
}) {
  const placeholders = Math.min(3, Math.max(2, count));
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 border-b border-gray-200/70 dark:border-white/10 pb-1.5">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${style.dot}`} />
        <h4 className={`text-[11px] font-bold uppercase tracking-wider ${style.heading}`}>{label}</h4>
        <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Locked">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <div className="relative overflow-hidden rounded-lg">
        <ul aria-hidden className="pointer-events-none select-none space-y-1.5 blur-sm opacity-60">
          {Array.from({ length: placeholders }).map((_, i) => (
            <li
              key={i}
              className="flex h-[68px] items-center gap-3 rounded-lg border border-gray-200/70 dark:border-white/10 bg-white dark:bg-white/[0.03] px-2.5"
            >
              <span className="h-[52px] w-20 flex-shrink-0 rounded-md bg-gray-200 dark:bg-white/10" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="block h-2.5 w-3/4 rounded bg-gray-300 dark:bg-white/20" />
                <span className="block h-2 w-full rounded bg-gray-200 dark:bg-white/10" />
              </span>
            </li>
          ))}
        </ul>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white/40 dark:bg-black/30 px-4 text-center">
          <svg className="h-6 w-6 text-gray-500 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{label} is locked</p>
          <p className="text-[11px] leading-snug text-gray-700 dark:text-gray-300">
            This feature isn&apos;t included in your current tier. To unlock <strong>{label}</strong>, speak with your
            assigned consultant about upgrading your consulting tier.
          </p>
        </div>
      </div>
    </section>
  );
}

function PlainSopRow({
  sop,
  loomThumbs,
  onOpen,
}: {
  sop: Resource;
  loomThumbs: Record<string, string | null>;
  onOpen: (sop: Resource) => void;
}) {
  return (
    <li>
      <SopRowBody sop={sop} loomThumbs={loomThumbs} onOpen={onOpen} />
    </li>
  );
}

function SortableSopRow({
  sop,
  loomThumbs,
  onOpen,
}: {
  sop: Resource;
  loomThumbs: Record<string, string | null>;
  onOpen: (sop: Resource) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sop.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className={isDragging ? 'relative z-10' : undefined}>
      <SopRowBody
        sop={sop}
        loomThumbs={loomThumbs}
        onOpen={onOpen}
        dragHandle={
          <button
            type="button"
            className="flex h-full flex-shrink-0 items-center pl-2 text-gray-300 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing touch-none"
            aria-label={`Drag to reorder ${sop.title}`}
            title="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm8-12a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0zm0 6a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          </button>
        }
      />
    </li>
  );
}

function SopCategoryList({
  groupKey,
  label,
  style,
  rows,
  loomThumbs,
  canReorder,
  showEmpty,
  onOpen,
  onReorderGroup,
}: {
  groupKey: SopGroupKey;
  label: string;
  style: SopColorStyle;
  rows: Resource[];
  loomThumbs: Record<string, string | null>;
  canReorder: boolean;
  /** Owners see empty categories so newly created ones are visible. */
  showEmpty: boolean;
  onOpen: (sop: Resource) => void;
  onReorderGroup: (groupKey: SopGroupKey, activeId: string, overId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (rows.length === 0 && !showEmpty) return null;

  const heading = (
    <div className="mb-2 flex items-center gap-2 border-b border-gray-200/70 dark:border-white/10 pb-1.5">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${style.dot}`} />
      <h4 className={`text-[11px] font-bold uppercase tracking-wider ${style.heading}`}>{label}</h4>
      <span className="rounded-full bg-gray-100 dark:bg-white/10 px-1.5 text-[10px] font-semibold leading-4 text-gray-500 dark:text-gray-400">
        {rows.length}
      </span>
    </div>
  );

  if (rows.length === 0) {
    return (
      <section>
        {heading}
        <p className="rounded-lg border border-dashed border-gray-200 dark:border-white/10 px-3 py-3 text-center text-[11px] text-gray-400">
          No SOPs in this category yet.
        </p>
      </section>
    );
  }

  if (!canReorder) {
    return (
      <section>
        {heading}
        <ul className="space-y-1.5">
          {rows.map((sop) => (
            <PlainSopRow key={sop.id} sop={sop} loomThumbs={loomThumbs} onOpen={onOpen} />
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section>
      {heading}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event: DragEndEvent) => {
          const { active, over } = event;
          if (!over || active.id === over.id) return;
          onReorderGroup(groupKey, String(active.id), String(over.id));
        }}
      >
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {rows.map((sop) => (
              <SortableSopRow key={sop.id} sop={sop} loomThumbs={loomThumbs} onOpen={onOpen} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}

export default function PortalSopDrawer({
  isActive = true,
  open,
  onOpenChange,
  allowManage = false,
  asOrgId,
}: PortalSopDrawerProps) {
  const [docs, setDocs] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSop, setActiveSop] = useState<Resource | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [manageOpen, setManageOpen] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editResource, setEditResource] = useState<Resource | null>(null);
  const [reordering, setReordering] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [loomThumbs, setLoomThumbs] = useState<Record<string, string | null>>({});
  const { categories, reload: reloadCategories, labelFor, styleFor } = useSopCategories(isActive, asOrgId);

  const loadDocs = useCallback(async () => {
    try {
      const rows = await apiClient.listDocs({ includeLocked: true, asOrgId });
      setDocs(rows.map(docMetaToResource));
    } catch {
      setDocs([]);
    }
  }, [asOrgId]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadDocs();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isActive, loadDocs]);

  useEffect(() => {
    if (!allowManage) {
      setCanManage(false);
      return;
    }
    let cancelled = false;
    apiClient
      .getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        const isOwner = Boolean((user as { is_system_owner?: boolean }).is_system_owner);
        const orgId = String((user as { org_id?: string }).org_id || '');
        setCanManage(isOwner && orgId === MAIN_ORG_ID);
      })
      .catch(() => {
        if (!cancelled) setCanManage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowManage]);

  const sops = useMemo(() => {
    const all = mergeDocsWithAiSkills(docs).filter(isSopResource);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        !r.locked &&
        (r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        labelFor(r.sopCategory).toLowerCase().includes(q))
    );
  }, [docs, search, labelFor]);

  const grouped = useMemo(() => {
    const byCat = new Map<SopGroupKey, Resource[]>();
    for (const cat of categories) byCat.set(cat.slug, []);
    byCat.set(UNCATEGORIZED, []);
    for (const sop of sops) {
      const key = sop.sopCategory && byCat.has(sop.sopCategory) ? sop.sopCategory : UNCATEGORIZED;
      byCat.get(key)!.push(sop);
    }
    return byCat;
  }, [sops, categories]);

  const sopCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sop of mergeDocsWithAiSkills(docs).filter(isSopResource)) {
      if (sop.sopCategory) counts[sop.sopCategory] = (counts[sop.sopCategory] || 0) + 1;
    }
    return counts;
  }, [docs]);

  // Resolve Loom thumbnails server-side (Loom has no stable public thumbnail URL).
  useEffect(() => {
    const wanted = new Set<string>();
    for (const doc of docs) {
      for (const url of resourceEmbedUrls(doc)) {
        if (getMediaEmbedKind(url) === 'loom' && !(url in loomThumbs)) wanted.add(url);
      }
    }
    if (wanted.size === 0) return;
    let cancelled = false;
    apiClient
      .getVideoThumbnails(Array.from(wanted))
      .then((map) => {
        if (!cancelled) setLoomThumbs((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {
        if (cancelled) return;
        setLoomThumbs((prev) => {
          const next = { ...prev };
          wanted.forEach((u) => (next[u] = null));
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [docs, loomThumbs]);

  const canReorder = canManage && !search.trim() && !reordering;

  const persistFullOrder = useCallback(
    async (nextGrouped: Map<SopGroupKey, Resource[]>) => {
      const orderedIds: string[] = [];
      for (const cat of categories) {
        for (const sop of nextGrouped.get(cat.slug) || []) orderedIds.push(sop.id);
      }
      for (const sop of nextGrouped.get(UNCATEGORIZED) || []) orderedIds.push(sop.id);

      // Optimistic local update so the list feels immediate.
      setDocs((prev) => {
        const byId = new Map(prev.map((d) => [d.id, d]));
        const updated = orderedIds
          .map((id, index) => {
            const existing = byId.get(id);
            if (!existing) return null;
            return { ...existing, sortOrder: index };
          })
          .filter(Boolean) as Resource[];
        const remaining = prev.filter((d) => !orderedIds.includes(d.id));
        return [...updated, ...remaining];
      });

      setReordering(true);
      try {
        const rows = await apiClient.reorderDocs(orderedIds);
        setDocs(rows.map(docMetaToResource));
      } catch {
        await loadDocs();
      } finally {
        setReordering(false);
      }
    },
    [loadDocs, categories]
  );

  const handleReorderGroup = useCallback(
    (groupKey: SopGroupKey, activeId: string, overId: string) => {
      const rows = [...(grouped.get(groupKey) || [])];
      const oldIndex = rows.findIndex((r) => r.id === activeId);
      const newIndex = rows.findIndex((r) => r.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

      const nextRows = arrayMove(rows, oldIndex, newIndex);
      const nextGrouped = new Map(grouped);
      nextGrouped.set(groupKey, nextRows);
      void persistFullOrder(nextGrouped);
    },
    [grouped, persistFullOrder]
  );

  useEffect(() => {
    if (!activeSop) {
      setContent(null);
      setVideoUrls([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setContentLoading(true);
      try {
        const doc = await apiClient.getDoc(activeSop.id, { asOrgId });
        if (cancelled) return;
        setContent(doc.content || '');
        const fromDoc =
          Array.isArray((doc as { video_urls?: string[] }).video_urls) &&
          (doc as { video_urls?: string[] }).video_urls!.length > 0
            ? (doc as { video_urls: string[] }).video_urls
            : null;
        setVideoUrls(
          fromDoc ||
            resourceEmbedUrls({
              videoUrl: doc.video_url || activeSop.videoUrl,
              videoUrls: activeSop.videoUrls,
            })
        );
      } catch {
        if (!cancelled) {
          setContent('*Failed to load document.*');
          setVideoUrls(resourceEmbedUrls(activeSop));
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSop, asOrgId]);

  const collapse = () => {
    onOpenChange(false);
    setActiveSop(null);
  };

  const handleCreated = async (resourceId: string) => {
    setShowCreate(false);
    await loadDocs();
    const rows = await apiClient.listDocs();
    const created = rows.find((r) => r.resource_id === resourceId);
    if (created) {
      const resource = docMetaToResource(created);
      setActiveSop(resource);
      onOpenChange(true);
    }
  };

  const embeds = videoUrls
    .map((raw) => ({ raw, src: toMediaEmbedUrl(raw), kind: getMediaEmbedKind(raw) }))
    .filter((e): e is { raw: string; src: string; kind: NonNullable<ReturnType<typeof getMediaEmbedKind>> } =>
      Boolean(e.src && e.kind)
    );

  return (
    <>
      <style jsx global>{RESOURCE_MD_STYLES}</style>

      {/* Mobile dimmer when open */}
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[45] bg-black/35 md:hidden"
          aria-label="Close SOP drawer overlay"
          onClick={collapse}
        />
      ) : null}

      <aside
        className="fixed top-0 right-0 bottom-0 z-[46] flex flex-col border-l border-gray-200 dark:border-white/10 bg-white/95 dark:bg-gray-950/95 backdrop-blur shadow-[-8px_0_24px_rgba(0,0,0,0.06)] transition-[width] duration-300 ease-out"
        style={{ width: open ? SOP_DRAWER_WIDTH_OPEN : SOP_DRAWER_WIDTH_COLLAPSED }}
        aria-expanded={open}
      >
        {!open ? (
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="h-full w-full flex flex-col items-center justify-center gap-4 bg-sky-50/80 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors border-l-2 border-sky-400/50"
            title="Open SOP library"
          >
            <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span
              className="text-xs font-bold uppercase tracking-[0.22em] text-sky-800 dark:text-sky-200"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              SOP library
            </span>
          </button>
        ) : (
          <div className="h-full w-full flex flex-col overflow-hidden">
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-3 border-b border-gray-200/80 dark:border-white/10">
              {activeSop ? (
                <button
                  type="button"
                  onClick={() => setActiveSop(null)}
                  className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10"
                  aria-label="Back to SOP list"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {activeSop ? activeSop.title : 'SOP library'}
                </h3>
                {!activeSop ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {canManage
                      ? 'Drag handles to reorder · notes stay open'
                      : 'Grouped by category · notes stay open'}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={collapse}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10"
                aria-label="Collapse SOP drawer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {!activeSop ? (
              <>
                <div className="flex-shrink-0 px-3 py-2 border-b border-gray-100 dark:border-white/5">
                  <div className="relative">
                    <svg
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search SOPs…"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                  {loading ? (
                    <p className="text-xs text-gray-500 py-8 text-center">Loading SOPs…</p>
                  ) : sops.length === 0 ? (
                    <p className="text-xs text-gray-500 py-8 text-center">
                      {search ? `No SOPs match “${search}”.` : 'No SOPs yet.'}
                    </p>
                  ) : (
                    <>
                      {categories.map((cat) =>
                        cat.locked ? (
                          search.trim() ? null : (
                            <LockedCategorySection
                              key={cat.slug}
                              label={cat.label}
                              style={sopColorStyle(cat.color)}
                              count={sopCounts[cat.slug] || 0}
                            />
                          )
                        ) : (
                        <SopCategoryList
                          key={cat.slug}
                          groupKey={cat.slug}
                          label={cat.label}
                          style={sopColorStyle(cat.color)}
                          rows={grouped.get(cat.slug) || []}
                          loomThumbs={loomThumbs}
                          canReorder={canReorder}
                          showEmpty={canManage && !search.trim()}
                          onOpen={setActiveSop}
                          onReorderGroup={handleReorderGroup}
                        />
                        ),
                      )}
                      <SopCategoryList
                        groupKey={UNCATEGORIZED}
                        label="Uncategorized"
                        style={sopColorStyle('slate')}
                        rows={grouped.get(UNCATEGORIZED) || []}
                        loomThumbs={loomThumbs}
                        canReorder={canReorder}
                        showEmpty={false}
                        onOpen={setActiveSop}
                        onReorderGroup={handleReorderGroup}
                      />
                    </>
                  )}
                </div>

                {canManage ? (
                  <div className="flex-shrink-0 border-t border-gray-200 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => setManageOpen((v) => !v)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
                    >
                      <span>Manage resources</span>
                      <svg
                        className={`w-3.5 h-3.5 text-gray-400 transition-transform ${manageOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {manageOpen ? (
                      <div className="px-3 pb-3 space-y-2">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Edits here are the global SOP library. Every org sees this Sweep Internal version.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowCreate(true)}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-3 py-2"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          New SOP
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCategories(true)}
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 dark:border-white/15 hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200 text-xs font-semibold px-3 py-2"
                        >
                          Manage categories
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {labelFor(activeSop.sopCategory) ? (
                  <span
                    className={`inline-flex mb-2 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      styleFor(activeSop.sopCategory).badge
                    }`}
                  >
                    {labelFor(activeSop.sopCategory)}
                  </span>
                ) : null}
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{activeSop.description}</p>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <button
                    type="button"
                    disabled={contentLoading || !content}
                    onClick={() => {
                      void copyToClipboard(content || '').then(() => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1400);
                      });
                    }}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 disabled:opacity-40"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setEditResource(activeSop)}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>

                {embeds.length > 0 ? (
                  <div className="mb-3 space-y-3">
                    {embeds.map((item) => (
                      <div
                        key={item.raw}
                        className={`overflow-hidden rounded-lg border border-gray-200/60 dark:border-white/10 bg-black ${
                          item.kind === 'figma' ? 'aspect-[4/3] min-h-[280px]' : 'aspect-video'
                        }`}
                      >
                        <iframe
                          src={item.src}
                          title={`${activeSop.title} ${item.kind} embed`}
                          className="h-full w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                          allowFullScreen
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {contentLoading ? (
                  <p className="text-xs text-gray-500 py-10 text-center">Loading document…</p>
                ) : (
                  <div
                    className="resource-md-content text-xs leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(content || '') }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </aside>

      {showCategories && canManage ? (
        <SopCategoryManager
          categories={categories}
          counts={sopCounts}
          onClose={() => setShowCategories(false)}
          onChanged={async () => {
            await Promise.all([reloadCategories(), loadDocs()]);
          }}
        />
      ) : null}

      {showCreate && canManage ? (
        <CreateSopModal onClose={() => setShowCreate(false)} onCreated={(id) => void handleCreated(id)} />
      ) : null}

      {editResource ? (
        <ResourceModal
          resource={editResource}
          canEditDocs={canManage}
          onClose={() => setEditResource(null)}
          onSaved={async () => {
            await loadDocs();
            const rows = await apiClient.listDocs();
            const updated = rows.find((r) => r.resource_id === editResource.id);
            if (updated) {
              const next = docMetaToResource(updated);
              setEditResource(next);
              setActiveSop(next);
            }
          }}
        />
      ) : null}
    </>
  );
}
