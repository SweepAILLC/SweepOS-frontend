'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  CATEGORY_STYLES,
  docMetaToResource,
  isToolResource,
  mergeDocsWithAiSkills,
  type Resource,
} from '@/lib/resources';
import { ResourceModal } from '@/components/ui/ResourcesPanel';

type PortalToolsSectionProps = {
  isActive?: boolean;
};

export default function PortalToolsSection({ isActive = true }: PortalToolsSectionProps) {
  const [docs, setDocs] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openResource, setOpenResource] = useState<Resource | null>(null);
  const [isSystemOwner, setIsSystemOwner] = useState(false);

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

  const tools = useMemo(() => {
    const all = mergeDocsWithAiSkills(docs).filter(isToolResource);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [docs, search]);

  return (
    <section className="glass-card p-5 rounded-lg border border-gray-200 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 digitized-text">
            Tools
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            AI skills, guides, and templates — open while you work in Shared space.
          </p>
        </div>
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
            placeholder="Search tools…"
            className="pl-8 pr-3 py-1.5 text-xs rounded-md bg-white/70 dark:bg-black/30 border border-gray-200 dark:border-white/10 w-44 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-6">Loading tools…</p>
      ) : tools.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">
          {search ? `No tools match “${search}”.` : 'No tools available yet.'}
        </p>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((resource) => {
            const styles = CATEGORY_STYLES[resource.category];
            return (
              <button
                key={resource.id}
                type="button"
                onClick={() => setOpenResource(resource)}
                className={`text-left rounded-lg border border-gray-200/60 dark:border-white/10 bg-gradient-to-br ${styles.bg} p-3.5 hover:border-sky-400/40 transition-colors`}
              >
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles.badge}`}>
                  {resource.category}
                </span>
                <h4 className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                  {resource.title}
                </h4>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
                  {resource.description}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {openResource ? (
        <ResourceModal
          resource={openResource}
          canEditDocs={isSystemOwner}
          onClose={() => setOpenResource(null)}
          onSaved={async () => {
            await loadDocs();
            const rows = await apiClient.listDocs();
            const updated = rows.find((r) => r.resource_id === openResource.id);
            if (updated) setOpenResource(docMetaToResource(updated));
          }}
        />
      ) : null}
    </section>
  );
}
