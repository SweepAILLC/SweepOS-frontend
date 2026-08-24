import { useToast } from '@/contexts/ToastContext';

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: '420px' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
              pointer-events-auto rounded-lg shadow-xl border px-4 py-3 flex items-start gap-3
              ${toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-900' : ''}
              ${toast.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-900' : ''}
              ${toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-900' : ''}
              ${toast.type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-900' : ''}
            `}
        >
          <div className="flex-1 text-sm font-medium leading-snug">{toast.message}</div>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
