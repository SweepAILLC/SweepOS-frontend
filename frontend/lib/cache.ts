// Simple in-memory cache with TTL support
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class Cache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttl: number = 60000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instance
export const cache = new Cache();

// Cleanup expired entries every 5 minutes (client-side only)
// Use a function to initialize cleanup to avoid SSR issues
if (typeof window !== 'undefined') {
  // Delay initialization to ensure we're fully in browser context
  if (typeof window.requestIdleCallback !== 'undefined') {
    window.requestIdleCallback(() => {
      setInterval(() => {
        cache.cleanup();
      }, 5 * 60 * 1000);
    });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      setInterval(() => {
        cache.cleanup();
      }, 5 * 60 * 1000);
    }, 1000);
  }
}

// Cache keys
export const CACHE_KEYS = {
  USER: 'user',
  TAB_PERMISSIONS: 'tab_permissions',
  CLIENTS: 'clients',
  STRIPE_SUMMARY: 'stripe_summary',
  FUNNELS: 'funnels',
  BREVO_STATUS: 'brevo_status',
  CALCOM_STATUS: 'calcom_status',
  STRIPE_FAILED_PAYMENTS: 'stripe_failed_payments',
  STRIPE_STATUS: 'stripe_status',
  USERS: 'users',
  CALENDLY_STATUS: 'calendly_status',
  ADMIN_ORGANIZATIONS: 'admin_organizations',
  ADMIN_INVITATIONS: 'admin_invitations',
  ADMIN_HEALTH: 'admin_health',
  ADMIN_SETTINGS: 'admin_settings',
  TERMINAL_SUMMARY: 'terminal_summary',
} as const;

// TTL for terminal dashboard data (90s) so switching tabs feels instant
export const TERMINAL_CACHE_TTL_MS = 90 * 1000;

// Terminal summary: keep until session ends (24h) or until invalidated by Stripe sync / manual payment / connect
export const TERMINAL_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Legacy ISO key (still cleared on logout). Prefer TERMINAL_STRIPE_MS_KEY for comparison. */
export const TERMINAL_STRIPE_UPDATED_KEY = 'terminal_last_stripe_updated';
/** Milliseconds since epoch when client last synced with server Stripe data version (numeric compare, no string bugs). */
export const TERMINAL_STRIPE_MS_KEY = 'terminal_last_stripe_ms';

export function getSeenStripeDataMs(): number {
  if (typeof sessionStorage === 'undefined') return 0;
  const v = sessionStorage.getItem(TERMINAL_STRIPE_MS_KEY);
  const n = v ? parseInt(v, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function setSeenStripeDataMs(ms: number): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(TERMINAL_STRIPE_MS_KEY, String(ms));
  }
}

/** Clear caches that should not persist across logout. Call on logout. Terminal Stripe data refetches on next load. */
export function clearSessionCaches(): void {
  cache.delete(CACHE_KEYS.TERMINAL_SUMMARY);
  cache.deleteByPrefix('stripe_');
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(TERMINAL_STRIPE_UPDATED_KEY);
    sessionStorage.removeItem(TERMINAL_STRIPE_MS_KEY);
  }
}

/** Invalidate all Stripe-related caches. Only used when terminal should refetch (webhook) or on session end. */
export function invalidateStripeCache(): void {
  cache.deleteByPrefix('stripe_');
}

/** Invalidate caches after webhook/sync; mark client as having seen this server data version (ms). */
export function invalidateStripeAndTerminalAfterWebhook(seenMs: number): void {
  cache.deleteByPrefix('stripe_');
  cache.delete(CACHE_KEYS.TERMINAL_SUMMARY);
  setSeenStripeDataMs(seenMs);
}

/** Custom event name: dispatch when Stripe data was updated by webhook so components can refetch in background without full loading. */
export const STRIPE_DATA_UPDATED_EVENT = 'stripeDataUpdated';

/** Dispatched when client list/board was updated (move, create, delete, drawer save) so Pipeline Snapshot can refetch. */
export const TERMINAL_CLIENTS_UPDATED_EVENT = 'terminalClientsUpdated';

