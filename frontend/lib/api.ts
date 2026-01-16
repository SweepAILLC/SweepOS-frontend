import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout to prevent hanging
    });

    // Add request interceptor to attach JWT token
    this.client.interceptors.request.use((config) => {
      const token = Cookies.get('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Unauthorized - clear token and redirect to login
          Cookies.remove('access_token');
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    if (response.data.access_token) {
      Cookies.set('access_token', response.data.access_token, { expires: 1 });
    }
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // User Settings
  async getUserSettings() {
    const response = await this.client.get('/auth/me/settings');
    return response.data;
  }

  async updateUserSettings(data: {
    email?: string;
    current_password?: string;
    new_password?: string;
    data_sharing_enabled?: boolean;
    analytics_enabled?: boolean;
  }) {
    const response = await this.client.put('/auth/me/settings', data);
    return response.data;
  }

  // Clients
  async getClients(lifecycleState?: string) {
    const params = lifecycleState ? { lifecycle_state: lifecycleState } : {};
    const response = await this.client.get('/clients', { params });
    return response.data;
  }

  async getClient(id: string) {
    const response = await this.client.get(`/clients/${id}`);
    return response.data;
  }

  async createClient(data: any) {
    const response = await this.client.post('/clients', data);
    return response.data;
  }

  async updateClient(id: string, data: any) {
    const response = await this.client.patch(`/clients/${id}`, data);
    return response.data;
  }

  async deleteClient(id: string, deleteMerged: boolean = false) {
    const params = deleteMerged ? { delete_merged: 'true' } : {};
    await this.client.delete(`/clients/${id}`, { params });
  }

  async getClientPayments(clientId: string, mergedClientIds?: string[]) {
    const params: any = {};
    if (mergedClientIds && mergedClientIds.length > 1) {
      params.merged_client_ids = mergedClientIds.join(',');
    }
    const response = await this.client.get(`/clients/${clientId}/payments`, { params });
    return response.data;
  }

  // OAuth
  async startStripeOAuth() {
    const response = await this.client.post('/oauth/stripe/start');
    return response.data;
  }

  async disconnectStripe() {
    const response = await this.client.delete('/oauth/stripe/disconnect');
    return response.data;
  }

  async verifyStripeConnection() {
    const response = await this.client.get('/oauth/stripe/verify');
    return response.data;
  }

  async completeStripeOAuthManual(code: string, orgId: string) {
    // Initial connection includes historical sync which can take a long time
    const response = await this.client.post(`/oauth/stripe/callback/manual?code=${code}&org_id=${orgId}`, null, {
      timeout: 300000, // 5 minutes for initial sync
    });
    return response.data;
  }

  async connectStripeDirect(apiKey: string) {
    // Initial connection includes historical sync which can take a long time
    const response = await this.client.post('/oauth/stripe/connect-direct', {
      api_key: apiKey
    }, {
      timeout: 300000, // 5 minutes for initial sync
    });
    return response.data;
  }

  async syncStripeData(forceFull: boolean = false) {
    // Sync operations can take a long time, especially for full historical syncs
    // Use a longer timeout (5 minutes) for sync operations
    const response = await this.client.post('/integrations/stripe/sync', null, {
      params: { force_full: forceFull },
      timeout: 300000, // 5 minutes for sync operations
    });
    return response.data;
  }

  async reconcileStripeData() {
    // Reconciliation can also take time
    const response = await this.client.post('/integrations/stripe/reconcile', null, {
      timeout: 120000, // 2 minutes for reconciliation
    });
    return response.data;
  }

  async startBrevoOAuth() {
    const response = await this.client.post('/oauth/brevo/start');
    return response.data;
  }

  async disconnectBrevo() {
    await this.client.delete('/oauth/brevo/disconnect');
  }

  // Integrations
  async getStripeStatus() {
    const response = await this.client.get('/integrations/stripe/status');
    return response.data;
  }

  async getStripeSummary(range?: number) {
    const params = range ? { range } : {};
    console.log('🌐 API: Fetching /integrations/stripe/summary with params:', params);
    const response = await this.client.get('/integrations/stripe/summary', { params });
    console.log('🌐 API: Response received:', {
      status: response.status,
      dataKeys: Object.keys(response.data || {}),
      hasData: !!response.data
    });
    return response.data;
  }

  async getStripeCustomers(limit?: number) {
    const params = limit ? { limit } : {};
    const response = await this.client.get('/integrations/stripe/customers', { params });
    return response.data;
  }

  async getStripeSubscriptions(status?: string, limit?: number) {
    const params: any = {};
    if (status) params.status = status;
    if (limit) params.limit = limit;
    const response = await this.client.get('/integrations/stripe/subscriptions', { params });
    return response.data;
  }

  async getStripeInvoices(limit?: number) {
    const params = limit ? { limit } : {};
    const response = await this.client.get('/integrations/stripe/invoices', { params });
    return response.data;
  }

  async getBrevoStatus() {
    const response = await this.client.get('/integrations/brevo/status');
    return response.data;
  }

  // Stripe Analytics
  async getStripeRevenueTimeline(range?: number, groupBy?: 'day' | 'week') {
    const params: any = {};
    if (range) params.range = range;
    if (groupBy) params.group_by = groupBy;
    const response = await this.client.get('/integrations/stripe/revenue-timeline', { params });
    return response.data;
  }

  async getStripeChurn(months?: number) {
    const params = months ? { months } : {};
    const response = await this.client.get('/integrations/stripe/churn', { params });
    return response.data;
  }

  async getStripeMRRTrend(range?: number, groupBy?: 'day' | 'week' | 'month') {
    const params: any = {};
    if (range) params.range = range;
    if (groupBy) params.group_by = groupBy;
    const response = await this.client.get('/integrations/stripe/mrr-trend', { params });
    return response.data;
  }

  async getStripePayments(status?: string, range?: number, page?: number, pageSize?: number) {
    const params: any = {};
    if (status) params.status = status;
    if (range !== undefined) params.range = range; // undefined means all time
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    const response = await this.client.get('/integrations/stripe/payments', { params });
    return response.data;
  }

  async getStripeFailedPayments(page?: number, pageSize?: number) {
    const params: any = {};
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    const response = await this.client.get('/integrations/stripe/failed-payments', { params });
    return response.data;
  }

  // Funnels
  async getFunnels(clientId?: string) {
    const params = clientId ? { client_id: clientId } : {};
    const response = await this.client.get('/funnels', { params });
    return response.data;
  }

  async getFunnel(funnelId: string) {
    const response = await this.client.get(`/funnels/${funnelId}`);
    return response.data;
  }

  async createFunnel(data: any) {
    const response = await this.client.post('/funnels', data);
    return response.data;
  }

  async updateFunnel(funnelId: string, data: any) {
    const response = await this.client.patch(`/funnels/${funnelId}`, data);
    return response.data;
  }

  async deleteFunnel(funnelId: string) {
    const response = await this.client.delete(`/funnels/${funnelId}`);
    return response.data;
  }

  // Funnel Steps
  async createFunnelStep(funnelId: string, data: any) {
    const response = await this.client.post(`/funnels/${funnelId}/steps`, data);
    return response.data;
  }

  async updateFunnelStep(funnelId: string, stepId: string, data: any) {
    const response = await this.client.patch(`/funnels/${funnelId}/steps/${stepId}`, data);
    return response.data;
  }

  async deleteFunnelStep(funnelId: string, stepId: string) {
    const response = await this.client.delete(`/funnels/${funnelId}/steps/${stepId}`);
    return response.data;
  }

  async reorderFunnelSteps(funnelId: string, stepOrders: Array<{ step_id: string; step_order: number }>) {
    const response = await this.client.post(`/funnels/${funnelId}/steps/reorder`, stepOrders);
    return response.data;
  }

  // Funnel Analytics
  async getFunnelHealth(funnelId: string) {
    const response = await this.client.get(`/funnels/${funnelId}/health`);
    return response.data;
  }

  async getFunnelAnalytics(funnelId: string, range?: number) {
    const params = range ? { range } : {};
    const response = await this.client.get(`/funnels/${funnelId}/analytics`, { params });
    return response.data;
  }

  // Event Explorer
  async exploreEvents(filters?: {
    funnel_id?: string;
    event_name?: string;
    visitor_id?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = filters || {};
    const response = await this.client.get('/funnels/events', { params });
    return response.data;
  }

  // Event Ingestion (for client-side tracking)
  async trackEvent(data: any) {
    const response = await this.client.post('/funnels/events', data);
    return response.data;
  }

  // Admin APIs
  async getOrganizations() {
    const response = await this.client.get('/admin/organizations');
    return response.data;
  }

  async getOrganization(orgId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}`);
    return response.data;
  }

  async createOrganization(data: { name: string }) {
    const response = await this.client.post('/admin/organizations', data);
    return response.data;
  }

  async updateOrganization(orgId: string, data: { name?: string }) {
    const response = await this.client.patch(`/admin/organizations/${orgId}`, data);
    return response.data;
  }

  async deleteOrganization(orgId: string) {
    const response = await this.client.delete(`/admin/organizations/${orgId}`);
    return response.data;
  }

  async getGlobalHealth() {
    const response = await this.client.get('/admin/health');
    return response.data;
  }

  async getGlobalSettings() {
    const response = await this.client.get('/admin/settings');
    return response.data;
  }

  async getOrganizationDashboard(orgId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}/dashboard`);
    return response.data;
  }

  // Admin: Organization Funnel Management
  async getOrganizationFunnels(orgId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}/funnels`);
    return response.data;
  }

  async createOrganizationFunnel(orgId: string, data: any) {
    const response = await this.client.post(`/admin/organizations/${orgId}/funnels`, data);
    return response.data;
  }

  async getOrganizationFunnel(orgId: string, funnelId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}/funnels/${funnelId}`);
    return response.data;
  }

  async updateOrganizationFunnel(orgId: string, funnelId: string, data: any) {
    const response = await this.client.patch(`/admin/organizations/${orgId}/funnels/${funnelId}`, data);
    return response.data;
  }

  async deleteOrganizationFunnel(orgId: string, funnelId: string) {
    const response = await this.client.delete(`/admin/organizations/${orgId}/funnels/${funnelId}`);
    return response.data;
  }

  // Admin: Organization Tab Permissions
  async getOrganizationTabPermissions(orgId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}/tabs`);
    return response.data;
  }

  async createOrganizationTabPermission(orgId: string, data: any) {
    const response = await this.client.post(`/admin/organizations/${orgId}/tabs`, data);
    return response.data;
  }

  async updateOrganizationTabPermission(orgId: string, tabName: string, data: any) {
    const response = await this.client.patch(`/admin/organizations/${orgId}/tabs/${tabName}`, data);
    return response.data;
  }

  // User Management
  async getUsers() {
    const response = await this.client.get('/users');
    return response.data;
  }

  async createUser(data: { email: string; password?: string }) {
    const response = await this.client.post('/users', data);
    return response.data;
  }

  async getUser(userId: string) {
    const response = await this.client.get(`/users/${userId}`);
    return response.data;
  }

  async updateUser(userId: string, data: any) {
    const response = await this.client.patch(`/users/${userId}`, data);
    return response.data;
  }

  async deleteUser(userId: string) {
    const response = await this.client.delete(`/users/${userId}`);
    return response.data;
  }

  // Tab Permissions
  async getMyTabPermissions() {
    const response = await this.client.get('/users/tabs/access');
    return response.data;
  }

  async checkTabAccess(tabName: string) {
    const response = await this.client.get(`/users/tabs/${tabName}/access`);
    return response.data;
  }

  async getUserTabPermissions(userId: string) {
    const response = await this.client.get(`/users/${userId}/tabs`);
    return response.data;
  }

  async createUserTabPermission(userId: string, data: any) {
    const response = await this.client.post(`/users/${userId}/tabs`, data);
    return response.data;
  }

  async updateUserTabPermission(userId: string, tabName: string, data: any) {
    const response = await this.client.patch(`/users/${userId}/tabs/${tabName}`, data);
    return response.data;
  }

  async deleteUserTabPermission(userId: string, tabName: string) {
    const response = await this.client.delete(`/users/${userId}/tabs/${tabName}`);
    return response.data;
  }
}

export const apiClient = new ApiClient();

