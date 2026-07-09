'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Resource {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  fileName?: string;
  mcpRequired?: string[];
  prerequisites?: string[];
  outputSummary?: string;
  poweredBy?: string | null;
  isCustom?: boolean;
  isBuiltin?: boolean;
  updatedAt?: string | null;
}

type ResourceCategory = 'AI Skill' | 'SOP' | 'Template' | 'Guide';

const CATEGORY_STYLES: Record<ResourceCategory, { badge: string; bg: string }> = {
  'AI Skill': {
    badge: 'bg-violet-500/15 text-violet-400 border border-violet-500/25',
    bg: 'from-violet-600/10 to-violet-900/5',
  },
  SOP: {
    badge: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
    bg: 'from-blue-600/10 to-blue-900/5',
  },
  Template: {
    badge: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
    bg: 'from-emerald-600/10 to-emerald-900/5',
  },
  Guide: {
    badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
    bg: 'from-amber-600/10 to-amber-900/5',
  },
};

// AI Skills stay as static downloadable docs
const AI_SKILL_RESOURCES: Resource[] = [
  {
    id: 'instagram-content-audit',
    title: 'Instagram Content Audit',
    description:
      'Analyze a client\'s Instagram Reels using TokScript MCP. Surfaces hook quality, re-hooks, content formats, TOF/MOF/BOF balance, credibility signals, lead gen quality, and algorithm traction — in 2 pages, zero fluff.',
    category: 'AI Skill',
    fileName: 'instagram-content-audit.md',
    mcpRequired: ['TokScript (api.tokscript.com/mcp)'],
    outputSummary: '2-page audit with hook analysis, funnel map, credibility score, and top 3 fixes.',
  },
  {
    id: 'shorts-content-ideation',
    title: 'Shorts Content Ideation',
    description:
      'Cross-reference best-performing Instagram content with Fathom sales call data to generate 10 conversion-engineered short-form ideas. Every hook, re-hook, and CTA is mapped to a real objection or buyer trigger.',
    category: 'AI Skill',
    fileName: 'shorts-content-ideation.md',
    mcpRequired: ['TokScript (api.tokscript.com/mcp)', 'Fathom MCP'],
    prerequisites: ['Run Instagram Content Audit first', 'Run Sales Call Analysis first'],
    outputSummary: '10 ranked content ideas with hook, proof, re-hook, body, and CTA — prioritized by conversion impact.',
  },
  {
    id: 'sales-call-analysis',
    title: 'Sales Call Analysis',
    description:
      'Pull past sales and check-in call transcripts from Fathom MCP to diagnose objection patterns, discovery quality, pitch effectiveness, objection handling, and close mechanics — with real quotes and root-cause failure analysis.',
    category: 'AI Skill',
    fileName: 'sales-call-analysis.md',
    mcpRequired: ['Fathom MCP (see setup guide inside)'],
    outputSummary: '2-page holistic report: scores, top objections, discovery + pitch analysis, losses root-caused, wins highlighted.',
  },
];

function docMetaToResource(row: {
  resource_id: string;
  category: string;
  title: string;
  description: string;
  powered_by: string | null;
  is_custom: boolean;
  is_builtin: boolean;
  updated_at: string | null;
}): Resource {
  return {
    id: row.resource_id,
    title: row.title,
    description: row.description,
    category: (row.category as ResourceCategory) || 'SOP',
    poweredBy: row.powered_by,
    isCustom: row.is_custom,
    isBuiltin: row.is_builtin,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Lightweight markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre class="md-code-block"><code>${code.trimEnd()}</code></pre>`;
  });

  html = html.replace(/`([^`\n]+)`/g, '<code class="md-inline-code">$1</code>');
  html = html.replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  html = html.replace(/^---$/gm, '<hr class="md-hr" />');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/^\d+\.\s(.+)$/gm, '<li class="md-li md-ol">$1</li>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');
  html = html.replace(/\n\n/g, '</p><p class="md-p">');
  html = html.replace(/(?<!<\/pre>)\n(?!<)/g, '<br/>');

  return `<p class="md-p">${html}</p>`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: ResourceCategory }) {
  const styles = CATEGORY_STYLES[category];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${styles.badge}`}>
      {category === 'AI Skill' && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )}
      {category}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Resource detail modal
// ---------------------------------------------------------------------------

interface ResourceModalProps {
  resource: Resource;
  onClose: () => void;
  onSaved: () => void;
}

function ResourceModal({ resource, onClose, onSaved }: ResourceModalProps) {
  const isEditableDoc = resource.category === 'SOP' || resource.category === 'AI Skill' || resource.category === 'Guide' || resource.category === 'Template';
  const canEdit = isEditableDoc;

  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState(resource.title);
  const [draftDescription, setDraftDescription] = useState(resource.description);
  const [draftContent, setDraftContent] = useState('');
  const [draftPoweredBy, setDraftPoweredBy] = useState(resource.poweredBy || '');
  const backdropRef = useRef<HTMLDivElement>(null);

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      if (isEditableDoc) {
        const doc = await apiClient.getDoc(resource.id);
        setContent(doc.content || '');
        setDraftTitle(doc.title);
        setDraftDescription(doc.description);
        setDraftContent(doc.content || '');
        setDraftPoweredBy(doc.powered_by || '');
      } else if (resource.fileName) {
        const res = await fetch(`/resources/${resource.fileName}`);
        if (!res.ok) throw new Error('fetch failed');
        const text = await res.text();
        setContent(text);
      }
    } catch {
      setContent('*Failed to load document.*');
    } finally {
      setLoading(false);
    }
  }, [isEditableDoc, resource.fileName, resource.id]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, editing]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && !editing) onClose();
  };

  const handleDownload = () => {
    setDownloading(true);
    const blob = new Blob([content || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resource.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setTimeout(() => setDownloading(false), 800);
  };

  const handleEdit = () => {
    setDraftTitle(resource.title);
    setDraftDescription(resource.description);
    setDraftContent(content || '');
    setDraftPoweredBy(resource.poweredBy || '');
    setEditing(true);
    setSaveError(null);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!draftTitle.trim()) {
      setSaveError('Title is required.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.upsertDoc(resource.id, {
        category: resource.category,
        title: draftTitle.trim(),
        description: draftDescription.trim(),
        content: draftContent,
        powered_by: draftPoweredBy.trim() || null,
      });
      setContent(draftContent);
      setEditing(false);
      onSaved();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setSaveError(msg || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!resource.isBuiltin) return;
    if (!confirm('Reset this SOP to the default version? Your edits will be removed.')) return;
    setSaving(true);
    try {
      await apiClient.deleteDoc(resource.id);
      await loadContent();
      onSaved();
    } catch {
      setSaveError('Failed to reset SOP.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!resource.isCustom) return;
    if (!confirm('Delete this SOP permanently?')) return;
    setSaving(true);
    try {
      await apiClient.deleteDoc(resource.id);
      onSaved();
      onClose();
    } catch {
      setSaveError('Failed to delete SOP.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-gray-900 border border-gray-200/30 dark:border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-200/40 dark:border-white/8">
          <div className="flex items-center gap-3 min-w-0">
            <CategoryBadge category={resource.category} />
            {editing ? (
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="text-lg font-bold bg-transparent border-b border-violet-500/40 text-gray-900 dark:text-gray-100 focus:outline-none min-w-0 flex-1"
                placeholder="SOP title"
              />
            ) : (
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{resource.title}</h2>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && !editing && (
              <button
                onClick={handleEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-200 text-xs font-semibold transition-colors"
              >
                Edit
              </button>
            )}
            {!editing && (
              <button
                onClick={handleDownload}
                disabled={downloading || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Download
              </button>
            )}
            <button
              onClick={editing ? handleCancelEdit : onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Description</label>
                <textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={2}
                  className="w-full text-sm bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  placeholder="Short summary shown on the tile"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Powered by (optional)
                </label>
                <input
                  value={draftPoweredBy}
                  onChange={(e) => setDraftPoweredBy(e.target.value)}
                  className="w-full text-sm bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  placeholder="e.g. Used as context for Call Library"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Document (Markdown)
                </label>
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  rows={18}
                  className="w-full text-sm font-mono bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2.5 text-gray-100 placeholder-gray-500 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  placeholder="# SOP Title&#10;&#10;Write your SOP in markdown…"
                />
              </div>
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save SOP'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                {resource.isBuiltin && (
                  <button
                    onClick={handleReset}
                    disabled={saving}
                    className="px-4 py-2 text-xs font-semibold rounded-lg text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50 ml-auto"
                  >
                    Reset to default
                  </button>
                )}
                {resource.isCustom && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-4 py-2 text-xs font-semibold rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50 ml-auto"
                  >
                    Delete SOP
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {(resource.poweredBy || draftPoweredBy) && (
                <div className="flex items-start gap-2 mb-4 bg-violet-500/8 border border-violet-500/20 rounded-lg px-3 py-2.5">
                  <svg className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p className="text-xs text-violet-300 leading-relaxed">{resource.poweredBy || draftPoweredBy}</p>
                </div>
              )}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex items-center gap-2 text-gray-400">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm">Loading document…</span>
                  </div>
                </div>
              ) : (
                <div
                  className="resource-md-content text-sm text-gray-800 dark:text-gray-200 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content || '') }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create SOP modal
// ---------------------------------------------------------------------------

interface CreateSopModalProps {
  onClose: () => void;
  onCreated: (resourceId: string) => void;
}

function CreateSopModal({ onClose, onCreated }: CreateSopModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('# New SOP\n\n');
  const [poweredBy, setPoweredBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const doc = await apiClient.createDoc({
        category: 'SOP',
        title: title.trim(),
        description: description.trim(),
        content,
        powered_by: poweredBy.trim() || null,
      });
      onCreated(doc.resource_id);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(msg || 'Failed to create SOP.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-gray-900 border border-gray-200/30 dark:border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200/40 dark:border-white/8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">New SOP</h2>
          <p className="text-xs text-gray-500 mt-1">Create a new standard operating procedure for your team.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              placeholder="Discovery Call Audit"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full text-sm bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2 text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Document (Markdown)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              className="w-full text-sm font-mono bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2.5 text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex-shrink-0 flex items-center gap-2 px-6 py-4 border-t border-gray-200/40 dark:border-white/8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create SOP'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-gray-700/60 text-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org Library item modal (create/edit)
// ---------------------------------------------------------------------------

type OrgLibraryKind = 'text' | 'markdown' | 'image' | 'video_url' | 'url';
const ORG_LIBRARY_TAGS = ['testimonials', 'case_studies', 'value', 'SOP', 'ai', 'other'] as const;
type OrgLibraryTag = (typeof ORG_LIBRARY_TAGS)[number];

interface OrgLibraryDraft {
  kind: OrgLibraryKind;
  title: string;
  description: string;
  tags: OrgLibraryTag[];
  content_text?: string | null;
  content_url?: string | null;
  content_b64?: string | null;
  content_mime?: string | null;
}

function OrgLibraryItemModal({
  mode,
  initial,
  onClose,
  onSaved,
  onDeleted,
}: {
  mode: 'create' | 'edit';
  initial: OrgLibraryDraft & { id?: string };
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [draft, setDraft] = useState<OrgLibraryDraft>({
    kind: initial.kind,
    title: initial.title || '',
    description: initial.description || '',
    tags: (initial.tags || []) as OrgLibraryTag[],
    content_text: initial.content_text ?? '',
    content_url: initial.content_url ?? '',
    content_b64: initial.content_b64 ?? null,
    content_mime: initial.content_mime ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const toggleTag = (tag: OrgLibraryTag) => {
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag],
    }));
  };

  const handlePickImage = async (file: File | null) => {
    if (!file) return;
    const mime = file.type || 'image/png';
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : '';
    setDraft((d) => ({ ...d, content_b64: b64, content_mime: mime }));
  };

  const canEdit = true;

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        kind: draft.kind,
        title: draft.title,
        description: draft.description,
        tags: draft.tags,
        content_text: draft.kind === 'text' || draft.kind === 'markdown' ? (draft.content_text ?? '') : null,
        content_url: draft.kind === 'url' || draft.kind === 'video_url' ? (draft.content_url ?? '') : null,
        content_b64: draft.kind === 'image' ? draft.content_b64 ?? null : null,
        content_mime: draft.kind === 'image' ? draft.content_mime ?? null : null,
      };
      if (mode === 'create') {
        await apiClient.createOrgLibraryItem(body as any);
      } else {
        await apiClient.updateOrgLibraryItem(String(initial.id), body as any);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit || !initial.id) return;
    if (!confirm('Delete this library item?')) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.deleteOrgLibraryItem(initial.id);
      onDeleted?.();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to delete.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-gray-900 border border-gray-200/30 dark:border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200/40 dark:border-white/8 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {mode === 'create' ? 'New library item' : 'Library item'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Store org-specific resources (text/markdown, images, or video URLs) and tag them for retrieval.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Type</label>
              <select
                value={draft.kind}
                disabled={!canEdit || mode === 'edit'}
                onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as OrgLibraryKind }))}
                className="w-full text-sm bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-60"
              >
                <option value="markdown">Markdown</option>
                <option value="text">Text</option>
                <option value="image">Image (PNG/JPG)</option>
                <option value="video_url">Video URL</option>
                <option value="url">URL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Title</label>
              <input
                value={draft.title}
                disabled={!canEdit}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full text-sm bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-60"
                placeholder="e.g. Top 10 testimonials"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Description</label>
            <textarea
              value={draft.description}
              disabled={!canEdit}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={2}
              className="w-full text-sm bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2 text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-60"
              placeholder="Short context for your team / AI"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Tags</label>
            <div className="flex flex-wrap gap-2">
              {ORG_LIBRARY_TAGS.map((t) => {
                const active = draft.tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggleTag(t)}
                    className={`text-[11px] px-2 py-1 rounded border transition-colors disabled:opacity-60 ${
                      active
                        ? 'bg-violet-500/15 text-violet-300 border-violet-500/25'
                        : 'bg-gray-500/10 text-gray-400 border-gray-500/20 hover:border-violet-500/25'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {draft.kind === 'text' || draft.kind === 'markdown' ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Content ({draft.kind})
              </label>
              <textarea
                value={String(draft.content_text ?? '')}
                disabled={!canEdit}
                onChange={(e) => setDraft((d) => ({ ...d, content_text: e.target.value }))}
                rows={14}
                className="w-full text-sm font-mono bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2.5 text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-60"
                placeholder={draft.kind === 'markdown' ? '# Title\n\n...' : 'Paste text...'}
              />
            </div>
          ) : null}

          {draft.kind === 'url' || draft.kind === 'video_url' ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">URL</label>
              <input
                value={String(draft.content_url ?? '')}
                disabled={!canEdit}
                onChange={(e) => setDraft((d) => ({ ...d, content_url: e.target.value }))}
                className="w-full text-sm bg-gray-800/60 border border-gray-600/40 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-60"
                placeholder="https://..."
              />
            </div>
          ) : null}

          {draft.kind === 'image' ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Image</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                disabled={!canEdit}
                onChange={(e) => void handlePickImage(e.target.files?.[0] || null)}
                className="text-xs text-gray-300"
              />
              {draft.content_b64 && draft.content_mime ? (
                <div className="rounded-lg border border-gray-200/50 dark:border-white/10 p-2 bg-white/60 dark:bg-gray-900/20">
                  <img
                    alt="Uploaded preview"
                    className="max-h-64 w-auto rounded"
                    src={`data:${draft.content_mime};base64,${draft.content_b64}`}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>

        <div className="flex-shrink-0 flex items-center gap-2 px-6 py-4 border-t border-gray-200/40 dark:border-white/8">
          {canEdit ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {mode === 'edit' ? (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 ml-auto"
                >
                  Delete
                </button>
              ) : null}
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-gray-700/60 text-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-gray-700/60 text-gray-300"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Square resource tile
// ---------------------------------------------------------------------------

interface ResourceTileProps {
  resource: Resource;
  onClick: () => void;
}

function ResourceTile({ resource, onClick }: ResourceTileProps) {
  const catStyle = CATEGORY_STYLES[resource.category];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative aspect-square w-full rounded-lg border border-gray-200/20 dark:border-white/8 hover:border-violet-500/40 bg-gradient-to-br ${catStyle.bg} dark:bg-gray-800/40 p-5 flex flex-col text-left transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/5 hover:scale-[1.02] active:scale-[0.98]`}
    >
      <div className="absolute top-3 right-3 opacity-60 group-hover:opacity-100 transition-opacity">
        {resource.category === 'AI Skill' ? (
          <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ) : resource.category === 'SOP' ? (
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        )}
      </div>

      <CategoryBadge category={resource.category} />

      <h3 className="mt-3 text-base font-bold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2">
        {resource.title}
      </h3>

      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3 flex-1">
        {resource.description}
      </p>

      <div className="mt-auto pt-3 flex flex-wrap gap-1">
        {resource.mcpRequired && resource.mcpRequired.length > 0
          ? resource.mcpRequired.map((mcp) => (
              <span
                key={mcp}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-500/10 text-gray-500 dark:text-gray-500 border border-gray-500/15 truncate max-w-full"
              >
                {mcp}
              </span>
            ))
          : resource.poweredBy
            ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
                Powers product features
              </span>
            )
            : resource.isCustom
              ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Custom SOP
                </span>
              )
              : null}
      </div>

      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-gray-400 flex items-center gap-1">
          Open
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </button>
  );
}

const ALL_CATEGORIES: Array<ResourceCategory | 'All'> = ['All', 'AI Skill', 'SOP', 'Template', 'Guide'];

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function ResourcesPanel() {
  const [docs, setDocs] = useState<Resource[]>([]);
  const [view, setView] = useState<'docs' | 'library'>('docs');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ResourceCategory | 'All'>('All');
  const [search, setSearch] = useState('');
  const [openResource, setOpenResource] = useState<Resource | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Org library
  const [libraryItems, setLibraryItems] = useState<Array<any>>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [showNewLibraryItem, setShowNewLibraryItem] = useState(false);
  const [openLibraryItem, setOpenLibraryItem] = useState<any | null>(null);
  const [libraryTagFilter, setLibraryTagFilter] = useState<OrgLibraryTag | 'All'>('All');

  const loadDocs = useCallback(async () => {
    try {
      const rows = await apiClient.listDocs();
      setDocs(rows.map(docMetaToResource));
    } catch {
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadDocs();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadDocs]);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const items = await apiClient.listOrgLibrary();
      setLibraryItems(Array.isArray(items) ? items : []);
    } catch (e: any) {
      setLibraryError(e?.response?.data?.detail || 'Failed to load library.');
      setLibraryItems([]);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const merged: Resource[] = [];
  const fromDb = new Map(docs.map((d) => [d.id, d]));
  for (const skill of AI_SKILL_RESOURCES) {
    merged.push(fromDb.get(skill.id) ?? skill);
  }
  for (const doc of docs) {
    if (!AI_SKILL_RESOURCES.some((s) => s.id === doc.id)) merged.push(doc);
  }
  const allResources = merged;

  const handleClose = useCallback(() => setOpenResource(null), []);

  const handleSaved = useCallback(async () => {
    await loadDocs();
    if (openResource) {
      const rows = await apiClient.listDocs();
      const updated = rows.find((r) => r.resource_id === openResource.id);
      if (updated) setOpenResource(docMetaToResource(updated));
    }
  }, [loadDocs, openResource]);

  const handleCreated = useCallback(async (resourceId: string) => {
    setShowCreate(false);
    await loadDocs();
    const rows = await apiClient.listDocs();
    const created = rows.find((r) => r.resource_id === resourceId);
    if (created) setOpenResource(docMetaToResource(created));
  }, [loadDocs]);

  const filtered = allResources.filter((r) => {
    const matchesCategory = filter === 'All' || r.category === filter;
    const searchLower = search.toLowerCase();
    const matchesSearch =
      !searchLower ||
      r.title.toLowerCase().includes(searchLower) ||
      r.description.toLowerCase().includes(searchLower) ||
      r.category.toLowerCase().includes(searchLower);
    return matchesCategory && matchesSearch;
  });

  const availableCategories = ALL_CATEGORIES.filter((cat) => {
    if (cat === 'All') return true;
    return allResources.some((r) => r.category === cat);
  });

  const availableLibraryTags = useMemo(() => {
    const used = new Set<string>();
    for (const it of libraryItems) {
      if (!Array.isArray(it.tags)) continue;
      for (const t of it.tags) used.add(String(t));
    }
    return ORG_LIBRARY_TAGS.filter((t) => used.has(t));
  }, [libraryItems]);

  const filteredLibraryItems = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    return libraryItems.filter((it) => {
      const tags: string[] = Array.isArray(it.tags) ? it.tags.map(String) : [];
      const matchesTag = libraryTagFilter === 'All' || tags.includes(libraryTagFilter);
      const matchesSearch =
        !searchLower ||
        String(it.title || '').toLowerCase().includes(searchLower) ||
        String(it.description || '').toLowerCase().includes(searchLower) ||
        tags.some((t) => t.toLowerCase().includes(searchLower));
      return matchesTag && matchesSearch;
    });
  }, [libraryItems, libraryTagFilter, search]);

  useEffect(() => {
    if (libraryTagFilter !== 'All' && !availableLibraryTags.includes(libraryTagFilter)) {
      setLibraryTagFilter('All');
    }
  }, [libraryTagFilter, availableLibraryTags]);

  return (
    <>
      <style jsx global>{`
        .resource-md-content .md-h1 { font-size: 1.5rem; font-weight: 700; margin: 1.25rem 0 0.5rem; color: var(--tw-prose-headings, #f3f4f6); }
        .resource-md-content .md-h2 { font-size: 1.25rem; font-weight: 700; margin: 1.25rem 0 0.5rem; color: var(--tw-prose-headings, #f3f4f6); }
        .resource-md-content .md-h3 { font-size: 1.1rem; font-weight: 600; margin: 1rem 0 0.4rem; color: var(--tw-prose-headings, #f3f4f6); }
        .resource-md-content .md-h4 { font-size: 1rem; font-weight: 600; margin: 0.75rem 0 0.3rem; color: var(--tw-prose-headings, #e5e7eb); }
        .resource-md-content .md-hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 1.25rem 0; }
        .resource-md-content .md-p { margin: 0.5rem 0; }
        .resource-md-content .md-li { display: list-item; margin-left: 1.25rem; margin-bottom: 0.25rem; list-style-type: disc; }
        .resource-md-content .md-li.md-ol { list-style-type: decimal; }
        .resource-md-content .md-code-block {
          display: block;
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 0.5rem;
          padding: 1rem;
          margin: 0.75rem 0;
          overflow-x: auto;
          font-size: 0.8rem;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .resource-md-content .md-inline-code {
          background: rgba(139,92,246,0.12);
          border: 1px solid rgba(139,92,246,0.2);
          border-radius: 0.25rem;
          padding: 0.1rem 0.35rem;
          font-size: 0.85em;
        }
        .resource-md-content .md-link { color: #a78bfa; text-decoration: underline; text-underline-offset: 2px; }
        .resource-md-content .md-link:hover { color: #c4b5fd; }
        .resource-md-content strong { color: #f3f4f6; }
      `}</style>

      <div className="w-full max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Resources</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              SOPs, AI skills, and business resources for your team. Click to view or edit.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200/60 dark:border-white/10 overflow-hidden">
              <button
                onClick={() => setView('docs')}
                className={`px-3 py-2 text-xs font-semibold ${view === 'docs' ? 'bg-violet-600 text-white' : 'bg-transparent text-gray-500 dark:text-gray-300 hover:bg-gray-200/40 dark:hover:bg-gray-800/40'}`}
              >
                Docs
              </button>
              <button
                onClick={() => {
                  setView('library');
                  if (libraryItems.length === 0) void loadLibrary();
                }}
                className={`px-3 py-2 text-xs font-semibold ${view === 'library' ? 'bg-violet-600 text-white' : 'bg-transparent text-gray-500 dark:text-gray-300 hover:bg-gray-200/40 dark:hover:bg-gray-800/40'}`}
              >
                Org Library
              </button>
            </div>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={view === 'library' ? 'Search library…' : 'Search resources…'}
                className="pl-9 pr-4 py-2 text-sm rounded-lg bg-white/60 dark:bg-gray-800/60 border border-gray-200/60 dark:border-white/10 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40 w-56"
              />
            </div>
          </div>
        </div>

        {view === 'docs' && availableCategories.length > 2 && (
          <div className="flex items-center gap-2 flex-wrap">
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  filter === cat
                    ? 'bg-violet-600 text-white shadow-md'
                    : 'bg-gray-200/60 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-gray-300/60 dark:hover:bg-gray-600/50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {view === 'library' && (availableLibraryTags.length > 0 || libraryTagFilter !== 'All') && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setLibraryTagFilter('All')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                libraryTagFilter === 'All'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-gray-200/60 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-gray-300/60 dark:hover:bg-gray-600/50'
              }`}
            >
              All
            </button>
            {ORG_LIBRARY_TAGS.map((tag) => {
              if (!availableLibraryTags.includes(tag)) return null;
              return (
                <button
                  key={tag}
                  onClick={() => setLibraryTagFilter(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    libraryTagFilter === tag
                      ? 'bg-violet-600 text-white shadow-md'
                      : 'bg-gray-200/60 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-gray-300/60 dark:hover:bg-gray-600/50'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-gray-500">
          {view === 'docs' ? (
            <>
              <span>
                {filtered.length} resource{filtered.length !== 1 ? 's' : ''}
              </span>
              <span>{AI_SKILL_RESOURCES.length} AI Skills</span>
              <span>{allResources.filter((r) => r.category === 'SOP').length} SOPs</span>
            </>
          ) : (
            <>
              <span>
                {filteredLibraryItems.length} item{filteredLibraryItems.length !== 1 ? 's' : ''}
                {filteredLibraryItems.length !== libraryItems.length
                  ? ` (of ${libraryItems.length})`
                  : ''}
              </span>
              {libraryError ? <span className="text-rose-400">{libraryError}</span> : null}
            </>
          )}
        </div>

        {view === 'docs' && loading ? (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-square rounded-lg border border-gray-200/20 dark:border-white/8 bg-gray-800/40 animate-pulse" />
            ))}
          </div>
        ) : view === 'docs' && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">No resources found</h3>
            <p className="text-sm text-gray-500">
              {search ? `No resources match "${search}".` : 'No resources in this category yet.'}
            </p>
          </div>
        ) : view === 'docs' ? (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="group relative aspect-square w-full rounded-lg border border-dashed border-gray-300/60 dark:border-white/15 hover:border-violet-500/40 bg-white/50 dark:bg-gray-900/20 p-5 flex items-center justify-center text-left transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/5 hover:scale-[1.02] active:scale-[0.98]"
              aria-label="Create new SOP"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-600/15 border border-violet-500/20 text-violet-400 group-hover:bg-violet-600/20 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </span>
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">New SOP</span>
              </div>
            </button>
            {filtered.map((resource) => (
              <ResourceTile
                key={resource.id}
                resource={resource}
                onClick={() => setOpenResource(resource)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Store org-specific testimonials, case studies, SOPs, value bullets, images, and video links.
              </p>
              <button
                onClick={() => loadLibrary()}
                className="text-xs text-violet-400 hover:text-violet-300"
              >
                Refresh
              </button>
            </div>

            {libraryLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : filteredLibraryItems.length === 0 && libraryItems.length > 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">No items found</h3>
                <p className="text-sm text-gray-500">
                  {search
                    ? `No library items match "${search}".`
                    : libraryTagFilter !== 'All'
                      ? `No items tagged "${libraryTagFilter}".`
                      : 'No library items yet.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setShowNewLibraryItem(true)}
                  className="group relative aspect-square w-full rounded-lg border border-dashed border-gray-300/60 dark:border-white/15 hover:border-violet-500/40 bg-white/50 dark:bg-gray-900/20 p-5 flex items-center justify-center text-left transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/5 hover:scale-[1.02] active:scale-[0.98]"
                  aria-label="Create new library item"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-600/15 border border-violet-500/20 text-violet-400 group-hover:bg-violet-600/20 transition-colors">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </span>
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">New item</span>
                  </div>
                </button>

                {filteredLibraryItems.map((it: any) => (
                  <button
                    key={it.id}
                    onClick={() =>
                      setOpenLibraryItem(it)
                    }
                    className="group relative aspect-square w-full rounded-lg border border-gray-200/60 dark:border-white/10 hover:border-violet-500/30 bg-white/60 dark:bg-gray-900/30 p-5 flex flex-col text-left transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/5 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span className="text-[10px] px-2 py-1 rounded bg-gray-500/10 text-gray-500 border border-gray-500/15 self-start">
                      {String(it.kind || 'text')}
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2">
                      {it.title}
                    </h3>
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-4 flex-1">
                      {it.description}
                    </p>
                    {Array.isArray(it.tags) && it.tags.length ? (
                      <div className="mt-auto pt-3 flex flex-wrap gap-1">
                        {it.tags.slice(0, 6).map((t: string) => (
                          <span
                            key={t}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {openResource && (
        <ResourceModal
          resource={openResource}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}

      {showCreate && (
        <CreateSopModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {showNewLibraryItem && (
        <OrgLibraryItemModal
          mode="create"
          initial={{ kind: 'markdown', title: '', description: '', tags: [], content_text: '# New resource\n\n' }}
          onClose={() => setShowNewLibraryItem(false)}
          onSaved={async () => {
            await loadLibrary();
          }}
        />
      )}

      {openLibraryItem && (
        <OrgLibraryItemModal
          mode="edit"
          initial={{
            id: String(openLibraryItem.id),
            kind: (openLibraryItem.kind || 'markdown') as OrgLibraryKind,
            title: String(openLibraryItem.title || ''),
            description: String(openLibraryItem.description || ''),
            tags: (Array.isArray(openLibraryItem.tags) ? openLibraryItem.tags : []) as OrgLibraryTag[],
            content_text: openLibraryItem.content_text ?? '',
            content_url: openLibraryItem.content_url ?? '',
            content_b64: openLibraryItem.content_b64 ?? null,
            content_mime: openLibraryItem.content_mime ?? null,
          }}
          onClose={() => setOpenLibraryItem(null)}
          onSaved={async () => {
            await loadLibrary();
          }}
          onDeleted={async () => {
            await loadLibrary();
            setOpenLibraryItem(null);
          }}
        />
      )}
    </>
  );
}
