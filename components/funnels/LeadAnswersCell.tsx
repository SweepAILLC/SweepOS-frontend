import { useState } from 'react';

function formatAnswerValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function answerEntries(
  answers?: Record<string, unknown> | null
): Array<[string, string]> {
  if (!answers || typeof answers !== 'object') return [];
  return Object.entries(answers)
    .filter(([k, v]) => k && v != null && String(v).trim() !== '')
    .map(([k, v]) => [String(k), formatAnswerValue(v)]);
}

/** Answers / metadata cell shared by the funnel Leads tab and the pipeline Grid view. */
export default function LeadAnswersCell({ answers }: { answers?: Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);
  const entries = answerEntries(answers);
  if (entries.length === 0) {
    return <span>—</span>;
  }
  const compact = entries.map(([k, v]) => k + ': ' + v).join(' · ');
  const canExpand = entries.length > 1 || compact.length > 80;

  return (
    <div className={expanded ? 'max-w-xl' : 'max-w-md'}>
      {expanded ? (
        <dl className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {entries.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {k}
              </dt>
              <dd className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="line-clamp-3 break-words" title={compact}>
          {compact}
        </span>
      )}
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mt-1 block text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
