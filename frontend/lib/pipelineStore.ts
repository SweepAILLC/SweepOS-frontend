import type { Client } from '@/types/client';
import { peekCachedClientsList } from '@/lib/api';
import { normalizeLifecycleColumn, PIPELINE_COLUMNS } from '@/lib/pipelineColumns';

type Listener = () => void;

const PIPELINE_FILTER_STORAGE_KEY = 'pipelineColumnFilter';

let clients: Client[] = [];
const listeners = new Set<Listener>();

/** In-memory pipeline board state — survives tab switches within the session. */
export function getPipelineClients(): Client[] {
  return clients;
}

/** Prime store from GET /clients cache so snapshot + board match before network returns. */
export function hydratePipelineStoreFromCache(): boolean {
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
  clients = next;
  notifyPipelineListeners();
}

export function patchPipelineClient(updated: Client): void {
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
  clients = clients.filter((c) => c.id !== clientId);
  notifyPipelineListeners();
}

export function clearPipelineStore(): void {
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

/** Persist snapshot funnel filter across tab switches (session only). */
export function setPipelineColumnFilter(column: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (column) sessionStorage.setItem(PIPELINE_FILTER_STORAGE_KEY, column);
  else sessionStorage.removeItem(PIPELINE_FILTER_STORAGE_KEY);
}

export function peekPipelineColumnFilter(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(PIPELINE_FILTER_STORAGE_KEY);
}

export function consumePipelineColumnFilter(): string | null {
  const v = peekPipelineColumnFilter();
  if (v) sessionStorage.removeItem(PIPELINE_FILTER_STORAGE_KEY);
  return v;
}
