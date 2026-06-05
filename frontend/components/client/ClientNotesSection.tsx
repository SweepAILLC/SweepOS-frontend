'use client';

import { useCallback, useRef, useState } from 'react';
import {
  extractUrls,
  firstUrl,
  insertAtCursor,
  parseNotesPreview,
  splitTextWithUrls,
} from '@/lib/clientNotesFormat';

interface ClientNotesSectionProps {
  value: string;
  onChange: (value: string) => void;
  onBlurSave: () => void;
}

function InlineText({ text }: { text: string }) {
  const parts = splitTextWithUrls(text);
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'url' ? (
          <a
            key={i}
            href={p.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 hover:underline break-all"
          >
            {p.value}
          </a>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

export default function ClientNotesSection({
  value,
  onChange,
  onBlurSave,
}: ClientNotesSectionProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyInsert = useCallback(
    (snippet: string) => {
      const el = textareaRef.current;
      if (!el) {
        onChange(value ? `${value}\n${snippet}` : snippet);
        return;
      }
      const { next, cursor } = insertAtCursor(
        value,
        el.selectionStart,
        el.selectionEnd,
        snippet,
      );
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    },
    [value, onChange],
  );

  const urls = extractUrls(value);

  return (
    <section className="flex flex-col min-h-0 shrink-0">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Client workspace</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Progress notes, links, and call prep — visible without scrolling past AI sections.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-white/10 p-0.5">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
              mode === 'edit'
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
              mode === 'preview'
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === 'edit' ? (
        <>
          <div className="flex flex-wrap gap-1 mb-2">
            <button
              type="button"
              onClick={() => applyInsert('## ')}
              className="px-2 py-1 text-[10px] font-medium rounded border border-gray-200 dark:border-white/15 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              Heading
            </button>
            <button
              type="button"
              onClick={() => applyInsert('- [ ] ')}
              className="px-2 py-1 text-[10px] font-medium rounded border border-gray-200 dark:border-white/15 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              Task
            </button>
            <button
              type="button"
              onClick={() => applyInsert('[label](https://)')}
              className="px-2 py-1 text-[10px] font-medium rounded border border-gray-200 dark:border-white/15 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              Link
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlurSave}
            rows={8}
            className="block w-full min-h-[10rem] rounded-md glass-input font-mono text-sm leading-relaxed focus:border-blue-500 focus:ring-blue-500"
            placeholder={'## Goals\n- [ ] Follow up on offer\nhttps://...\n\nCall prep, links, personal context.'}
          />
        </>
      ) : (
        <div className="min-h-[10rem] max-h-[14rem] overflow-y-auto rounded-md border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/[0.03] px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200">
          {!value.trim() ? (
            <p className="text-gray-400 dark:text-gray-500 italic text-xs">No notes yet.</p>
          ) : (
            <div className="space-y-1.5">
              {parseNotesPreview(value).map((block, i) => {
                if (block.type === 'empty') return <div key={i} className="h-1" />;
                if (block.type === 'heading') {
                  const Tag = block.level === 1 ? 'h4' : block.level === 2 ? 'h5' : 'h6';
                  return (
                    <Tag
                      key={i}
                      className={`font-semibold text-gray-900 dark:text-gray-100 ${
                        block.level === 1 ? 'text-base' : block.level === 2 ? 'text-sm' : 'text-xs'
                      }`}
                    >
                      <InlineText text={block.text} />
                    </Tag>
                  );
                }
                if (block.type === 'task') {
                  return (
                    <label key={i} className="flex items-start gap-2 text-xs">
                      <input type="checkbox" checked={block.checked} readOnly className="mt-0.5" />
                      <span className={block.checked ? 'line-through opacity-60' : ''}>
                        <InlineText text={block.text} />
                      </span>
                    </label>
                  );
                }
                if (block.type === 'bullet') {
                  return (
                    <li key={i} className="list-disc list-inside text-xs ml-1">
                      <InlineText text={block.text} />
                    </li>
                  );
                }
                return (
                  <p key={i} className="text-xs leading-relaxed">
                    <InlineText text={block.text} />
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button
          type="button"
          onClick={() => {
            if (value && navigator.clipboard) {
              navigator.clipboard.writeText(value).catch(() => {});
            }
          }}
          disabled={!value.trim()}
          className="text-[10px] font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 disabled:opacity-40"
        >
          Copy all
        </button>
        {firstUrl(value) ? (
          <a
            href={firstUrl(value)!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            Open first link
          </a>
        ) : null}
        {urls.length > 1 ? (
          <span className="text-[10px] text-gray-400">{urls.length} links detected</span>
        ) : null}
      </div>
    </section>
  );
}
