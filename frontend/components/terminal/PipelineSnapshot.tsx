import { useState, useEffect, useMemo, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { Client } from '@/types/client';

interface PipelineSnapshotProps {
  onFilterChange: (column: string | null) => void;
  onLoadComplete?: () => void;
}

const COLUMNS = [
  { id: 'cold_lead', title: 'Cold', color: 'text-gray-500' },
  { id: 'warm_lead', title: 'Warm', color: 'text-yellow-500' },
  { id: 'active', title: 'Active', color: 'text-green-500' },
  { id: 'offboarding', title: 'Offboarding', color: 'text-orange-500' },
  { id: 'dead', title: 'Dead', color: 'text-red-500' },
] as const;

export default function PipelineSnapshot({ onFilterChange, onLoadComplete }: PipelineSnapshotProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const hasCalledOnLoadComplete = useRef(false);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const data = await apiClient.getClients();
      setClients(data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setLoading(false);
      if (!hasCalledOnLoadComplete.current && onLoadComplete) {
        hasCalledOnLoadComplete.current = true;
        onLoadComplete();
      }
    }
  };

  const counts = useMemo(() => {
    const counts: Record<string, number> = {
      cold_lead: 0,
      warm_lead: 0,
      active: 0,
      offboarding: 0,
      dead: 0,
    };
    clients.forEach((client) => {
      counts[client.lifecycle_state] = (counts[client.lifecycle_state] || 0) + 1;
    });
    return counts;
  }, [clients]);

  const handleCountClick = (columnId: string) => {
    if (activeFilter === columnId) {
      setActiveFilter(null);
      onFilterChange(null);
    } else {
      setActiveFilter(columnId);
      onFilterChange(columnId);
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading pipeline snapshot...</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 digitized-text">
        Pipeline Snapshot
      </h3>
      <div className="flex flex-wrap gap-4">
        {COLUMNS.map((column) => {
          const count = counts[column.id] || 0;
          const isActive = activeFilter === column.id;
          
          return (
            <button
              key={column.id}
              onClick={() => handleCountClick(column.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                isActive
                  ? 'glass-button neon-glow'
                  : 'glass-panel hover:bg-white/20'
              }`}
            >
              <span className={`text-sm font-medium ${column.color} dark:text-gray-100`}>
                {column.title}
              </span>
              <span className={`text-lg font-bold ${isActive ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

