import { useEffect, useState } from 'react';
import { listOwnerNotices, sendOwnerNotice } from '@/lib/consultingNotices';
import type { OwnerOrgNotice } from '@/types/admin';
import ShinyButton from '@/components/ui/ShinyButton';

type Props = {
  orgId: string;
};

export default function OrgNoticeComposer({ orgId }: Props) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [notices, setNotices] = useState<OwnerOrgNotice[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listOwnerNotices();
        if (!cancelled) {
          setNotices(rows.filter((n) => n.org_id === orgId).slice(0, 6));
        }
      } catch {
        if (!cancelled) setNotices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const send = async () => {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setSendMsg(null);
    try {
      await sendOwnerNotice({ title: title.trim(), body: body.trim(), org_ids: [orgId] });
      setTitle('');
      setBody('');
      setSendMsg('Notice sent to this org’s portal.');
      const rows = await listOwnerNotices();
      setNotices(rows.filter((n) => n.org_id === orgId).slice(0, 6));
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setSendMsg(detail || 'Failed to send notice.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text">
          Add a notice
        </h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          Shows at the top of this org’s client portal until they dismiss it.
        </p>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full px-3 py-2 glass-input rounded-md text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What should this org know or do next?"
        rows={3}
        className="w-full px-3 py-2 glass-input rounded-md text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <ShinyButton
          onClick={() => void send()}
          disabled={sending || !title.trim() || !body.trim()}
          className="px-3 py-1.5 text-sm"
        >
          {sending ? 'Sending…' : 'Send notice'}
        </ShinyButton>
        {sendMsg ? <p className="text-xs text-gray-500">{sendMsg}</p> : null}
      </div>
      {notices.length > 0 ? (
        <div className="pt-1 space-y-2 max-h-36 overflow-y-auto">
          {notices.map((n) => (
            <div key={n.id} className="rounded-lg border border-gray-200/60 dark:border-white/10 px-3 py-2">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
              <p className="text-[11px] text-gray-500">
                {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
