/** Single source of truth for pipeline kanban + snapshot column order. */
export const PIPELINE_COLUMNS = [
  { id: 'cold_lead', title: 'Cold Lead', shortTitle: 'Cold' },
  { id: 'nurturing', title: 'Nurturing', shortTitle: 'Nurture' },
  { id: 'qualified', title: 'Qualified', shortTitle: 'Qualified' },
  { id: 'booked', title: 'Booked', shortTitle: 'Booked' },
  { id: 'active', title: 'Active', shortTitle: 'Active' },
  { id: 'offboarding', title: 'Offboarding', shortTitle: 'Offboard' },
  { id: 'dead', title: 'Dead', shortTitle: 'Dead' },
] as const;

export type PipelineColumnId = (typeof PIPELINE_COLUMNS)[number]['id'];

export const PIPELINE_COLUMN_IDS = PIPELINE_COLUMNS.map((c) => c.id);

const LEGACY_LIFECYCLE_MAP: Record<string, PipelineColumnId> = {
  warm_lead: 'booked',
};

/** Map API/legacy lifecycle values to a pipeline column id. */
export function normalizeLifecycleColumn(state: string | null | undefined): PipelineColumnId | null {
  if (!state) return null;
  const trimmed = state.trim();
  const lower = trimmed.toLowerCase();
  if (LEGACY_LIFECYCLE_MAP[lower]) return LEGACY_LIFECYCLE_MAP[lower];
  if ((PIPELINE_COLUMN_IDS as readonly string[]).includes(lower)) return lower as PipelineColumnId;
  return null;
}

export function getPipelineStageTitle(state: string | null | undefined): string {
  const id = normalizeLifecycleColumn(state);
  if (!id) return 'Unknown';
  return PIPELINE_COLUMNS.find((c) => c.id === id)?.title ?? id;
}

/** Next column in funnel order, or null when already at Dead. */
export function getNextPipelineStage(
  state: string | null | undefined,
): { id: PipelineColumnId; title: string } | null {
  const current = normalizeLifecycleColumn(state);
  if (!current) return null;
  const idx = PIPELINE_COLUMN_IDS.indexOf(current);
  if (idx < 0 || idx >= PIPELINE_COLUMN_IDS.length - 1) return null;
  const nextId = PIPELINE_COLUMN_IDS[idx + 1];
  const col = PIPELINE_COLUMNS.find((c) => c.id === nextId);
  return col ? { id: col.id, title: col.title } : null;
}

/** Ensure API/legacy lifecycle values map to a board column id. */
export function withNormalizedLifecycle<T extends { lifecycle_state: string }>(row: T): T {
  const column = normalizeLifecycleColumn(row.lifecycle_state);
  if (!column || column === row.lifecycle_state) return row;
  return { ...row, lifecycle_state: column };
}
