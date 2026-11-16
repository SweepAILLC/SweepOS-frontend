export default function DialedButton({
  dialed,
  speedLabel,
  onToggle,
}: {
  dialed: boolean;
  speedLabel?: string;
  onToggle?: () => void;
}) {
  const dialledLabel = speedLabel ? `Dialled in ${speedLabel}` : 'Dialled';
  return (
    <button
      type="button"
      aria-pressed={dialed}
      aria-label={dialed ? `${dialledLabel}. Click to clear.` : 'Mark as dialled'}
      title={dialed ? dialledLabel : 'Mark as dialled'}
      disabled={!onToggle}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`inline-flex shrink-0 items-center rounded p-0.5 ${
        dialed
          ? 'bg-green-500/20 text-green-600 dark:text-green-400'
          : 'text-gray-800 hover:text-gray-950 dark:text-gray-100 dark:hover:text-white'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.6 1 1 0 0 1-.25 1L6.6 10.8z" />
      </svg>
    </button>
  );
}
