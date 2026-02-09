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

  // Merge clients by email (same logic as Kanban board)
  const mergedClients = useMemo(() => {
    const emailMap = new Map<string, Client[]>();
    const noEmailClients: Client[] = [];
    
    const normalizeEmail = (email: string | undefined | null): string | null => {
      if (!email) return null;
      return email.replace(/\s+/g, '').toLowerCase().trim() || null;
    };
    
    clients.forEach((client) => {
      const normalizedEmail = normalizeEmail(client.email);
      if (normalizedEmail) {
        if (!emailMap.has(normalizedEmail)) {
          emailMap.set(normalizedEmail, []);
        }
        emailMap.get(normalizedEmail)!.push(client);
      } else {
        noEmailClients.push(client);
      }
    });
    
    const mergedClientsList: Client[] = [];
    mergedClientsList.push(...noEmailClients);
    
    emailMap.forEach((clientsWithSameEmail) => {
      if (clientsWithSameEmail.length === 1) {
        mergedClientsList.push(clientsWithSameEmail[0]);
      } else {
        const sorted = [...clientsWithSameEmail].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const primary = sorted[0];
        
        const statePriority: Record<string, number> = {
          active: 5,
          warm_lead: 4,
          cold_lead: 3,
          offboarding: 2,
          dead: 1,
        };
        const mergedState = clientsWithSameEmail.reduce((prev, curr) => 
          statePriority[curr.lifecycle_state] > statePriority[prev.lifecycle_state]
            ? curr
            : prev
        ).lifecycle_state;
        
        mergedClientsList.push({
          ...primary,
          lifecycle_state: mergedState as Client['lifecycle_state'],
        });
      }
    });
    
    return mergedClientsList;
  }, [clients]);

  const counts = useMemo(() => {
    const counts: Record<string, number> = {
      cold_lead: 0,
      warm_lead: 0,
      active: 0,
      offboarding: 0,
      dead: 0,
    };
    
    mergedClients.forEach((client) => {
      counts[client.lifecycle_state] = (counts[client.lifecycle_state] || 0) + 1;
    });
    
    return counts;
  }, [mergedClients]);

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

