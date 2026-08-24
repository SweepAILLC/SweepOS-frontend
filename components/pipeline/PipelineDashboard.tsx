'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PipelineColumnId } from '@/lib/pipelineColumns';
import ClientKanbanBoard from '@/components/client/ClientKanbanBoard';
import PipelineSnapshot from '@/components/pipeline/PipelineSnapshot';
import { useLoading } from '@/contexts/LoadingContext';
import {
  consumePipelineColumnFilter,
  hydratePipelineStoreFromCache,
  setPipelineColumnFilter,
} from '@/lib/pipelineStore';

interface PipelineDashboardProps {
  /** False when the tab is hidden but kept mounted for instant return. */
  isActive?: boolean;
}

export default function PipelineDashboard({ isActive = true }: PipelineDashboardProps) {
  const [filteredColumn, setFilteredColumn] = useState<string | null>(null);
  const { setLoading: setGlobalLoading } = useLoading();

  useEffect(() => {
    if (!isActive) return;
    setGlobalLoading(false);
    hydratePipelineStoreFromCache();
  }, [isActive, setGlobalLoading]);

  useEffect(() => {
    if (!isActive) return;
    const pending = consumePipelineColumnFilter();
    if (pending) setFilteredColumn(pending);
  }, [isActive]);

  const handleSnapshotFilter = (column: string | null) => {
    setPipelineColumnFilter(column);
    setFilteredColumn(column);
  };

  const handleClientLifecycleChanged = useCallback(
    (columnId: PipelineColumnId) => {
      if (filteredColumn && filteredColumn !== columnId) {
        handleSnapshotFilter(null);
      }
    },
    [filteredColumn],
  );

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 w-full max-w-none">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate min-w-0">
            Pipeline
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Cold Lead → Nurturing → Qualified → Booked → Active → Offboarding → Dead
          </p>
        </div>
      </div>

      <PipelineSnapshot
        onFilterChange={handleSnapshotFilter}
        activeFilter={filteredColumn}
        isActive={isActive}
      />

      <div className="min-w-0">
        <ClientKanbanBoard
          filteredColumn={filteredColumn}
          isActive={isActive}
          onClientLifecycleChanged={handleClientLifecycleChanged}
        />
      </div>
    </div>
  );
}
