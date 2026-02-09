import { useState, useEffect, useMemo, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { apiClient } from '@/lib/api';
import { Client } from '@/types/client';
import ClientCard from './ClientCard';
import ClientDetailDrawer from './ClientDetailDrawer';
import ShinyButton from '../ui/ShinyButton';

const COLUMNS = [
  { id: 'cold_lead', title: 'Cold Lead' },
  { id: 'warm_lead', title: 'Warm Lead' },
  { id: 'active', title: 'Active' },
  { id: 'offboarding', title: 'Offboarding' },
  { id: 'dead', title: 'Dead' },
] as const;

type ColumnId = typeof COLUMNS[number]['id'];

interface ClientKanbanBoardProps {
  filteredColumn?: string | null;
  onLoadComplete?: () => void;
}

export default function ClientKanbanBoard({ filteredColumn = null, onLoadComplete }: ClientKanbanBoardProps = {}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<ColumnId | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const hasCalledOnLoadComplete = useRef(false);
  const [createFormData, setCreateFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    lifecycle_state: 'cold_lead' as ColumnId,
    notes: '',
    program_start_date: '',
    program_end_date: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadClients();
  }, []);

  // Listen for Stripe connection events to refresh clients
  useEffect(() => {
    const handleStripeConnected = () => {
      // Wait a bit for sync to complete, then refresh
      setTimeout(() => {
        loadClients();
      }, 3000);
    };

    // Listen for custom event when Stripe is connected
    window.addEventListener('stripe-connected', handleStripeConnected);
    
    // Also check on mount if we're coming from Stripe connection
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('stripe_connected') === 'true') {
      handleStripeConnected();
    }

    return () => {
      window.removeEventListener('stripe-connected', handleStripeConnected);
    };
  }, []);

  const loadClients = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        console.log('[KanbanBoard] Force refreshing clients...');
      } else {
        console.log('[KanbanBoard] Loading clients...');
      }
      
      const data = await apiClient.getClients();
      const stateCounts = data.reduce((acc: Record<string, number>, client) => {
        acc[client.lifecycle_state] = (acc[client.lifecycle_state] || 0) + 1;
        return acc;
      }, {});
      console.log('[KanbanBoard] Clients loaded:', {
        count: data.length,
        states: stateCounts
      });
      
      // Log clients with programs at 75%+ to verify they're in the right state
      const highProgressClients = data.filter(c => 
        c.program_progress_percent && c.program_progress_percent >= 75
      );
      if (highProgressClients.length > 0) {
        console.log('[KanbanBoard] Clients with 75%+ progress:', 
          highProgressClients.map(c => ({
            id: c.id,
            email: c.email,
            progress: c.program_progress_percent,
            state: c.lifecycle_state,
            expectedState: c.program_progress_percent >= 100 ? 'dead' : 'offboarding',
            inCorrectColumn: (c.program_progress_percent >= 100 && c.lifecycle_state === 'dead') ||
                            (c.program_progress_percent >= 75 && c.program_progress_percent < 100 && c.lifecycle_state === 'offboarding')
          }))
        );
      }
      
      // Force state update by creating a new array reference
      setClients([...data]);
      
      // Return the data for use in onUpdate callback
      return data;
    } catch (error) {
      console.error('Failed to load clients:', error);
      throw error;
    } finally {
      setLoading(false);
      if (!hasCalledOnLoadComplete.current && onLoadComplete) {
        hasCalledOnLoadComplete.current = true;
        onLoadComplete();
      }
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over && COLUMNS.some(col => col.id === over.id)) {
      setActiveColumn(over.id as ColumnId);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveColumn(null);

    if (!over) {
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Helper function to find client by sortable ID (email for merged, ID for regular)
    const findClientBySortableId = (sortableId: string): Client | undefined => {
      return mergedClients.find(c => {
        // For merged clients, the sortable ID is the email
        if (c.meta?.merged_client_ids) {
          return c.email === sortableId;
        }
        // For regular clients, the sortable ID is the client ID
        return c.id === sortableId;
      });
    };

    // Find the client being dragged using the sortable ID
    const draggedClient = findClientBySortableId(activeId);

    if (!draggedClient) {
      console.error('[KANBAN] Could not find dragged client with sortable ID:', activeId);
      return;
    }

    // Check if dropped on a column
    const columnId = COLUMNS.find(col => col.id === overId);
    if (columnId) {
      // Dropped on a column header - move to that column
      const newColumnId = columnId.id;
      const clientIdToUpdate = draggedClient.meta?.merged_client_ids?.[0] || draggedClient.id;
      await updateClientState(clientIdToUpdate, newColumnId, draggedClient);
      return;
    }

    // Might be dropped on another card
    const targetClient = findClientBySortableId(overId);
    if (targetClient) {
      const newColumnId = targetClient.lifecycle_state as ColumnId;
      const currentColumnId = draggedClient.lifecycle_state as ColumnId;
      
      // Check if moving within the same column (reordering)
      if (newColumnId === currentColumnId) {
        await reorderClientInColumn(draggedClient, targetClient, newColumnId);
      } else {
        // Moving to a different column
        const clientIdToUpdate = draggedClient.meta?.merged_client_ids?.[0] || draggedClient.id;
        await updateClientState(clientIdToUpdate, newColumnId, draggedClient);
      }
    }
  };

  const reorderClientInColumn = async (draggedClient: Client, targetClient: Client, columnId: ColumnId) => {
    // Get all clients in this column, sorted by current sort_order
    const columnClients = filteredClients
      .filter(c => c.lifecycle_state === columnId)
      .sort((a, b) => {
        const aOrder = a.meta?.sort_orders?.[columnId] ?? 0;
        const bOrder = b.meta?.sort_orders?.[columnId] ?? 0;
        return aOrder - bOrder;
      });

    // Find indices
    const draggedIndex = columnClients.findIndex(c => {
      const sortableId = c.meta?.merged_client_ids ? (c.email || c.id) : c.id;
      const draggedSortableId = draggedClient.meta?.merged_client_ids ? (draggedClient.email || draggedClient.id) : draggedClient.id;
      return sortableId === draggedSortableId;
    });
    const targetIndex = columnClients.findIndex(c => {
      const sortableId = c.meta?.merged_client_ids ? (c.email || c.id) : c.id;
      const targetSortableId = targetClient.meta?.merged_client_ids ? (targetClient.email || targetClient.id) : targetClient.id;
      return sortableId === targetSortableId;
    });

    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
      return; // No change needed
    }

    // Reorder the array
    const reorderedClients = [...columnClients];
    const [removed] = reorderedClients.splice(draggedIndex, 1);
    reorderedClients.splice(targetIndex, 0, removed);

    // Update sort orders for all affected clients
    const updates: Array<{ clientId: string; sortOrder: number }> = [];
    reorderedClients.forEach((client, index) => {
      const clientId = client.meta?.merged_client_ids?.[0] || client.id;
      updates.push({ clientId, sortOrder: index });
    });

    // Optimistic update
    const originalClients = [...clients];
    const updatedClients = clients.map((c) => {
      const update = updates.find(u => u.clientId === c.id);
      if (update) {
        return {
          ...c,
          meta: {
            ...c.meta,
            sort_orders: {
              ...(c.meta?.sort_orders || {}),
              [columnId]: update.sortOrder,
            },
          },
        };
      }
      return c;
    });
    setClients(updatedClients);

    try {
      // Update all affected clients on server
      await Promise.all(
        updates.map(({ clientId, sortOrder }) => {
          const client = clients.find(c => c.id === clientId);
          if (!client) return Promise.resolve();
          
          const currentMeta = client.meta || {};
          return apiClient.updateClient(clientId, {
            meta: {
              ...currentMeta,
              sort_orders: {
                ...(currentMeta.sort_orders || {}),
                [columnId]: sortOrder,
              },
            },
          });
        })
      );
      
      // Reload to ensure consistency
      await loadClients();
    } catch (error) {
      // Revert on error
      setClients(originalClients);
      console.error('Failed to reorder clients:', error);
      alert('Failed to reorder clients. Please try again.');
    }
  };

  const updateClientState = async (clientId: string, newColumnId: ColumnId, draggedClient?: Client) => {
    // If draggedClient is provided (from merged clients), use it directly
    // Otherwise, find the client in the raw clients array
    let client = draggedClient;
    if (!client) {
      client = clients.find((c) => c.id === clientId);
    }
    
    if (!client) {
      console.error('[KANBAN] Could not find client with ID:', clientId);
      return;
    }

    // Don't update if already in the target column
    if (client.lifecycle_state === newColumnId) {
      return;
    }

    // Check if this is a merged client (has merged_client_ids in meta)
    const mergedClientIds = client.meta?.merged_client_ids;
    const clientIdsToUpdate = mergedClientIds || [clientId];

    // Check if moving FROM offboarding to another column
    // If so, reset program fields
    const isMovingFromOffboarding = client.lifecycle_state === 'offboarding' && newColumnId !== 'offboarding';
    
    // Prepare update data
    const updateData: any = {
      lifecycle_state: newColumnId,
    };
    
    // If moving from offboarding, reset program fields
    if (isMovingFromOffboarding) {
      updateData.program_progress_percent = null;
      updateData.program_duration_days = null;
      updateData.program_start_date = null;
      updateData.program_end_date = null;
      console.log(`[KANBAN] Moving client from offboarding to ${newColumnId}, resetting program fields`);
    }

    // Optimistic update - update both raw clients and merged clients display
    const originalClients = [...clients];
    const updatedClients = clients.map((c) => {
      if (clientIdsToUpdate.includes(c.id)) {
        const updated = { ...c, lifecycle_state: newColumnId };
        if (isMovingFromOffboarding) {
          updated.program_progress_percent = null;
          updated.program_duration_days = null;
          updated.program_start_date = null;
          updated.program_end_date = null;
        }
        return updated;
      }
      return c;
    });
    setClients(updatedClients);

    try {
      // Update all underlying clients on server
      await Promise.all(
        clientIdsToUpdate.map((id: string) =>
          apiClient.updateClient(id, updateData)
        )
      );
      
      // Reload clients to ensure merged clients are recalculated with new state
      // This ensures the card appears in the correct column
      await loadClients();
    } catch (error) {
      // Revert on error
      setClients(originalClients);
      console.error('Failed to update client:', error);
      alert('Failed to update client. Please try again.');
    }
  };

  // Group ALL clients by email and merge duplicates (across all columns)
  // This ensures clients with the same email are merged even if they're in different columns
  const mergedClients = useMemo(() => {
    const emailMap = new Map<string, Client[]>();
    const noEmailClients: Client[] = [];
    
    // Normalize email function - handles various edge cases
    const normalizeEmail = (email: string | undefined | null): string | null => {
      if (!email) return null;
      // Remove all whitespace, convert to lowercase
      const normalized = email.replace(/\s+/g, '').toLowerCase().trim();
      return normalized.length > 0 ? normalized : null;
    };
    
    // Group ALL clients by email (case-insensitive, normalized)
    clients.forEach((client) => {
      const normalizedEmail = normalizeEmail(client.email);
      if (normalizedEmail) {
        if (!emailMap.has(normalizedEmail)) {
          emailMap.set(normalizedEmail, []);
        }
        emailMap.get(normalizedEmail)!.push(client);
      } else {
        // Clients without email are not grouped
        noEmailClients.push(client);
      }
    });
    
    // Debug: Log email groups
    emailMap.forEach((clientsWithSameEmail, email) => {
      if (clientsWithSameEmail.length > 1) {
        console.log(`[CLIENT_MERGE] Found ${clientsWithSameEmail.length} clients with email "${email}":`, 
          clientsWithSameEmail.map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, state: c.lifecycle_state }))
        );
      }
    });
    
    const mergedClientsList: Client[] = [];
    
    // Add clients without email as-is
    mergedClientsList.push(...noEmailClients);
    
    // Process clients grouped by email
    emailMap.forEach((clientsWithSameEmail, normalizedEmail) => {
      if (clientsWithSameEmail.length === 1) {
        // No duplicates, use as-is
        mergedClientsList.push(clientsWithSameEmail[0]);
      } else {
        // Multiple clients with same email - merge them
        // Sort by created_at to use the oldest as primary
        const sorted = [...clientsWithSameEmail].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const primary = sorted[0];
        
        // Collect all unique names (excluding empty names)
        const names = new Set<string>();
        clientsWithSameEmail.forEach((c) => {
          const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
          if (fullName.trim()) {
            names.add(fullName.trim());
          }
        });
        
        // Combine names with "/"
        const combinedName = Array.from(names).join(' / ') || 'Unnamed Client';
        
        // Determine the lifecycle_state
        // First, check if any client should be in offboarding/dead based on progress
        // If a client has progress >= 100%, merged state should be "dead"
        // If a client has progress >= 75%, merged state should be "offboarding"
        // Otherwise, use the most "active" state (priority: active > warm_lead > cold_lead > offboarding > dead)
        let mergedState: ColumnId;
        
        const hasDeadClient = clientsWithSameEmail.some(c => 
          c.program_progress_percent && c.program_progress_percent >= 100
        );
        const hasOffboardingClient = clientsWithSameEmail.some(c => 
          c.program_progress_percent && c.program_progress_percent >= 75 && c.program_progress_percent < 100
        );
        
        if (hasDeadClient) {
          mergedState = 'dead';
          console.log(`[CLIENT_MERGE] Merged client ${normalizedEmail} set to 'dead' due to progress >= 100%`);
        } else if (hasOffboardingClient) {
          mergedState = 'offboarding';
          console.log(`[CLIENT_MERGE] Merged client ${normalizedEmail} set to 'offboarding' due to progress >= 75%`);
        } else {
          // Use priority system for clients without high progress
          const statePriority: Record<ColumnId, number> = {
            active: 5,
            warm_lead: 4,
            cold_lead: 3,
            offboarding: 2,
            dead: 1,
          };
          mergedState = clientsWithSameEmail.reduce((prev, curr) => 
            statePriority[curr.lifecycle_state as ColumnId] > statePriority[prev.lifecycle_state as ColumnId]
              ? curr
              : prev
          ).lifecycle_state as ColumnId;
        }
        
        // Create merged client
        const mergedClient: Client = {
          ...primary,
          lifecycle_state: mergedState,
          // Store combined name in a custom field for display
          meta: {
            ...primary.meta,
            merged_names: combinedName,
            merged_client_ids: clientsWithSameEmail.map(c => c.id),
            normalized_email: normalizedEmail, // Store normalized email for lookup
          },
          // Use the highest MRR and revenue from merged clients
          estimated_mrr: Math.max(...clientsWithSameEmail.map(c => c.estimated_mrr || 0)),
          lifetime_revenue_cents: Math.max(...clientsWithSameEmail.map(c => c.lifetime_revenue_cents || 0)),
        };
        
        mergedClientsList.push(mergedClient);
      }
    });
    
    return mergedClientsList;
  }, [clients]);

  // Filter merged clients by search query
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) {
      return mergedClients;
    }
    
    const query = searchQuery.toLowerCase().trim();
    
    return mergedClients.filter((client) => {
      // Search by name (first_name, last_name, or merged_names)
      const fullName = client.meta?.merged_names || 
        [client.first_name, client.last_name].filter(Boolean).join(' ').toLowerCase();
      if (fullName.includes(query)) {
        return true;
      }
      
      // Search by email
      if (client.email && client.email.toLowerCase().includes(query)) {
        return true;
      }
      
      // Search by phone (normalize both query and phone by removing non-digits)
      if (client.phone) {
        const normalizedPhone = client.phone.replace(/\D/g, '');
        const normalizedQuery = query.replace(/\D/g, '');
        if (normalizedPhone.includes(normalizedQuery)) {
          return true;
        }
      }
      
      return false;
    });
  }, [mergedClients, searchQuery]);

  const getClientsForColumn = (columnId: ColumnId) => {
    // If a filter is active and this column doesn't match, return empty array
    if (filteredColumn && filteredColumn !== columnId) {
      return [];
    }
    
    // Filter filtered clients by column
    // For merged clients, show them only in the column that matches their merged lifecycle_state
    // This ensures each merged client appears in exactly one column
    const columnClients = filteredClients.filter((client) => {
      const matches = client.lifecycle_state === columnId;
      
      // Debug logging for state mismatches (especially for offboarding column)
      if (columnId === 'offboarding') {
        if (client.program_progress_percent && client.program_progress_percent >= 75 && client.program_progress_percent < 100) {
          if (!matches) {
            console.warn('[KanbanBoard] ⚠️ Client should be in offboarding but is not:', {
              id: client.id,
              email: client.email,
              lifecycle_state: client.lifecycle_state,
              progress: client.program_progress_percent,
              expectedColumn: 'offboarding',
              actualColumn: client.lifecycle_state
            });
          } else {
            console.log('[KanbanBoard] ✅ Client correctly in offboarding column:', {
              id: client.id,
              email: client.email,
              progress: client.program_progress_percent
            });
          }
        }
      }
      
      return matches;
    });
    
    // Log column counts for debugging
    if (columnId === 'offboarding' && columnClients.length > 0) {
      console.log(`[KanbanBoard] Offboarding column has ${columnClients.length} client(s)`);
    }
    
    // Sort by sort_order for this column (stored in meta.sort_orders[columnId])
    return columnClients.sort((a, b) => {
      const aOrder = a.meta?.sort_orders?.[columnId] ?? 0;
      const bOrder = b.meta?.sort_orders?.[columnId] ?? 0;
      // If sort orders are equal, maintain original order (by created_at)
      if (aOrder === bOrder) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return aOrder - bOrder;
    });
  };

  const handleDeleteClient = async (client: Client) => {
    // Check if this is a merged client
    const mergedIds = client.meta?.merged_client_ids;
    const isMerged = mergedIds && mergedIds.length > 1;
    const clientCount = isMerged ? (client.meta?.merged_client_ids?.length || 1) : 1;
    
    const confirmMessage = isMerged
      ? `This will delete ${clientCount} merged client(s) with email "${client.email}". Are you sure?`
      : `Are you sure you want to delete "${[client.first_name, client.last_name].filter(Boolean).join(' ') || 'this client'}"?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      // Delete the client (and all merged clients if it's a merged client)
      await apiClient.deleteClient(client.id, isMerged);
      
      // Reload clients to refresh the board
      await loadClients();
      
      // Close drawer if the deleted client was selected
      if (selectedClient && (selectedClient.id === client.id || 
          (isMerged && mergedIds?.includes(selectedClient.id)))) {
        setIsDrawerOpen(false);
        setSelectedClient(null);
      }
    } catch (error: any) {
      console.error('Failed to delete client:', error);
      alert(error?.response?.data?.detail || 'Failed to delete client. Please try again.');
    }
  };

  const handleCreateClient = async () => {
    if (!createFormData.first_name && !createFormData.last_name && !createFormData.email) {
      alert('Please provide at least a name or email');
      return;
    }

    setCreating(true);
    try {
      // Prepare data for API - convert date strings to ISO format
      const clientData: any = {
        first_name: createFormData.first_name || undefined,
        last_name: createFormData.last_name || undefined,
        email: createFormData.email || undefined,
        phone: createFormData.phone || undefined,
        lifecycle_state: createFormData.lifecycle_state,
        notes: createFormData.notes || undefined,
      };
      
      // Convert date strings to ISO format if provided
      if (createFormData.program_start_date && createFormData.program_start_date.trim() !== '') {
        clientData.program_start_date = new Date(createFormData.program_start_date + 'T00:00:00').toISOString();
      }
      
      if (createFormData.program_end_date && createFormData.program_end_date.trim() !== '') {
        clientData.program_end_date = new Date(createFormData.program_end_date + 'T00:00:00').toISOString();
      }
      
      const newClient = await apiClient.createClient(clientData);
      await loadClients();
      setIsCreateModalOpen(false);
      setCreateFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        lifecycle_state: 'cold_lead',
        notes: '',
        program_start_date: '',
        program_end_date: '',
      });
      // Optionally open the new client in the drawer
      setSelectedClient(newClient);
      setIsDrawerOpen(true);
    } catch (error: any) {
      console.error('Failed to create client:', error);
      alert(error?.response?.data?.detail || 'Failed to create client. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading clients...</div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Client Management</h2>
          <ShinyButton onClick={() => setIsCreateModalOpen(true)}>
            <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Client
          </ShinyButton>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="block w-full pl-10 pr-3 py-2 glass-input rounded-md leading-5 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="text-sm text-gray-600 dark:text-gray-400 digitized-text">
            Found {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''} matching &quot;{searchQuery}&quot;
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((column) => {
            const columnClients = getClientsForColumn(column.id);
            // Hide column if filtered and doesn't match
            if (filteredColumn && filteredColumn !== column.id) {
              return null;
            }
            return (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                clients={columnClients}
                isActive={activeColumn === column.id}
                onClientClick={(client) => {
                  setSelectedClient(client);
                  setIsDrawerOpen(true);
                }}
                onClientDelete={handleDeleteClient}
              />
            );
          })}
        </div>
      </DndContext>

      <ClientDetailDrawer
        client={selectedClient}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedClient(null);
        }}
        onUpdate={async () => {
          console.log('[KanbanBoard] onUpdate called, reloading clients...');
          const previousSelectedId = selectedClient?.id;
          const previousSelectedState = selectedClient?.lifecycle_state;
          
          // Reload all clients - this will get the updated states from the server
          const updatedClients = await loadClients(true);
          
          // After clients are loaded, update the selectedClient if one was selected
          if (previousSelectedId && updatedClients) {
            const updatedClient = updatedClients.find(c => c.id === previousSelectedId);
            if (updatedClient) {
              console.log('[KanbanBoard] Updating selected client after refresh:', {
                id: updatedClient.id,
                oldState: previousSelectedState,
                newState: updatedClient.lifecycle_state,
                progress: updatedClient.program_progress_percent,
                stateChanged: previousSelectedState !== updatedClient.lifecycle_state
              });
              setSelectedClient(updatedClient);
              
              // If state changed, the card should now be in a different column
              if (previousSelectedState !== updatedClient.lifecycle_state) {
                console.log('[KanbanBoard] ✅ Client state changed! Card should move to', updatedClient.lifecycle_state, 'column');
              }
            } else {
              console.warn('[KanbanBoard] Could not find updated client with ID:', previousSelectedId);
            }
          }
        }}
      />

      {/* Create Client Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:glass-card rounded-lg shadow-lg border border-gray-200 dark:border-white/10 neon-glow p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Create New Client</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={createFormData.first_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, first_name: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="John"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={createFormData.last_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, last_name: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={createFormData.phone}
                  onChange={(e) => setCreateFormData({ ...createFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Initial Status
                </label>
                <select
                  value={createFormData.lifecycle_state}
                  onChange={(e) => setCreateFormData({ ...createFormData, lifecycle_state: e.target.value as ColumnId })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={createFormData.notes}
                  onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Additional notes about this client..."
                />
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Program Timeline (Optional)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Program Start Date
                    </label>
                    <input
                      type="date"
                      value={createFormData.program_start_date}
                      onChange={(e) => setCreateFormData({ ...createFormData, program_start_date: e.target.value })}
                      className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Program End Date
                    </label>
                    <input
                      type="date"
                      value={createFormData.program_end_date}
                      onChange={(e) => setCreateFormData({ ...createFormData, program_end_date: e.target.value })}
                      min={createFormData.program_start_date || undefined}
                      className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Client will automatically move to offboarding at 75% progress and dead when expired
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreateFormData({
                    first_name: '',
                    last_name: '',
                    email: '',
                    phone: '',
                    lifecycle_state: 'cold_lead',
                    notes: '',
                    program_start_date: '',
                    program_end_date: '',
                  });
                }}
                className="glass-button-secondary px-4 py-2 text-sm font-medium rounded-md hover:bg-white/20"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateClient}
                disabled={creating}
                className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface KanbanColumnProps {
  id: ColumnId;
  title: string;
  clients: Client[];
  isActive: boolean;
  onClientClick: (client: Client) => void;
  onClientDelete?: (client: Client) => void;
}

function KanbanColumn({ id, title, clients, isActive, onClientClick, onClientDelete }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: id,
  });

  return (
    <div className="flex-shrink-0 w-64">
      <div
        ref={setNodeRef}
        className={`glass-card p-4 min-h-[400px] transition-shadow ${
          isActive ? 'neon-glow' : ''
        }`}
      >
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-4 digitized-text">
          {title} ({clients.length})
        </h3>
        <SortableContext
          items={clients.map((c) => {
            // For merged clients, use email as unique ID, otherwise use client ID
            return c.meta?.merged_client_ids ? (c.email || c.id) : c.id;
          })}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {clients.map((client) => (
              <ClientCard
                key={client.meta?.merged_client_ids ? (client.email || client.id) : client.id}
                client={client}
                onClick={() => onClientClick(client)}
                onDelete={onClientDelete}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

