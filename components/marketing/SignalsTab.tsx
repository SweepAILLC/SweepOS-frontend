'use client';

import Link from 'next/link';

export type SignalsTabProps = {
  salesPlaybookSource: 'fathom' | 'default';
  paragraphs: string[];
  knowledge: { objections: string[]; closing: string[]; reframes: string[] };
  loading?: boolean;
};

export default function SignalsTab({
  salesPlaybookSource,
  paragraphs,
  knowledge,
  loading,
}: SignalsTabProps) {
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    );
  }

  const sections = [
    { key: 'objections', title: 'Objections you hear', items: knowledge.objections || [] },
    { key: 'closing', title: 'Closing / conversion language', items: knowledge.closing || [] },
    { key: 'reframes', title: 'Reframes that land', items: knowledge.reframes || [] },
  ];

  return (
    <div className="space-y-6">
      <section className="glass-card rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sales playbook</h3>
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
              salesPlaybookSource === 'fathom'
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                : 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
            }`}
          >
            {salesPlaybookSource === 'fathom' ? 'From calls' : 'Baseline'}
          </span>
        </div>
        {paragraphs.length ? (
          <div className="space-y-2">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {p}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No playbook paragraphs yet. Connect Fathom and re-analyze from the Ideas tab.
          </p>
        )}
      </section>

      {sections.map((sec) => (
        <section key={sec.key} className="glass-card rounded-xl p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sec.title}</h3>
          {sec.items.length ? (
            <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
              {sec.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Empty — add operator knowledge in{' '}
              <Link href="/?tab=intelligence" className="text-violet-600 dark:text-violet-400 underline">
                Intelligence
              </Link>{' '}
              or let call insights populate themes.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
