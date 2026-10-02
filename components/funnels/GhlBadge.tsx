/** GoHighLevel logo marking a funnel that is paired with a GHL funnel. */
export default function GhlBadge({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/ghl.svg" alt="GoHighLevel" title="Paired with GoHighLevel" className={`inline-block shrink-0 ${className}`} />
  );
}
