import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role: string;
  is_admin: boolean;
  created_at: string;
  password?: string; // Only present on creation
}

export default function UsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
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

  const loadCurrentUser = async () => {
    try {
      const user = await apiClient.getCurrentUser();
      setCurrentUserRole(user.role || '');
    } catch (err) {
      console.error('Failed to load current user:', err);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load users');
    } finally {
      setLoading(false);
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
      setError(err.response?.data?.detail || err.message || 'Failed to create user');
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
      setError(err.response?.data?.detail || err.message || 'Failed to update user');
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
      setError(err.response?.data?.detail || err.message || 'Failed to delete user');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Team Members</h2>
        <button
          onClick={() => {
            setShowCreateForm(true);
            setEditingUser(null);
            setFormData({ email: '', password: '', role: 'member' });
            setNewUserCredentials(null);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Add Team Member
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {newUserCredentials && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium mb-2">User created successfully!</p>
          <div className="text-sm text-green-700 space-y-1">
            <p><strong>Email:</strong> {newUserCredentials.email}</p>
            <p><strong>Password:</strong> {newUserCredentials.password}</p>
            <p className="text-xs mt-2">Please share these credentials securely with the user.</p>
          </div>
          <button
            onClick={() => setNewUserCredentials(null)}
            className="mt-2 text-sm text-green-600 hover:text-green-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {showCreateForm && (
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {editingUser ? 'Edit User' : 'Add Team Member'}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="user@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password {editingUser ? '(leave blank to keep current)' : '(auto-generated if blank)'}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder={editingUser ? 'Leave blank to keep current' : 'Auto-generated if blank'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as 'owner' | 'admin' | 'member' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                {currentUserRole === 'owner' && (
                  <option value="owner">Owner</option>
                )}
              </select>
              {currentUserRole !== 'owner' && formData.role === 'owner' && (
                <p className="mt-1 text-sm text-red-600">Only owners can assign the owner role</p>
              )}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={editingUser ? () => handleUpdateUser(editingUser) : handleCreateUser}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {editingUser ? 'Update' : 'Create'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingUser(null);
                  setFormData({ email: '', password: '', role: 'member' });
                  setNewUserCredentials(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  No users yet. Add a team member to get started.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${
                      user.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                      user.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
                      className="text-blue-600 hover:text-blue-900 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-red-600 hover:text-red-900"
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

