import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import ShinyButton from './ui/ShinyButton';
import { useLoading } from '@/contexts/LoadingContext';

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
  const [currentUserOrgId, setCurrentUserOrgId] = useState<string | null>(null);
  const [showInviteUserForm, setShowInviteUserForm] = useState(false);
  const [inviteUserEmail, setInviteUserEmail] = useState('');
  const [inviteUserRole, setInviteUserRole] = useState<'member' | 'admin' | 'owner'>('member');
  const [pendingInvitations, setPendingInvitations] = useState<OrgInvitation[]>([]);
  const [addingSystemOwner, setAddingSystemOwner] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'member' as 'owner' | 'admin' | 'member'
  });
  const [newUserCredentials, setNewUserCredentials] = useState<{ email: string; password: string } | null>(null);

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
      setCurrentUserOrgId(user.org_id ?? null);
    } catch (err) {
      console.error('Failed to load current user:', err);
    }
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
      const data = await apiClient.getUsers();
      setUsers(data);
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

  const handleCreateUser = async () => {
    if (!formData.email.trim()) return;

    // Prevent admins from creating owner users
    if (currentUserRole !== 'owner' && formData.role === 'owner') {
      setError('Only owners can assign the owner role');
      return;
    }

    try {
      const data: any = {
        email: formData.email,
        role: formData.role
      };
      
      if (formData.password) {
        data.password = formData.password;
      }

      const newUser = await apiClient.createUser(data);
      setNewUserCredentials({
        email: newUser.email,
        password: newUser.password || formData.password
      });
      setShowCreateForm(false);
      setFormData({ email: '', password: '', role: 'member' });
      await loadUsers();
    } catch (err: any) {
      let errorMessage = 'Failed to create user';
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

  const handleUpdateUser = async (userId: string) => {
    if (!formData.email.trim()) return;

    try {
      const data: any = {
        email: formData.email
      };

      if (formData.password) {
        data.password = formData.password;
      }
      
      // Only allow role updates if current user is owner, or if not trying to set owner role
      if (formData.role) {
        // If current user is not owner and trying to set owner role, prevent it
        if (currentUserRole !== 'owner' && formData.role === 'owner') {
          setError('Only owners can assign the owner role');
          return;
        }
        data.role = formData.role;
      }

      await apiClient.updateUser(userId, data);
      setEditingUser(null);
      setShowCreateForm(false);
      setFormData({ email: '', password: '', role: 'member' });
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
        role: inviteUserRole,
      });
      setInviteUserEmail('');
      setInviteUserRole('member');
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setShowInviteUserForm(true);
              setInviteUserEmail('');
              setInviteUserRole('member');
              setError(null);
            }}
            className="px-4 py-2 rounded-md border border-white/20 bg-white/5 hover:bg-white/10 text-gray-900 dark:text-gray-100 text-sm font-medium transition-colors"
          >
            Invite User
          </button>
          <ShinyButton
            onClick={() => {
              setShowCreateForm(true);
              setEditingUser(null);
              setFormData({ email: '', password: '', role: 'member' });
              setNewUserCredentials(null);
            }}
          >
            + Add Team Member
          </ShinyButton>
        </div>
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
            className="px-4 py-2 rounded-md bg-purple-500/20 border border-purple-400/30 text-sm font-medium hover:bg-purple-500/30 disabled:opacity-50"
          >
            {addingSystemOwner ? 'Adding…' : 'Add System Owner'}
          </button>
        </div>
      )}

      {showInviteUserForm && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Invite User</h3>
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
                onChange={(e) => setInviteUserRole(e.target.value as 'member' | 'admin' | 'owner')}
                className="w-full px-3 py-2 glass-input rounded-md"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                {currentUserRole === 'owner' && <option value="owner">Owner</option>}
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
                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 capitalize">{inv.role}</td>
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

      {newUserCredentials && (
        <div className="glass-card p-4 border-green-400/40">
          <p className="text-green-800 dark:text-green-200 font-medium mb-2">User created successfully!</p>
          <div className="text-sm text-green-700 dark:text-green-200 space-y-1">
            <p><strong>Email:</strong> {newUserCredentials.email}</p>
            <p><strong>Password:</strong> {newUserCredentials.password}</p>
            <p className="text-xs mt-2 digitized-text">Please share these credentials securely with the user.</p>
          </div>
          <button
            onClick={() => setNewUserCredentials(null)}
            className="mt-2 text-sm text-green-600 dark:text-green-300 hover:text-green-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            {editingUser ? 'Edit User' : 'Add Team Member'}
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
                Password {editingUser ? '(leave blank to keep current)' : '(auto-generated if blank)'}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 glass-input rounded-md"
                placeholder={editingUser ? 'Leave blank to keep current' : 'Auto-generated if blank'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as 'owner' | 'admin' | 'member' })}
                className="w-full px-3 py-2 glass-input rounded-md"
                required
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                {currentUserRole === 'owner' && (
                  <option value="owner">Owner</option>
                )}
              </select>
              {currentUserRole !== 'owner' && formData.role === 'owner' && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-300">Only owners can assign the owner role</p>
              )}
            </div>
            <div className="flex space-x-2">
              {editingUser ? (
                <button
                  onClick={() => handleUpdateUser(editingUser)}
                  className="glass-button neon-glow px-4 py-2 rounded-md"
                >
                  Update
                </button>
              ) : (
                <button
                  onClick={handleCreateUser}
                  className="glass-button neon-glow px-4 py-2 rounded-md"
                >
                  Create
                </button>
              )}
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingUser(null);
                  setFormData({ email: '', password: '', role: 'member' });
                  setNewUserCredentials(null);
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
                  No users yet. Add a team member to get started.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize border ${
                      user.role === 'owner' ? 'bg-purple-500/20 text-gray-900 border-purple-400/30' :
                      user.role === 'admin' ? 'bg-blue-500/20 text-gray-900 border-blue-400/30' :
                      'bg-white/10 text-gray-200 border-white/20'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => {
                        setEditingUser(user.id);
                        setShowCreateForm(true);
                        // If current user is not owner and editing user is owner, prevent editing role
                        const userRole = (user.role as 'owner' | 'admin' | 'member') || 'member';
                        // If user is owner and current user is not owner, default to member (can't change owner role)
                        const editableRole = (currentUserRole !== 'owner' && userRole === 'owner') ? 'member' : userRole;
                        setFormData({ email: user.email, password: '', role: editableRole });
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

