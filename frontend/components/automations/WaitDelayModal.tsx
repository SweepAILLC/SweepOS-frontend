'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient, type AutomationRule } from '@/lib/api';

interface WaitDelayModalProps {
  rule: AutomationRule | null;
  onClose: () => void;
  onSaved: (next: AutomationRule) => void;
}

const PRESETS: Array<{ label: string; seconds: number }> = [
  { label: 'Immediate', seconds: 0 },
  { label: '15 min', seconds: 15 * 60 },
  { label: '30 min', seconds: 30 * 60 },
  { label: '1 hr', seconds: 60 * 60 },
  { label: '2 hr', seconds: 2 * 60 * 60 },
  { label: '6 hr', seconds: 6 * 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '3 days', seconds: 3 * 24 * 60 * 60 },
];

type Unit = 'minutes' | 'hours' | 'days';

function toUnitParts(seconds: number): { value: number; unit: Unit } {
  if (seconds <= 0) return { value: 0, unit: 'minutes' };
  if (seconds % 86_400 === 0) return { value: seconds / 86_400, unit: 'days' };
  if (seconds % 3_600 === 0) return { value: seconds / 3_600, unit: 'hours' };
  return { value: Math.max(1, Math.round(seconds / 60)), unit: 'minutes' };
}

function partsToSeconds(value: number, unit: Unit): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  switch (unit) {
    case 'days':
      return Math.round(value) * 86_400;
    case 'hours':
      return Math.round(value) * 3_600;
    case 'minutes':
    default:
      return Math.round(value) * 60;
  }
}

function describe(seconds: number): string {
  if (seconds <= 0) return 'Sends immediately when the trigger fires';
  if (seconds < 3_600) return `Waits ~${Math.round(seconds / 60)} min after the previous step`;
  if (seconds < 86_400) return `Waits ~${Math.round(seconds / 3_600)} h after the previous step`;
  return `Waits ~${Math.round(seconds / 86_400)} d after the previous step`;
}

export default function WaitDelayModal({ rule, onClose, onSaved }: WaitDelayModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [parts, setParts] = useState<{ value: number; unit: Unit }>(
    rule ? toUnitParts(rule.delay_seconds || 0) : { value: 0, unit: 'minutes' },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rule) setParts(toUnitParts(rule.delay_seconds || 0));
    setError(null);
  }, [rule]);

  useEffect(() => {
    if (!rule) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [rule, onClose]);

  if (!rule) return null;

  const totalSeconds = partsToSeconds(parts.value, parts.unit);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await apiClient.updateAutomationRule(rule.playbook, {
        enabled: rule.enabled,
        delay_seconds: totalSeconds,
        content_mode: rule.content_mode,
        subject_template: rule.subject_template ?? null,
        html_template_ref: rule.html_template_ref ?? null,
        ai_content_system_prompt: rule.ai_content_system_prompt ?? null,
        audience_filter: rule.audience_filter ?? null,
        trigger_config: rule.trigger_config ?? null,
        opportunity_priority: rule.opportunity_priority ?? null,
        combine_top_n: rule.combine_top_n,
        require_approval: rule.require_approval,
        approval_ttl_hours: rule.approval_ttl_hours ?? null,
      });
      onSaved(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save delay');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit wait delay"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-gray-950/75 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} tabIndex={-1} className="w-full max-w-md outline-none">
        <div className="rounded-t-2xl sm:rounded-2xl border border-white/10 bg-gradient-to-b from-gray-900 to-gray-950 shadow-[0_0_40px_rgba(245,158,11,0.12)] overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-400/90">Wait step</p>
              <h3 className="text-base font-semibold text-white">Delay before next email</h3>
              <p className="mt-1 text-xs text-gray-400">
                Before <span className="text-gray-200">{rule.playbook.replace(/_/g, ' ')}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-gray-300 hover:text-white"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-2">Quick presets</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const active = totalSeconds === p.seconds;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setParts(toUnitParts(p.seconds))}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${
                        active
                          ? 'bg-amber-500 text-gray-950 shadow-[0_0_16px_rgba(245,158,11,0.35)]'
                          : 'bg-white/5 text-gray-300 ring-1 ring-white/10 hover:bg-white/10'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-2">Custom</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={parts.value}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setParts({ ...parts, value: Number.isFinite(v) ? v : 0 });
                  }}
                  className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
                <select
                  value={parts.unit}
                  onChange={(e) => setParts({ ...parts, unit: e.target.value as Unit })}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
              <p className="mt-2 text-xs text-gray-400">{describe(totalSeconds)}.</p>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3 sm:px-5 bg-black/20">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              aria-busy={saving}
              className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 text-sm font-semibold px-4 py-2"
            >
              {saving ? 'Saving…' : 'Save delay'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
