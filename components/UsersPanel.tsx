import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '@/lib/api';
import ShinyButton from './ui/ShinyButton';
import { useLoading } from '@/contexts/LoadingContext';
import type { TeamRole } from '@/types/team';

/**
 * One role per person. Owner / Admin are access levels; Sales rep and Marketing rep are
 * member access (default member permissions) plus a rep type. Sales reps owe the daily
 * EOD and show on Funnels → Organic; marketing reps don't.
 */
type RoleKey = 'owner' | 'admin' | 'sales_rep' | 'marketing_rep' | 'member';

const ROLE_LABEL: Record<RoleKey, string> = {
  owner: 'Owner',
  admin: 'Admin',
  sales_rep: 'Sales rep',
  marketing_rep: 'Marketing rep',
  member: 'Member',
};

const ROLE_PILL: Record<RoleKey, string> = {
  owner: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/60 dark:text-purple-100 dark:border-purple-500/50',
  admin: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-100 dark:border-blue-500/50',
  sales_rep: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-100 dark:border-emerald-500/50',
  marketing_rep: 'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/50 dark:text-pink-100 dark:border-pink-500/50',
  member: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-white/10 dark:text-gray-200 dark:border-white/20',
};

const REP_TYPE: Partial<Record<RoleKey, TeamRole>> = { sales_rep: 'sales', marketing_rep: 'marketing' };

function roleKeyOf(accessRole: string, repType: TeamRole | null | undefined): RoleKey {
  if (accessRole === 'owner' || accessRole === 'admin') return accessRole;
  if (repType === 'sales') return 'sales_rep';
  if (repType === 'marketing') return 'marketing_rep';
  return 'member';
}

/**
 * Role pill that opens a dropdown of the roles this viewer may assign. The menu is portaled
 * with fixed positioning so the users table's overflow-hidden card can't clip it; it opens
 * upward when there's no room below and scrolls if taller than the space available.
 */
function RoleMenu({
  value,
  options,
  disabled,
  onChange,
}: {
  value: RoleKey;
  options: RoleKey[];
  disabled?: boolean;
  onChange: (next: RoleKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const place = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 4;
    const margin = 8;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const wanted = options.length * 32 + 8;
    const left = Math.min(r.left, window.innerWidth - 160 - margin);
    if (below >= Math.min(wanted, 160) || below >= above) {
      setPos({ left, top: r.bottom + gap, maxHeight: Math.max(below, 96) });
    } else {
      setPos({ left, bottom: window.innerHeight - r.top + gap, maxHeight: Math.max(above, 96) });
    }
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Page scroll/resize would detach a fixed menu from its pill; scrolling inside the menu is fine.
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);
  const pill = `inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${ROLE_PILL[value]}`;
  if (disabled) return <span className={pill}>{ROLE_LABEL[value]}</span>;
  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) place();
          setOpen((o) => !o);
        }}
        className={`${pill} hover:opacity-90`}
      >
        {ROLE_LABEL[value]}
        <span aria-hidden className="text-[9px] opacity-70">▾</span>
      </button>
      {open && pos && typeof document !== 'undefined'
        ? createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          className="z-[100] w-40 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 shadow-lg py-1"
        >
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={o === value}
                onClick={() => {
                  setOpen(false);
                  if (o !== value) onChange(o);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-gray-100 dark:hover:bg-white/10 ${
                  o === value ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {ROLE_LABEL[o]}
                {o === value ? <span aria-hidden>✓</span> : null}
              </button>
            </li>
          ))}
        </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

interface User {
  id: string;
  email: string;
  role: string;
  is_admin: boolean;
  created_at: string;
  password?: string; // Only present on creation
}

interface OrgInvitation {
  id: string;
  org_id: string;
  invitee_email: string;
  invitation_type: string;
  role: string;
  team_role?: TeamRole | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export default function UsersPanel() {
  const { setLoading: setGlobalLoading } = useLoading();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [isSudoAdmin, setIsSudoAdmin] = useState(false);
  const [currentUserOrgId, setCurrentUserOrgId] = useState<string | null>(null);
  const [showInviteUserForm, setShowInviteUserForm] = useState(false);
  const [inviteUserEmail, setInviteUserEmail] = useState('');
  const [inviteUserRole, setInviteUserRole] = useState<RoleKey>('sales_rep');
  const [repTypes, setRepTypes] = useState<Record<string, TeamRole | null>>({});
  const [roleSaving, setRoleSaving] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<OrgInvitation[]>([]);
  const [addingSystemOwner, setAddingSystemOwner] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });

  useEffect(() => {
    loadCurrentUser();
    loadUsers();
  }, []);

  useEffect(() => {
    if (currentUserOrgId) loadPendingInvitations();
  }, [currentUserOrgId]);

  const loadCurrentUser = async () => {
    try {
      const user = await apiClient.getCurrentUser();
      setCurrentUserRole(user.role || '');
      setIsSudoAdmin(Boolean((user as { is_sudo_admin?: boolean }).is_sudo_admin));
      setCurrentUserOrgId(user.org_id ?? null);
    } catch (err) {
      console.error('Failed to load current user:', err);
    }
  };

  const canModifyUser = (user: User) => {
    if (user.role !== 'owner') return true;
    return isSudoAdmin;
  };

  const loadPendingInvitations = async () => {
    if (!currentUserOrgId) return;
    try {
      const list = await apiClient.listOrgInvitations(currentUserOrgId);
      setPendingInvitations(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load invitations:', err);
      setPendingInvitations([]);
    }
  };

  const loadUsers = async () => {
    setGlobalLoading(true, 'Loading users...');
    try {
      setLoading(true);
      setError(null);
      const [data, team] = await Promise.all([
        apiClient.getUsers(),
        apiClient.getTeamMembers().catch(() => []),
      ]);
      setUsers(data);
      setRepTypes(Object.fromEntries(team.map((m) => [m.user_id, m.team_role])));
    } catch (err: any) {
      let errorMessage = 'Failed to load users';
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          errorMessage = detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const openInviteForm = () => {
    setShowInviteUserForm(true);
    setShowCreateForm(false);
    setEditingUser(null);
    setInviteUserEmail('');
    setInviteUserRole('sales_rep');
    setError(null);
  };

  const roleOptions: RoleKey[] = [
    'sales_rep',
    'marketing_rep',
    'admin',
    ...(currentUserRole === 'owner' ? (['owner'] as RoleKey[]) : []),
  ];

  /** Owner/Admin set the access role (and clear any rep type); reps are member access + rep type. */
  const changeRole = async (user: User, next: RoleKey) => {
    setRoleSaving(user.id);
    setError(null);
    try {
      const access = next === 'owner' || next === 'admin' ? next : 'member';
      if (user.role !== access) await apiClient.updateUser(user.id, { role: access });
      const repType = REP_TYPE[next] ?? null;
      if ((repTypes[user.id] ?? null) !== repType) await apiClient.putTeamMemberRole(user.id, repType);
      await loadUsers();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to change role');
    } finally {
      setRoleSaving(null);
    }
  };

  const handleUpdateUser = async (userId: string) => {
    if (!formData.email.trim()) return;

    const targetUser = users.find((u) => u.id === userId);
    if (targetUser && !canModifyUser(targetUser)) {
      setError('Only the system administrator can modify organization owners.');
      return;
    }

    try {
      const data: any = {
        email: formData.email
      };

      if (formData.password) {
        data.password = formData.password;
      }

      await apiClient.updateUser(userId, data);
      setEditingUser(null);
      setShowCreateForm(false);
      setFormData({ email: '', password: '' });
      await loadUsers();
    } catch (err: any) {
      let errorMessage = 'Failed to update user';
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          errorMessage = detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    }
  };

  const handleInviteUser = async () => {
    if (!currentUserOrgId || !inviteUserEmail.trim()) return;
    if (currentUserRole !== 'owner' && inviteUserRole === 'owner') {
      setError('Only owners can invite as owner');
      return;
    }
    try {
      await apiClient.inviteUserToOrg(currentUserOrgId, {
        email: inviteUserEmail.trim().toLowerCase(),
        role: inviteUserRole === 'owner' || inviteUserRole === 'admin' ? inviteUserRole : 'member',
        team_role: REP_TYPE[inviteUserRole] ?? null,
      });
      setInviteUserEmail('');
      setInviteUserRole('sales_rep');
      setShowInviteUserForm(false);
      setError(null);
      await loadPendingInvitations();
      alert(`Invitation sent to ${inviteUserEmail.trim()}.`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to send invitation');
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (!currentUserOrgId) return;
    try {
      await apiClient.resendOrgInvitation(currentUserOrgId, invitationId);
      await loadPendingInvitations();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to resend');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!currentUserOrgId || !confirm('Cancel this invitation?')) return;
    try {
      await apiClient.cancelOrgInvitation(currentUserOrgId, invitationId);
      await loadPendingInvitations();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to cancel');
    }
  };

  const handleAddSystemOwner = async () => {
    if (!currentUserOrgId) return;
    setAddingSystemOwner(true);
    setError(null);
    try {
      const res = await apiClient.addSystemOwnerToOrg(currentUserOrgId);
      setAddingSystemOwner(false);
      alert((res as { message?: string })?.message || 'System owner added.');
    } catch (err: any) {
      setAddingSystemOwner(false);
      setError(err.response?.data?.detail || 'Failed to add system owner');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (targetUser && !canModifyUser(targetUser)) {
      setError('Only the system administrator can remove organization owners.');
      return;
    }

    if (!confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      await apiClient.deleteUser(userId);
      await loadUsers();
    } catch (err: any) {
      let errorMessage = 'Failed to delete user';
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          errorMessage = detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Team Members</h2>
        <ShinyButton onClick={openInviteForm}>
          + Add Team Member
        </ShinyButton>
      </div>

      {(currentUserRole === 'admin' || currentUserRole === 'owner') && (
        <div className="glass-card p-4 flex items-center justify-between">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Add the system owner to this organization so they can help manage it.
          </p>
          <button
            type="button"
            onClick={handleAddSystemOwner}
            disabled={addingSystemOwner}
            className="px-4 py-2 rounded-md bg-purple-100 border border-purple-300 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/60 dark:text-purple-100 dark:border-purple-500/50 dark:hover:bg-purple-900/70 text-sm font-medium disabled:opacity-50"
          >
            {addingSystemOwner ? 'Adding…' : 'Add System Owner'}
          </button>
        </div>
      )}

      {showInviteUserForm && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Add Team Member</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            They will receive an email to join this organization. New users set their password via the link.
          </p>
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
              <input
                type="email"
                value={inviteUserEmail}
                onChange={(e) => setInviteUserEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-3 py-2 glass-input rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
              <select
                value={inviteUserRole}
                onChange={(e) => setInviteUserRole(e.target.value as RoleKey)}
                className="w-full px-3 py-2 glass-input rounded-md"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleInviteUser} className="glass-button neon-glow px-4 py-2 rounded-md">
                Send Invitation
              </button>
              <button
                type="button"
                onClick={() => { setShowInviteUserForm(false); setInviteUserEmail(''); setError(null); }}
                className="glass-button-secondary px-4 py-2 rounded-md hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingInvitations.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">Pending invitations</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-white/10">
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Expires</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-white/5">
                    <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">{inv.invitee_email}</td>
                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">{ROLE_LABEL[roleKeyOf(inv.role, inv.team_role)]}</td>
                    <td className="py-2 pr-4 text-gray-500 dark:text-gray-500">{new Date(inv.expires_at).toLocaleDateString()}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => handleResendInvitation(inv.id)}
                        className="text-blue-500 hover:text-blue-300 mr-3"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelInvitation(inv.id)}
                        className="text-red-500 hover:text-red-300"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="glass-card p-4 border-red-400/40">
          <p className="text-red-800 dark:text-red-200">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 dark:text-red-300 hover:text-red-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {showCreateForm && editingUser && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Edit User
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 glass-input rounded-md"
                placeholder="user@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password (leave blank to keep current)
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 glass-input rounded-md"
                placeholder="Leave blank to keep current"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleUpdateUser(editingUser)}
                className="glass-button neon-glow px-4 py-2 rounded-md"
              >
                Update
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingUser(null);
                  setFormData({ email: '', password: '' });
                }}
                className="glass-button-secondary px-4 py-2 rounded-md hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/10 dark:bg-white/5">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-transparent divide-y divide-white/10">
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No users yet. Invite a teammate to get started.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <RoleMenu
                      value={roleKeyOf(user.role, repTypes[user.id])}
                      options={roleOptions}
                      disabled={!canModifyUser(user) || roleSaving === user.id}
                      onChange={(next) => void changeRole(user, next)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {canModifyUser(user) ? (
                      <>
                        <button
                          onClick={() => {
                            setEditingUser(user.id);
                            setShowCreateForm(true);
                            setShowInviteUserForm(false);
                            setFormData({ email: user.email, password: '' });
                          }}
                          className="text-blue-500 hover:text-blue-300 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-500 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        System admin only
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

