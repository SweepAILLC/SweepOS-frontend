'use client';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Visible label beside the switch */
  label?: string;
  /** Shown when on/off for screen readers and optional visible hint */
  onLabel?: string;
  offLabel?: string;
  id?: string;
  /** Accent when checked */
  tone?: 'violet' | 'emerald' | 'cyan';
}

const TONE = {
  violet: 'bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.55)]',
  emerald: 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.55)]',
  cyan: 'bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.55)]',
} as const;

/**
 * Accessible pill switch — used for automation on/off and approval toggles.
 */
export default function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  onLabel = 'On',
  offLabel = 'Off',
  id,
  tone = 'violet',
}: ToggleSwitchProps) {
  const switchId = id ?? (label ? `switch-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <label
      htmlFor={switchId}
      className={`inline-flex items-center gap-2.5 select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {label ? (
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      ) : null}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : checked ? onLabel : offLabel}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 ${
          checked
            ? TONE[tone]
            : 'bg-gray-300/80 dark:bg-gray-600/80 shadow-inner'
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
      <span
        className={`text-xs font-semibold uppercase tracking-wide tabular-nums min-w-[1.75rem] ${
          checked ? 'text-violet-600 dark:text-violet-300' : 'text-gray-500 dark:text-gray-400'
        }`}
        aria-hidden
      >
        {checked ? onLabel : offLabel}
      </span>
    </label>
  );
}
