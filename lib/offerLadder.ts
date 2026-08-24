export interface OfferEntry {
  name?: string;
  promise?: string;
  ideal_for?: string;
  not_for?: string;
  price_terms?: string;
  when_to_use?: string;
  triggers?: string[];
  contraindications?: string;
}

export interface ReferralOffer {
  incentive?: string;
  eligibility?: string;
  ask_script_hints?: string;
}

export interface ObjectionHandler {
  objection: string;
  response: string;
}

export interface OfferLadder {
  version?: number;
  core_offer?: OfferEntry;
  /** Unified collection for expansion offers and complementary add-ons. */
  upsells?: OfferEntry[];
  /** Read-only compatibility with profiles saved before ladder v2. */
  downsells?: OfferEntry[];
  referral_offer?: ReferralOffer;
  positioning_notes?: string[];
  objection_handlers?: ObjectionHandler[];
}

const MAX_UNIFIED_OFFERS = 10;

function offerIdentity(offer: OfferEntry): string {
  return `${(offer.name || '').trim().toLocaleLowerCase()}\u0000${(offer.promise || '')
    .trim()
    .toLocaleLowerCase()}`;
}

function asOfferList(value: unknown): OfferEntry[] {
  return Array.isArray(value)
    ? value.filter((item): item is OfferEntry => item != null && typeof item === 'object')
    : [];
}

/**
 * Upgrade the v1 upsell/downsell split without dropping saved offers.
 *
 * Legacy `when_to_use` guidance becomes a trigger, matching the fields shown by
 * the unified editor and consumed by client-profile offer matching.
 */
export function normalizeOfferLadder(ladder: OfferLadder | null | undefined): OfferLadder {
  if (!ladder || typeof ladder !== 'object') return { version: 2 };

  const offers: OfferEntry[] = [];
  const seen = new Set<string>();
  const add = (offer: OfferEntry) => {
    if (offers.length >= MAX_UNIFIED_OFFERS) return;
    const identity = offerIdentity(offer);
    if (seen.has(identity)) return;
    seen.add(identity);
    offers.push(offer);
  };

  asOfferList(ladder.upsells).forEach((offer) => add({ ...offer }));
  asOfferList(ladder.downsells).forEach((offer) => {
    const whenToUse = typeof offer.when_to_use === 'string' ? offer.when_to_use.trim() : '';
    const triggers = Array.isArray(offer.triggers)
      ? offer.triggers.filter((trigger): trigger is string => typeof trigger === 'string' && trigger.trim().length > 0)
      : [];
    const { when_to_use: _legacyWhenToUse, ...rest } = offer;
    add({
      ...rest,
      triggers: triggers.length > 0 ? triggers : whenToUse ? [whenToUse] : [],
    });
  });

  const { downsells: _legacyDownsells, ...current } = ladder;
  return {
    ...current,
    version: 2,
    ...(offers.length > 0 ? { upsells: offers } : { upsells: [] }),
  };
}
