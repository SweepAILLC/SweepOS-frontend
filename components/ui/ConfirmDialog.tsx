import { Fragment, type ReactNode } from 'react';
import { Dialog, Transition } from '@headlessui/react';

export type ConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Default: slate action; danger: red confirm (destructive). */
  variant?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
};

/**
 * Shared confirm modal — same interaction model as completing actions elsewhere (explicit confirm / cancel).
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await Promise.resolve(onConfirm());
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[60]" onClose={busy ? () => {} : onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 dark:bg-black/60" aria-hidden />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md glass-card neon-glow rounded-xl border border-gray-200 dark:border-white/10 p-5 shadow-xl">
                <Dialog.Title className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </Dialog.Title>
                {description ? (
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{description}</div>
                ) : null}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="px-4 py-2 text-sm font-medium rounded-lg glass-button-secondary hover:bg-white/20 disabled:opacity-50"
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirm()}
                    disabled={busy}
                    className={`px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 ${
                      variant === 'danger'
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'glass-button neon-glow'
                    }`}
                  >
                    {busy ? 'Saving…' : confirmLabel}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
