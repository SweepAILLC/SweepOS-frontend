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
import {
  RESOURCE_MD_STYLES,
  SOP_CATEGORY_COLORS,
  SOP_CATEGORY_LABELS,
  SOP_ROW_ORDER,
  copyToClipboard,
  docMetaToResource,
  isSopResource,
  mergeDocsWithAiSkills,
  renderMarkdown,
  toVideoThumbnailUrl,
  toMediaEmbedUrl,
  getMediaEmbedKind,
  type Resource,
  type SopCategory,
} from '@/lib/resources';
import { CreateSopModal, ResourceModal } from '@/components/ui/ResourcesPanel';

/** Collapsed rail / open panel widths — keep in sync with OrgPortalPanel padding. */
export const SOP_DRAWER_WIDTH_COLLAPSED = '3.75rem';
/** Half of the portal content area (viewport minus main navbar). */
export const SOP_DRAWER_WIDTH_OPEN =
  'calc((100vw - var(--app-sidebar-width, 14rem)) / 2)';

type PortalSopDrawerProps = {
  isActive?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SopGroupKey = SopCategory | 'uncategorized';

function SopRowBody({
  sop,
  onOpen,
  dragHandle,
}: {
  sop: Resource;
  onOpen: (sop: Resource) => void;
  dragHandle?: ReactNode;
}) {
  const embedKind = getMediaEmbedKind(sop.videoUrl);
  const thumb = embedKind === 'video' ? toVideoThumbnailUrl(sop.videoUrl) : null;
  const showFigmaBadge = embedKind === 'figma';

  return (
    <div className="flex items-stretch gap-0.5 rounded-md border border-transparent hover:border-sky-300/50 hover:bg-sky-50/80 dark:hover:bg-sky-950/30 transition-colors">
      {dragHandle}
      <button
        type="button"
        onClick={() => onOpen(sop)}
        className="min-w-0 flex-1 text-left px-2.5 py-2"
      >
        <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">
          {sop.title}
        </span>
        <span className="mt-0.5 flex items-start gap-2">
          <span className="min-w-0 flex-1 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">
            {sop.description}
          </span>
          {thumb ? (
            <span className="relative flex-shrink-0 w-16 h-10 overflow-hidden rounded border border-gray-200/70 dark:border-white/10 bg-black/40">
              <img
                src={thumb}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget.parentElement as HTMLElement | null)?.style.setProperty(
                    'display',
                    'none'
                  );
                }}
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
                <svg className="w-3.5 h-3.5 text-white/90 drop-shadow" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M6.5 4.5v11l9-5.5-9-5.5z" />
                </svg>
              </span>
            </span>
          ) : showFigmaBadge ? (
            <span
              className="relative flex-shrink-0 w-16 h-10 overflow-hidden rounded border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/15 to-sky-500/20 flex flex-col items-center justify-center gap-0.5"
              title="Figma board embedded"
            >
              <svg className="w-4 h-4 text-fuchsia-400" viewBox="0 0 38 57" fill="currentColor" aria-hidden>
                <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
                <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
                <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
                <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
                <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
              </svg>
              <span className="text-[8px] font-bold uppercase tracking-wide text-fuchsia-300/90">Figma</span>
            </span>
          ) : null}
        </span>
      </button>
    </div>
  );
}

function PlainSopRow({ sop, onOpen }: { sop: Resource; onOpen: (sop: Resource) => void }) {
  return (
    <li>
      <SopRowBody sop={sop} onOpen={onOpen} />
    </li>
  );
}

function SortableSopRow({ sop, onOpen }: { sop: Resource; onOpen: (sop: Resource) => void }) {
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
        onOpen={onOpen}
        dragHandle={
          <button
            type="button"
            className="flex-shrink-0 px-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing touch-none"
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
  rows,
  canReorder,
  onOpen,
  onReorderGroup,
}: {
  groupKey: SopGroupKey;
  rows: Resource[];
  canReorder: boolean;
  onOpen: (sop: Resource) => void;
  onReorderGroup: (groupKey: SopGroupKey, activeId: string, overId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (rows.length === 0) return null;

  const heading =
    groupKey === 'uncategorized' ? (
      <h4 className="text-[10px] font-bold uppercase tracking-wider mb-1.5 text-gray-500">
        Uncategorized
      </h4>
    ) : (
      <h4
        className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${SOP_CATEGORY_COLORS[groupKey].heading}`}
      >
        {SOP_CATEGORY_LABELS[groupKey]}
      </h4>
    );

  if (!canReorder) {
    return (
      <div>
        {heading}
        <ul className="space-y-1">
          {rows.map((sop) => (
            <PlainSopRow key={sop.id} sop={sop} onOpen={onOpen} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
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
          <ul className="space-y-1">
            {rows.map((sop) => (
              <SortableSopRow key={sop.id} sop={sop} onOpen={onOpen} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export default function PortalSopDrawer({
  isActive = true,
  open,
  onOpenChange,
}: PortalSopDrawerProps) {
  const [docs, setDocs] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSop, setActiveSop] = useState<Resource | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSystemOwner, setIsSystemOwner] = useState(false);
  const [manageOpen, setManageOpen] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editResource, setEditResource] = useState<Resource | null>(null);
  const [reordering, setReordering] = useState(false);

  const loadDocs = useCallback(async () => {
    try {
      const rows = await apiClient.listDocs();
      setDocs(rows.map(docMetaToResource));
    } catch {
      setDocs([]);
    }
  }, []);

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
    let cancelled = false;
    apiClient
      .getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setIsSystemOwner(Boolean((user as { is_system_owner?: boolean }).is_system_owner));
        }
      })
      .catch(() => {
        if (!cancelled) setIsSystemOwner(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sops = useMemo(() => {
    const all = mergeDocsWithAiSkills(docs).filter(isSopResource);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.sopCategory && SOP_CATEGORY_LABELS[r.sopCategory].toLowerCase().includes(q))
    );
  }, [docs, search]);

  const grouped = useMemo(() => {
    const byCat = new Map<SopGroupKey, Resource[]>();
    for (const cat of SOP_ROW_ORDER) byCat.set(cat, []);
    byCat.set('uncategorized', []);
    for (const sop of sops) {
      const key: SopGroupKey =
        sop.sopCategory && SOP_ROW_ORDER.includes(sop.sopCategory) ? sop.sopCategory : 'uncategorized';
      byCat.get(key)!.push(sop);
    }
    return byCat;
  }, [sops]);

  const canReorder = isSystemOwner && !search.trim() && !reordering;

  const persistFullOrder = useCallback(
    async (nextGrouped: Map<SopGroupKey, Resource[]>) => {
      const orderedIds: string[] = [];
      for (const cat of SOP_ROW_ORDER) {
        for (const sop of nextGrouped.get(cat) || []) orderedIds.push(sop.id);
      }
      for (const sop of nextGrouped.get('uncategorized') || []) orderedIds.push(sop.id);

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
    [loadDocs]
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
      setVideoUrl('');
      return;
    }
    let cancelled = false;
    (async () => {
      setContentLoading(true);
      try {
        const doc = await apiClient.getDoc(activeSop.id);
        if (cancelled) return;
        setContent(doc.content || '');
        setVideoUrl(doc.video_url || activeSop.videoUrl || '');
      } catch {
        if (!cancelled) {
          setContent('*Failed to load document.*');
          setVideoUrl(activeSop.videoUrl || '');
        }
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSop]);

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

  const embed = videoUrl ? toMediaEmbedUrl(videoUrl) : null;
  const embedKind = getMediaEmbedKind(videoUrl);

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
                    {isSystemOwner
                      ? 'Drag handles to reorder · notes stay open'
                      : 'Foundations → Operations · notes stay open'}
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
                      {SOP_ROW_ORDER.map((cat) => (
                        <SopCategoryList
                          key={cat}
                          groupKey={cat}
                          rows={grouped.get(cat) || []}
                          canReorder={canReorder}
                          onOpen={setActiveSop}
                          onReorderGroup={handleReorderGroup}
                        />
                      ))}
                      <SopCategoryList
                        groupKey="uncategorized"
                        rows={grouped.get('uncategorized') || []}
                        canReorder={canReorder}
                        onOpen={setActiveSop}
                        onReorderGroup={handleReorderGroup}
                      />
                    </>
                  )}
                </div>

                {isSystemOwner ? (
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
                          Create, edit, and drag-reorder platform SOPs shown to every org in this drawer.
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
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {activeSop.sopCategory ? (
                  <span
                    className={`inline-flex mb-2 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      SOP_CATEGORY_COLORS[activeSop.sopCategory].badge
                    }`}
                  >
                    {SOP_CATEGORY_LABELS[activeSop.sopCategory]}
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
                  {isSystemOwner ? (
                    <button
                      type="button"
                      onClick={() => setEditResource(activeSop)}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>

                {embed ? (
                  <div
                    className={`mb-3 overflow-hidden rounded-lg border border-gray-200/60 dark:border-white/10 bg-black ${
                      embedKind === 'figma' ? 'aspect-[4/3] min-h-[280px]' : 'aspect-video'
                    }`}
                  >
                    <iframe
                      src={embed}
                      title={`${activeSop.title} ${embedKind === 'figma' ? 'Figma board' : 'video'}`}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                      allowFullScreen
                      loading="lazy"
                    />
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

      {showCreate && isSystemOwner ? (
        <CreateSopModal onClose={() => setShowCreate(false)} onCreated={(id) => void handleCreated(id)} />
      ) : null}

      {editResource ? (
        <ResourceModal
          resource={editResource}
          canEditDocs={isSystemOwner}
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
