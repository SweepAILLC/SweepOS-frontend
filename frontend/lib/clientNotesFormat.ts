/** Lightweight notes preview helpers (no markdown dependency). */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const trimmed = m.replace(/[.,;:!?)]+$/, '');
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export function firstUrl(text: string): string | null {
  const urls = extractUrls(text);
  return urls[0] ?? null;
}

export type NotesPreviewBlock =
  | { type: 'heading'; text: string; level: number }
  | { type: 'task'; checked: boolean; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'empty' };

export function parseNotesPreview(text: string): NotesPreviewBlock[] {
  const lines = text.split('\n');
  const blocks: NotesPreviewBlock[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ type: 'empty' });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    const task = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (task) {
      blocks.push({
        type: 'task',
        checked: task[1].toLowerCase() === 'x',
        text: task[2].trim(),
      });
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[1].trim() });
      continue;
    }
    blocks.push({ type: 'paragraph', text: line });
  }
  return blocks;
}

/** Split text into plain segments and URL segments for inline linking. */
export function splitTextWithUrls(text: string): Array<{ kind: 'text' | 'url'; value: string }> {
  const parts: Array<{ kind: 'text' | 'url'; value: string }> = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ kind: 'text', value: text.slice(last, m.index) });
    }
    let url = m[0];
    const trail = url.match(/[.,;:!?)]+$/);
    if (trail) {
      url = url.slice(0, -trail[0].length);
      re.lastIndex -= trail[0].length;
    }
    parts.push({ kind: 'url', value: url });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push({ kind: 'text', value: text.slice(last) });
  }
  if (parts.length === 0 && text) {
    parts.push({ kind: 'text', value: text });
  }
  return parts;
}

export function insertAtCursor(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
): { next: string; cursor: number } {
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const next = before + insert + after;
  const cursor = selectionStart + insert.length;
  return { next, cursor };
}
