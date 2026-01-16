import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Client } from '@/types/client';
import React from 'react';

interface ClientCardProps {
  client: Client;
  onClick: () => void;
  onDelete?: (client: Client) => void;
}

export default function ClientCard({ client, onClick, onDelete }: ClientCardProps) {
  // For merged clients, use email as the sortable ID, otherwise use client ID
  const sortableId = client.meta?.merged_client_ids ? (client.email || client.id) : client.id;
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Check if this is a merged client with multiple names
  const mergedNames = client.meta?.merged_names;
  const fullName = mergedNames || 
    [client.first_name, client.last_name]
      .filter(Boolean)
      .join(' ') || 'Unnamed Client';

  const handleClick = (e: React.MouseEvent) => {
    // Prevent click if dragging
    if (isDragging) return;
    e.stopPropagation();
    onClick();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(client);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="bg-white p-3 rounded shadow-sm cursor-pointer hover:shadow-md transition-shadow border border-gray-200 relative group"
    >
      {/* Action buttons - top right */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 z-10">
        {/* Delete button */}
        {onDelete && (
          <button
            onClick={handleDelete}
            className="w-4 h-4 text-red-400 hover:text-red-600 transition-colors"
            title="Delete client"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
        {/* Drag handle - only this area is draggable */}
        <div
          {...listeners}
          className="w-4 h-4 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
          onClick={(e) => e.stopPropagation()}
          title="Drag to move"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
          </svg>
        </div>
      </div>
      
      {/* Clickable content */}
      <div onClick={handleClick}>
        <div className="font-medium text-gray-900 flex items-center gap-2">
          {fullName}
          {client.meta?.merged_client_ids && client.meta.merged_client_ids.length > 1 && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
              {client.meta.merged_client_ids.length} merged
            </span>
          )}
        </div>
        {client.email && (
          <div className="text-sm text-gray-500 mt-1">{client.email}</div>
        )}
        {client.estimated_mrr > 0 && (
          <div className="text-sm font-semibold text-green-600 mt-2">
            ${client.estimated_mrr.toFixed(2)}/mo
          </div>
        )}
        {/* Program progress indicator */}
        {client.program_progress_percent !== undefined && client.program_progress_percent !== null && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Program Progress</span>
              <span>{client.program_progress_percent.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  client.program_progress_percent >= 100
                    ? 'bg-red-500'
                    : client.program_progress_percent >= 75
                    ? 'bg-yellow-500'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, client.program_progress_percent))}%` }}
              />
            </div>
            {client.program_end_date && (
              <div className="text-xs text-gray-500 mt-1">
                Ends: {new Date(client.program_end_date).toLocaleDateString()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


