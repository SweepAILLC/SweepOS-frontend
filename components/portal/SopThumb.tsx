'use client';

import { useEffect, useState } from 'react';
import { getMediaEmbedKind, toVideoThumbnailUrl, type MediaEmbedKind } from '@/lib/resources';

/** Every SOP row reserves exactly this box, so rows line up whether or not a video exists. */
const BOX = 'relative flex-shrink-0 w-20 h-[52px] overflow-hidden rounded-md border';

const TILES: Record<MediaEmbedKind | 'none', { label: string; box: string; text: string }> = {
  loom: {
    label: 'Loom',
    box: 'border-violet-500/30 bg-gradient-to-br from-violet-500/25 via-fuchsia-500/15 to-indigo-500/20',
    text: 'text-violet-600 dark:text-violet-200',
  },
  fathom: {
    label: 'Fathom',
    box: 'border-teal-500/30 bg-gradient-to-br from-teal-500/25 via-cyan-500/15 to-emerald-500/20',
    text: 'text-teal-600 dark:text-teal-200',
  },
  figma: {
    label: 'Figma',
    box: 'border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/15 to-sky-500/20',
    text: 'text-fuchsia-600 dark:text-fuchsia-300',
  },
  video: {
    label: 'Video',
    box: 'border-gray-300/60 dark:border-white/10 bg-gradient-to-br from-gray-200/70 to-gray-100/40 dark:from-white/10 dark:to-white/5',
    text: 'text-gray-600 dark:text-gray-300',
  },
  none: {
    label: 'Doc',
    box: 'border-gray-200/70 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04]',
    text: 'text-gray-400 dark:text-gray-500',
  },
};

function PlayIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M6.5 4.5v11l9-5.5-9-5.5z" />
    </svg>
  );
}

function DocIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zm6 0v6h6M9 13h6M9 17h6"
      />
    </svg>
  );
}

export default function SopThumb({
  urls,
  loomThumbs,
}: {
  urls: string[];
  /** Server-resolved Loom thumbnails keyed by the original URL. */
  loomThumbs: Record<string, string | null>;
}) {
  const kinds = urls.map((u) => getMediaEmbedKind(u));
  // Prefer a playable video (Loom/YouTube/Vimeo) over Fathom/Figma, even if listed later.
  const pickIndex = (() => {
    for (const wanted of ['loom', 'video', 'fathom', 'figma'] as const) {
      const i = kinds.indexOf(wanted);
      if (i >= 0) return i;
    }
    return -1;
  })();
  const url = pickIndex >= 0 ? urls[pickIndex] : null;
  const kind: MediaEmbedKind | 'none' = pickIndex >= 0 ? (kinds[pickIndex] as MediaEmbedKind) : 'none';

  const imageSrc =
    kind === 'loom' ? (url ? loomThumbs[url] ?? null : null) : kind === 'video' ? toVideoThumbnailUrl(url) : null;

  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => setFailedSrc(null), [imageSrc]);

  const extra = Math.max(0, urls.length - 1);
  const tile = TILES[kind];
  const showImage = Boolean(imageSrc) && failedSrc !== imageSrc;

  const extraBadge =
    extra > 0 ? (
      <span className="absolute top-0.5 right-0.5 rounded-full bg-black/70 text-white text-[9px] font-bold px-1.5 leading-4">
        +{extra}
      </span>
    ) : null;

  if (showImage) {
    return (
      <span className={`${BOX} border-gray-200/70 dark:border-white/10 bg-black`}>
        <img
          src={imageSrc as string}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(imageSrc)}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
          <PlayIcon className="w-4 h-4 text-white drop-shadow" />
        </span>
        {kind === 'loom' ? (
          <span className="absolute bottom-0.5 left-0.5 rounded px-1 text-[8px] font-bold uppercase tracking-wide bg-violet-600/90 text-white">
            Loom
          </span>
        ) : null}
        {extraBadge}
      </span>
    );
  }

  return (
    <span className={`${BOX} ${tile.box} flex flex-col items-center justify-center gap-0.5`}>
      {kind === 'none' ? (
        <DocIcon className={`w-5 h-5 ${tile.text}`} />
      ) : (
        <>
          <PlayIcon className={`w-4 h-4 ${tile.text}`} />
          <span className={`text-[9px] font-bold uppercase tracking-wide ${tile.text}`}>{tile.label}</span>
        </>
      )}
      {extraBadge}
    </span>
  );
}
