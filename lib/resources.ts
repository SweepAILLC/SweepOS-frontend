/** Shared types and helpers for platform docs / SOPs / AI skills. */

export type ResourceCategory = 'AI Skill' | 'SOP' | 'Template' | 'Guide';
export type SopCategory = 'foundations' | 'marketing' | 'sales' | 'operations' | 'fulfillment';

export interface Resource {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  fileName?: string;
  mcpRequired?: string[];
  prerequisites?: string[];
  outputSummary?: string;
  poweredBy?: string | null;
  videoUrl?: string | null;
  sopCategory?: SopCategory | null;
  isCustom?: boolean;
  isBuiltin?: boolean;
  updatedAt?: string | null;
  sortOrder?: number | null;
}

export const SOP_CATEGORY_COLORS: Record<
  SopCategory,
  { badge: string; pillActive: string; heading: string }
> = {
  foundations: {
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    pillActive: 'bg-amber-600 text-white shadow-md',
    heading: 'text-amber-500 dark:text-amber-400',
  },
  marketing: {
    badge: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20',
    pillActive: 'bg-fuchsia-600 text-white shadow-md',
    heading: 'text-fuchsia-500 dark:text-fuchsia-400',
  },
  sales: {
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pillActive: 'bg-emerald-600 text-white shadow-md',
    heading: 'text-emerald-500 dark:text-emerald-400',
  },
  operations: {
    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    pillActive: 'bg-sky-600 text-white shadow-md',
    heading: 'text-sky-500 dark:text-sky-400',
  },
  fulfillment: {
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    pillActive: 'bg-orange-600 text-white shadow-md',
    heading: 'text-orange-500 dark:text-orange-400',
  },
};

export const SOP_CATEGORY_LABELS: Record<SopCategory, string> = {
  foundations: 'Foundations',
  marketing: 'Marketing',
  sales: 'Sales',
  operations: 'Operations',
  fulfillment: 'Fulfillment',
};

/** Display order for consulting SOP tracks. */
export const SOP_ROW_ORDER: SopCategory[] = [
  'foundations',
  'marketing',
  'sales',
  'fulfillment',
  'operations',
];

export const CATEGORY_STYLES: Record<ResourceCategory, { badge: string; bg: string }> = {
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

export const AI_SKILL_RESOURCES: Resource[] = [
  {
    id: 'instagram-content-audit',
    title: 'Instagram Content Audit',
    description:
      'Thorough content strategy audit via SweepOS remote MCP — buyer objections, wins, stories, ICP, and TOF/MOF/BOF fit. Optional Fathom for transcript gaps; optional pasted Reel notes for platform metrics (no TokScript).',
    category: 'AI Skill',
    fileName: 'instagram-content-audit.md',
    mcpRequired: ['SweepOS (https://api.sweepai.site/mcp)', 'Fathom MCP (optional)'],
    outputSummary:
      'Full audit: buyer reality map, funnel gaps, credibility + lead-gen scores, top 5 fixes, 14-day sprint.',
  },
  {
    id: 'shorts-content-ideation',
    title: 'Shorts Content Ideation',
    description:
      'Generate 10 conversion-engineered short-form ideas from SweepOS Marketing Intel — themes, clips, wins, and ICP. Optional Fathom only when Sweep quotes are thin.',
    category: 'AI Skill',
    fileName: 'shorts-content-ideation.md',
    mcpRequired: ['SweepOS (https://api.sweepai.site/mcp)', 'Fathom MCP (optional)'],
    prerequisites: ['Prefer Instagram Content Audit first', 'Marketing Intel / Call Library data recommended'],
    outputSummary: '10 ranked ideas with scripted hooks, Sweep citations, funnel balance, and filming order.',
  },
  {
    id: 'sales-call-analysis',
    title: 'Sales Call Analysis',
    description:
      'Complete sales diagnostic from SweepOS call themes, clips, and client insights — scores, quote banks, and root-cause losses. Fathom fills full-transcript gaps.',
    category: 'AI Skill',
    fileName: 'sales-call-analysis.md',
    mcpRequired: ['SweepOS (https://api.sweepai.site/mcp)', 'Fathom MCP (optional for full transcripts)'],
    outputSummary:
      'Full diagnostic: scores, objection bank, discovery/pitch/close deep-dives, root causes, ranked fixes.',
  },
];

export type OrgLibraryKind = 'text' | 'markdown' | 'image' | 'video_url' | 'url';
export const ORG_LIBRARY_TAGS = [
  'testimonials',
  'case_studies',
  'value',
  'SOP',
  'ai',
  'other',
] as const;
export type OrgLibraryTag = (typeof ORG_LIBRARY_TAGS)[number];

export function docMetaToResource(row: {
  resource_id: string;
  category: string;
  sop_category: string | null;
  title: string;
  description: string;
  powered_by: string | null;
  video_url: string | null;
  is_custom: boolean;
  is_builtin: boolean;
  updated_at: string | null;
  sort_order?: number | null;
}): Resource {
  return {
    id: row.resource_id,
    title: row.title,
    description: row.description,
    category: (row.category as ResourceCategory) || 'SOP',
    sopCategory: (row.sop_category as SopCategory | null) || null,
    poweredBy: row.powered_by,
    videoUrl: row.video_url,
    isCustom: row.is_custom,
    isBuiltin: row.is_builtin,
    updatedAt: row.updated_at,
    sortOrder: row.sort_order ?? null,
  };
}

export function mergeDocsWithAiSkills(docs: Resource[]): Resource[] {
  const merged: Resource[] = [];
  const fromDb = new Map(docs.map((d) => [d.id, d]));
  for (const skill of AI_SKILL_RESOURCES) {
    merged.push(fromDb.get(skill.id) ?? skill);
  }
  for (const doc of docs) {
    if (!AI_SKILL_RESOURCES.some((s) => s.id === doc.id)) merged.push(doc);
  }
  return merged;
}

export function isSopResource(r: Resource): boolean {
  return r.category === 'SOP';
}

export function isToolResource(r: Resource): boolean {
  return r.category !== 'SOP';
}

export function renderMarkdown(md: string): string {
  let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>'
  );
  html = html.replace(/\n\n/g, '</p><p class="md-p">');
  html = html.replace(/(?<!<\/pre>)\n(?!<)/g, '<br/>');

  return `<p class="md-p">${html}</p>`;
}

export function toVideoEmbedUrl(raw: string): string | null {
  return toMediaEmbedUrl(raw);
}

export type MediaEmbedKind = 'video' | 'figma';

/** Convert a share / watch / board URL into an iframe-ready embed URL. */
export function toMediaEmbedUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    // --- Figma / FigJam (Embed Kit 2.0) ---
    if (host === 'figma.com' || host === 'embed.figma.com') {
      return toFigmaEmbedUrl(url);
    }

    // --- Video hosts ---
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id =
        url.searchParams.get('v') ||
        (url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : null);
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : raw;
    }
    if (host === 'vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : raw;
    }
    if (host === 'loom.com' && url.pathname.startsWith('/share/')) {
      return raw.replace('/share/', '/embed/');
    }
    return raw;
  } catch {
    return null;
  }
}

export function getMediaEmbedKind(raw: string | null | undefined): MediaEmbedKind | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'figma.com' || host === 'embed.figma.com') return 'figma';
    if (
      host === 'youtu.be' ||
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'vimeo.com' ||
      host === 'player.vimeo.com' ||
      host === 'loom.com'
    ) {
      return 'video';
    }
    // Other https URLs still embed as generic media (treated like video for layout).
    return toMediaEmbedUrl(raw) ? 'video' : null;
  } catch {
    return null;
  }
}

function toFigmaEmbedUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  // Legacy Embed Kit 1.0: https://www.figma.com/embed?url=...
  if (host === 'figma.com' && url.pathname.replace(/\/$/, '') === '/embed') {
    const nested = url.searchParams.get('url');
    if (!nested) return null;
    try {
      return toFigmaEmbedUrl(new URL(nested));
    } catch {
      return null;
    }
  }

  // Already an embed.figma.com URL — ensure embed-host is present.
  if (host === 'embed.figma.com') {
    const out = new URL(url.toString());
    if (!out.searchParams.get('embed-host')) {
      out.searchParams.set('embed-host', 'sweep');
    }
    return out.toString();
  }

  // Modern share URLs: /board|/design|/proto|/slides|/deck|/file/:key/...
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  let kind = parts[0];
  if (kind === 'file') kind = 'design'; // legacy design files
  const allowed = new Set(['board', 'design', 'proto', 'slides', 'deck']);
  if (!allowed.has(kind)) return null;

  const fileKey = parts[1];
  if (!fileKey) return null;
  const fileName = parts[2] ? `/${parts[2]}` : '';

  const out = new URL(`https://embed.figma.com/${kind}/${fileKey}${fileName}`);
  url.searchParams.forEach((value, key) => {
    if (key === 'embed-host' || key === 'embed_host') return;
    out.searchParams.set(key, value);
  });
  out.searchParams.set('embed-host', 'sweep');
  return out.toString();
}

/** Best-effort public thumbnail URL for common video hosts (YouTube / Vimeo / Loom). */
export function toVideoThumbnailUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id =
        url.searchParams.get('v') ||
        (url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : null) ||
        (url.pathname.startsWith('/embed/') ? url.pathname.split('/')[2] : null);
      return id ? `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = host === 'player.vimeo.com' && parts[0] === 'video' ? parts[1] : parts[0];
      return id && /^\d+$/.test(id) ? `https://vumbnail.com/${encodeURIComponent(id)}.jpg` : null;
    }
    if (host === 'loom.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const id =
        (parts[0] === 'share' || parts[0] === 'embed') && parts[1] ? parts[1] : null;
      return id
        ? `https://cdn.loom.com/sessions/thumbnails/${encodeURIComponent(id)}-with-play.gif`
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

/** Global CSS for markdown rendered into .resource-md-content */
export const RESOURCE_MD_STYLES = `
  .resource-md-content {
    color: #000000;
  }
  .dark .resource-md-content {
    color: #ffffff;
  }
  .resource-md-content .md-h1,
  .resource-md-content .md-h2,
  .resource-md-content .md-h3,
  .resource-md-content .md-h4,
  .resource-md-content .md-p,
  .resource-md-content .md-li,
  .resource-md-content strong,
  .resource-md-content em {
    color: inherit;
  }
  .resource-md-content .md-h1 { font-size: 1.5rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
  .resource-md-content .md-h2 { font-size: 1.25rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
  .resource-md-content .md-h3 { font-size: 1.1rem; font-weight: 600; margin: 1rem 0 0.4rem; }
  .resource-md-content .md-h4 { font-size: 1rem; font-weight: 600; margin: 0.75rem 0 0.3rem; }
  .resource-md-content .md-hr {
    border: none;
    border-top: 1px solid rgba(0,0,0,0.12);
    margin: 1.25rem 0;
  }
  .dark .resource-md-content .md-hr {
    border-top-color: rgba(255,255,255,0.14);
  }
  .resource-md-content .md-p { margin: 0.5rem 0; }
  .resource-md-content .md-li { display: list-item; margin-left: 1.25rem; margin-bottom: 0.25rem; list-style-type: disc; }
  .resource-md-content .md-li.md-ol { list-style-type: decimal; }
  .resource-md-content .md-code-block {
    display: block;
    background: rgba(0,0,0,0.06);
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 0.5rem;
    padding: 1rem;
    margin: 0.75rem 0;
    overflow-x: auto;
    font-size: 0.8rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: inherit;
  }
  .dark .resource-md-content .md-code-block {
    background: rgba(0,0,0,0.35);
    border-color: rgba(255,255,255,0.08);
  }
  .resource-md-content .md-inline-code {
    background: rgba(0,0,0,0.06);
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 0.25rem;
    padding: 0.1rem 0.35rem;
    font-size: 0.85em;
    color: inherit;
  }
  .dark .resource-md-content .md-inline-code {
    background: rgba(139,92,246,0.12);
    border-color: rgba(139,92,246,0.2);
  }
  .resource-md-content .md-link { color: #6d28d9; text-decoration: underline; text-underline-offset: 2px; }
  .resource-md-content .md-link:hover { color: #5b21b6; }
  .dark .resource-md-content .md-link { color: #c4b5fd; }
  .dark .resource-md-content .md-link:hover { color: #ddd6fe; }
`;
