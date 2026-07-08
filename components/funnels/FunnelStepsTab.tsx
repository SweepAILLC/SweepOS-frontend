import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { FunnelWithSteps, FunnelStep } from '@/types/funnel';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FunnelStepsTabProps {
  funnel: FunnelWithSteps;
  onReload: () => void;
}

function SortableStepItem({ step, onDelete }: { step: FunnelStep; onDelete: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center space-x-4 p-4 glass-panel rounded-lg mb-2"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
      >
        ☰
      </div>
      <span className="text-sm font-semibold text-gray-600 w-8">
        {step.step_order}
      </span>
      <div className="flex-1">
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {step.label || step.event_name}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-100">{step.event_name}</p>
      </div>
      <button
        onClick={onDelete}
        className="text-red-600 hover:text-red-800 text-sm"
      >
        Delete
      </button>
    </div>
  );
}

export default function FunnelStepsTab({ funnel, onReload }: FunnelStepsTabProps) {
  const [steps, setSteps] = useState<FunnelStep[]>(funnel.steps || []);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStep, setNewStep] = useState({ event_name: '', label: '' });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setSteps(funnel.steps || []);
  }, [funnel]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = steps.findIndex((s) => s.id === active.id);
      const newIndex = steps.findIndex((s) => s.id === over.id);

      const newSteps = arrayMove(steps, oldIndex, newIndex);
      
      // Update step_order for all steps
      const stepOrders = newSteps.map((step, index) => ({
        step_id: step.id,
        step_order: index + 1,
      }));

      try {
        setLoading(true);
        await apiClient.reorderFunnelSteps(funnel.id, stepOrders);
        setSteps(newSteps);
        onReload();
      } catch (err: any) {
        alert('Failed to reorder steps: ' + err.message);
        setSteps(funnel.steps || []);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAddStep = async () => {
    if (!newStep.event_name.trim()) {
      alert('Event name is required');
      return;
    }

    try {
      setLoading(true);
      const step = await apiClient.createFunnelStep(funnel.id, {
        event_name: newStep.event_name,
        label: newStep.label || undefined,
        step_order: steps.length + 1,
      });
      setSteps([...steps, step]);
      setNewStep({ event_name: '', label: '' });
      setShowAddForm(false);
      onReload();
    } catch (err: any) {
      alert('Failed to add step: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to delete this step?')) return;

    try {
      setLoading(true);
      await apiClient.deleteFunnelStep(funnel.id, stepId);
      setSteps(steps.filter((s) => s.id !== stepId));
      onReload();
    } catch (err: any) {
      alert('Failed to delete step: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Funnel Steps</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="glass-button neon-glow px-4 py-2 rounded"
        >
          + Add Step
        </button>
      </div>

      {showAddForm && (
        <div className="glass-card p-6">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-4">Add New Step</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Event Name *
              </label>
              <input
                type="text"
                value={newStep.event_name}
                onChange={(e) => setNewStep({ ...newStep, event_name: e.target.value })}
                placeholder="e.g., page_view, form_submit, booking_confirmed"
                className="w-full px-3 py-2 glass-input rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Label (optional)
              </label>
              <input
                type="text"
                value={newStep.label}
                onChange={(e) => setNewStep({ ...newStep, label: e.target.value })}
                placeholder="e.g., Landing Page, Form Submission"
                className="w-full px-3 py-2 glass-input rounded-md"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleAddStep}
                disabled={loading}
                className="glass-button neon-glow px-4 py-2 rounded disabled:opacity-50"
              >
                Add Step
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewStep({ event_name: '', label: '' });
                }}
                className="glass-button-secondary px-4 py-2 rounded hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {steps.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-600 mb-4">No steps yet. Add your first step to get started.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={steps.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div>
              {steps.map((step) => (
                <SortableStepItem
                  key={step.id}
                  step={step}
                  onDelete={() => handleDeleteStep(step.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
        </div>
      )}
    </div>
  );
}

