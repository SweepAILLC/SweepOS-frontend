import { useState } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import Navbar from '@/components/Navbar';

export default function NewFunnelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    client_id: '',
    slug: '',
    domain: '',
    env: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('Funnel name is required');
      return;
    }

    try {
      setLoading(true);
      const payload: any = {
        name: formData.name,
      };
      
      if (formData.client_id) payload.client_id = formData.client_id;
      if (formData.slug) payload.slug = formData.slug;
      if (formData.domain) payload.domain = formData.domain;
      if (formData.env) payload.env = formData.env;

      const funnel = await apiClient.createFunnel(payload);
      router.push(`/funnels/${funnel.id}`);
    } catch (err: any) {
      alert('Failed to create funnel: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
        <Navbar activeTab="funnels" onTabChange={(tab) => router.push(`/?tab=${tab}`)} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back to Funnels
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Create New Funnel</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Funnel Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="e.g., Onboarding Funnel, Sales Funnel"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Domain (optional)
            </label>
            <input
              type="text"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              placeholder="e.g., example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-xs text-gray-500">
              Used to automatically match events to this funnel based on URL
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug (optional)
            </label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              placeholder="e.g., onboarding"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="mt-1 text-xs text-gray-500">
              Unique identifier for URL matching
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Environment (optional)
            </label>
            <select
              value={formData.env}
              onChange={(e) => setFormData({ ...formData, env: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Select environment</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Funnel'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

