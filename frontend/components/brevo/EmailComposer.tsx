import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '@/lib/api';

interface EmailComposerProps {
  contactIds?: number[];
  listId?: number;
  recipients?: Array<{ email: string; name?: string }>;
  onClose: () => void;
  onSuccess?: () => void;
  initialSubject?: string;
  initialHtmlContent?: string;
  initialTextContent?: string;
}

export default function EmailComposer({
  contactIds,
  listId,
  recipients: initialRecipients,
  onClose,
  onSuccess,
  initialSubject,
  initialHtmlContent,
  initialTextContent
}: EmailComposerProps) {
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [subject, setSubject] = useState(initialSubject || '');
  const [htmlContent, setHtmlContent] = useState(initialHtmlContent || '');
  const [textContent, setTextContent] = useState(initialTextContent || '');
  const [useTemplate, setUseTemplate] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<Array<{ email: string; name?: string }>>(initialRecipients || []);
  const [selectedRecipientIndices, setSelectedRecipientIndices] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState(0);
  const [senders, setSenders] = useState<Array<{ id: number; name: string; email: string; active: boolean }>>([]);
  const [loadingSenders, setLoadingSenders] = useState(false);
  const [selectedSenderId, setSelectedSenderId] = useState<number | null>(null);

  useEffect(() => {
    // Load recipient information based on contactIds or listId
    if (contactIds && contactIds.length > 0) {
      loadContactEmails(contactIds);
    } else if (listId) {
      loadListEmails(listId);
    } else if (initialRecipients) {
      setRecipients(initialRecipients);
      setRecipientCount(initialRecipients.length);
      setSelectedRecipientIndices(new Set(initialRecipients.map((_, i) => i)));
    }
    
    // Load verified senders
    loadSenders();
  }, [contactIds, listId, initialRecipients]);

  // Update form fields when initial values change (e.g., when opening with pre-filled content)
  useEffect(() => {
    if (initialSubject) setSubject(initialSubject);
    if (initialHtmlContent) setHtmlContent(initialHtmlContent);
    if (initialTextContent) setTextContent(initialTextContent);
  }, [initialSubject, initialHtmlContent, initialTextContent]);

  const loadSenders = async () => {
    setLoadingSenders(true);
    try {
      const data = await apiClient.getBrevoSenders();
      const sendersList = data.senders || [];
      console.log('[EmailComposer] Loaded senders:', sendersList);
      setSenders(sendersList);
      
      // Auto-select first active sender if available and no sender is already selected
      if (sendersList.length > 0 && !senderEmail) {
        const activeSender = sendersList.find((s: any) => s.active);
        if (activeSender) {
          console.log('[EmailComposer] Auto-selecting sender:', activeSender);
          setSelectedSenderId(activeSender.id);
          setSenderEmail(activeSender.email);
          setSenderName(activeSender.name || activeSender.email);
        }
      }
    } catch (err) {
      console.error('[EmailComposer] Failed to load senders:', err);
      // Don't show error to user, just allow manual entry
      setSenders([]);
    } finally {
      setLoadingSenders(false);
    }
  };

  const loadContactEmails = async (ids: number[]) => {
    // For now, we'll fetch them on the backend, but we can show a count
    setRecipientCount(ids.length);
  };

  const loadListEmails = async (id: number) => {
    try {
      // Get list info to show count
      const lists = await apiClient.getBrevoLists(1000, 0);
      const list = lists.lists?.find((l: { id: number; uniqueSubscribers?: number }) => l.id === id);
      if (list) {
        setRecipientCount(list.uniqueSubscribers || 0);
      }
    } catch (err) {
      console.error('Failed to load list info:', err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!senderEmail || !subject) {
      setError('Sender email and subject are required');
      return;
    }

    if (!useTemplate && !htmlContent && !textContent) {
      setError('Please provide email content or use a template');
      return;
    }

    if (useTemplate && !templateId) {
      setError('Please select a template');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        sender: {
          email: senderEmail,
          name: senderName || senderEmail
        },
        subject
      };

      if (contactIds && contactIds.length > 0) {
        payload.contactIds = contactIds;
      } else if (listId) {
        payload.listId = listId;
      } else if (recipients.length > 0) {
        const toSend = selectedRecipientIndices.size > 0
          ? recipients.filter((_, i) => selectedRecipientIndices.has(i))
          : recipients;
        payload.recipients = toSend;
        if (toSend.length === 0) {
          setError('Select at least one recipient');
          setLoading(false);
          return;
        }
      } else {
        setError('No recipients specified');
        setLoading(false);
        return;
      }

      if (useTemplate) {
        payload.templateId = templateId;
      } else {
        if (htmlContent) payload.htmlContent = htmlContent;
        if (textContent) payload.textContent = textContent;
      }

      const result = await apiClient.sendBrevoTransactionalEmail(payload);
      const sentCount = payload.recipients?.length ?? result.recipientsCount ?? recipientCount;
      alert(`Email sent successfully to ${sentCount} recipient(s)!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black bg-opacity-70 dark:bg-opacity-80 flex items-start justify-center z-[99999] p-4 overflow-y-auto" onClick={onClose} style={{ paddingTop: '2rem' }}>
      <div 
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-6 max-w-3xl w-full my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Send Transactional Email</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
          </div>
        )}

        <form onSubmit={handleSend} className="space-y-4">
          {/* Recipients Info */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recipients</p>
            {contactIds && contactIds.length > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sending to {contactIds.length} selected contact(s)
              </p>
            )}
            {listId && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sending to entire list ({recipientCount} subscribers)
              </p>
            )}
            {recipients.length > 0 && !contactIds && !listId && (
              <div className="space-y-1">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  {recipients.length > 1
                    ? `Select recipients (${selectedRecipientIndices.size} of ${recipients.length} selected):`
                    : `Sending to 1 recipient:`}
                </p>
                <div className="space-y-1">
                  {recipients.map((recipient, index) => (
                    <label key={index} className="flex items-center gap-2 cursor-pointer">
                      {recipients.length > 1 && (
                        <input
                          type="checkbox"
                          checked={selectedRecipientIndices.has(index)}
                          onChange={() => {
                            const next = new Set(selectedRecipientIndices);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            setSelectedRecipientIndices(next);
                          }}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      )}
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {recipients.length === 0 && !contactIds && !listId && (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                No recipients specified
              </p>
            )}
          </div>

          {/* Sender */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sender Email *
              </label>
              {loadingSenders ? (
                <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  Loading senders...
                </div>
              ) : senders.length > 0 ? (
                <>
                  <select
                    value={selectedSenderId === null ? (senderEmail && !senders.some(s => s.email === senderEmail) ? 'custom' : '') : selectedSenderId}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setSelectedSenderId(null);
                        setSenderEmail('');
                        setSenderName('');
                      } else if (e.target.value === '') {
                        setSelectedSenderId(null);
                        setSenderEmail('');
                        setSenderName('');
                      } else {
                        const senderId = parseInt(e.target.value);
                        setSelectedSenderId(senderId);
                        const selectedSender = senders.find(s => s.id === senderId);
                        if (selectedSender) {
                          setSenderEmail(selectedSender.email);
                          setSenderName(selectedSender.name || selectedSender.email);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  >
                    <option value="">Select a verified sender...</option>
                    {senders
                      .filter(s => s.active)
                      .map((sender) => (
                        <option key={sender.id} value={sender.id}>
                          {sender.name ? `${sender.name} <${sender.email}>` : sender.email}
                        </option>
                      ))}
                    <option value="custom">Custom email address...</option>
                  </select>
                  {selectedSenderId === null && (
                    <input
                      type="email"
                      value={senderEmail}
                      onChange={(e) => {
                        setSenderEmail(e.target.value);
                      }}
                      required
                      className="w-full mt-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                      placeholder="Enter custom email..."
                    />
                  )}
                </>
              ) : (
                <input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  placeholder="noreply@example.com"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sender Name
              </label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                placeholder="Your Company"
              />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subject *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              placeholder="Email subject line"
            />
          </div>

          {/* Template vs Content */}
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={useTemplate}
                onChange={(e) => setUseTemplate(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Use Template</span>
            </label>
          </div>

          {useTemplate ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Template ID
              </label>
              <input
                type="number"
                value={templateId || ''}
                onChange={(e) => setTemplateId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                placeholder="Enter template ID"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Enter the Brevo template ID you want to use
              </p>
            </div>
          ) : (
            <>
              {/* HTML Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  HTML Content
                </label>
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  placeholder="<html><body><h1>Your email content</h1></body></html>"
                />
              </div>

              {/* Text Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Plain Text Content (fallback)
                </label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
                  placeholder="Plain text version of your email"
                />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary-500 dark:bg-primary-600 text-white hover:bg-primary-600 dark:hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending...' : `Send to ${selectedRecipientIndices.size > 0 ? selectedRecipientIndices.size : recipients.length} recipient(s)`}
            </button>
          </div>
      </form>
    </div>
  </div>
  );

  // Use portal to render modal at document.body level, ensuring it's on top of everything
  if (typeof window !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  
  return modalContent;
}

