import type { Client } from '@/types/client';
import { peekCachedClientsList } from '@/lib/api';
import { orgIdFromAccessToken } from '@/lib/orgScope';
import { normalizeLifecycleColumn, PIPELINE_COLUMNS } from '@/lib/pipelineColumns';

type Listener = () => void;

const PIPELINE_FILTER_STORAGE_PREFIX = 'pipelineColumnFilter';

let scopedOrgId: string | null = null;
let clients: Client[] = [];
const listeners = new Set<Listener>();

function pipelineFilterStorageKey(): string {
  return `${PIPELINE_FILTER_STORAGE_PREFIX}_${orgIdFromAccessToken()}`;
}

/** Drop in-memory board rows when JWT org_id changes (org switch / impersonation). */
function syncOrgScope(): void {
  const org = orgIdFromAccessToken();
  if (scopedOrgId === org) return;
  scopedOrgId = org;
  clients = [];
}

export function pipelineClientsEqual(a: Client[], b: Client[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].updated_at !== b[i].updated_at) return false;
    if (a[i].lifecycle_state !== b[i].lifecycle_state) return false;
  }
  return true;
}

/** In-memory pipeline board state — scoped by org; survives tab switches within the same org. */
export function getPipelineClients(): Client[] {
  syncOrgScope();
  return clients;
}

/** Prime store from GET /clients cache so snapshot + board match before network returns. */
export function hydratePipelineStoreFromCache(): boolean {
  syncOrgScope();
  if (clients.length > 0) return true;
  const cached = peekCachedClientsList();
  if (!cached?.length) return false;
  clients = cached.map((client) => {
    const column = normalizeLifecycleColumn(client.lifecycle_state);
    return column && column !== client.lifecycle_state
      ? { ...client, lifecycle_state: column }
      : client;
  });
  notifyPipelineListeners();
  return true;
}

function notifyPipelineListeners(): void {
  listeners.forEach((listener) => listener());
}

export function setPipelineClients(next: Client[]): void {
  syncOrgScope();
  if (pipelineClientsEqual(clients, next)) return;
  clients = next;
  notifyPipelineListeners();
}

export function patchPipelineClient(updated: Client): void {
  syncOrgScope();
  const normalized = {
    ...updated,
    lifecycle_state:
      normalizeLifecycleColumn(updated.lifecycle_state) ?? updated.lifecycle_state,
  } as Client;
  const idx = clients.findIndex((c) => c.id === normalized.id);
  if (idx >= 0) {
    clients = clients.map((c, i) => (i === idx ? normalized : c));
  } else {
    clients = [normalized, ...clients];
  }
  notifyPipelineListeners();
}

export function removePipelineClient(clientId: string): void {
  syncOrgScope();
  clients = clients.filter((c) => c.id !== clientId);
  notifyPipelineListeners();
}

export function clearPipelineStore(): void {
  scopedOrgId = orgIdFromAccessToken();
  clients = [];
  notifyPipelineListeners();
}

export function subscribePipelineClients(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pipelineCountsFromClients(clientList: Client[]): Record<string, number> {
  const counts = Object.fromEntries(PIPELINE_COLUMNS.map((col) => [col.id, 0]));
  for (const client of clientList) {
    const col = normalizeLifecycleColumn(client.lifecycle_state);
    if (col && col in counts) counts[col]++;
  }
  return counts;
}

/** Persist snapshot funnel filter across tab switches (session only, per org). */
export function setPipelineColumnFilter(column: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  const key = pipelineFilterStorageKey();
  if (column) sessionStorage.setItem(key, column);
  else sessionStorage.removeItem(key);
}

export function peekPipelineColumnFilter(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(pipelineFilterStorageKey());
}

export function consumePipelineColumnFilter(): string | null {
  const v = peekPipelineColumnFilter();
  if (v) sessionStorage.removeItem(pipelineFilterStorageKey());
  return v;
}

/** Reset org scope without clearing listeners — used after org switch before reload. */
export function resetPipelineOrgScope(): void {
  scopedOrgId = null;
  clients = [];
  notifyPipelineListeners();
}
