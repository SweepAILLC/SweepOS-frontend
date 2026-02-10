import axios, { AxiosInstance } from 'axios';
import Cookies from 'js-cookie';
import { cache, CACHE_KEYS, TERMINAL_CACHE_TTL_MS } from './cache';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
// For cross-origin (e.g. frontend on Vercel, API on Render): set to 'none' so cookies are sent
const COOKIE_SAME_SITE = (process.env.NEXT_PUBLIC_COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax';

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
        if (error.response?.status === 401 || error.response?.status === 403) {
          // Unauthorized/Forbidden - session expired or invalid credentials
          // Clear token and redirect to login gracefully
          Cookies.remove('access_token');
          
          if (typeof window !== 'undefined') {
            const currentPath = window.location.pathname;
            // Don't redirect if we're already on the login page (prevents redirect loops)
            if (currentPath !== '/login') {
              // Suppress console errors for auth failures
              // Redirect immediately without throwing to prevent runtime errors
              setTimeout(() => {
                window.location.href = '/login';
              }, 0);
              // Return a resolved promise with a dummy response to prevent error propagation
              // This prevents runtime errors from showing up in the console
              return Promise.resolve({
                data: null,
                status: 401,
                statusText: 'Unauthorized',
                headers: {},
                config: error.config
              });
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(email: string, password: string, orgId?: string) {
    const payload: any = { email, password };
    if (orgId) {
      payload.org_id = orgId;
    }
    const response = await this.client.post('/auth/login', payload);
    if (response.data.access_token) {
      // Set cookie with proper settings for cross-origin requests
      Cookies.set('access_token', response.data.access_token, { 
        expires: 1, // 1 day
        sameSite: COOKIE_SAME_SITE,
        secure: window.location.protocol === 'https:', // Required when sameSite is 'none'
        path: '/'
      });
      
      // Verify cookie was set (for debugging)
      const cookieValue = Cookies.get('access_token');
      if (!cookieValue) {
        console.warn('Warning: Cookie was not set after login. This may cause authentication issues.');
      }
    }
    return response.data;
  }

  async getUserOrganizations(email: string) {
    const response = await this.client.get('/auth/organizations', {
      params: { email }
    });
    return response.data;
  }

  async switchOrganization(orgId: string) {
    const response = await this.client.post('/auth/switch-organization', { org_id: orgId });
    if (response.data.access_token) {
      Cookies.set('access_token', response.data.access_token, { 
        expires: 1,
        sameSite: COOKIE_SAME_SITE,
        secure: window.location.protocol === 'https:',
        path: '/'
      });
    }
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // Invitation acceptance (public; no auth required for validate)
  async validateInviteToken(token: string) {
    const response = await this.client.get('/auth/invite/validate', { params: { token } });
    return response.data;
  }

  async acceptInvite(body: { token: string; password?: string }) {
    const response = await this.client.post('/auth/invite/accept', body);
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

  // Clients (cached for terminal dashboard to avoid 4x duplicate requests)
  async getClients(lifecycleState?: string, forceRefresh?: boolean) {
    const cacheKey = lifecycleState ? `${CACHE_KEYS.CLIENTS}_${lifecycleState}` : CACHE_KEYS.CLIENTS;
    if (!forceRefresh && !lifecycleState) {
      const cached = cache.get<unknown[]>(cacheKey);
      if (cached != null) return cached;
    }
    const params = lifecycleState ? { lifecycle_state: lifecycleState } : {};
    const response = await this.client.get('/clients', { params });
    const data = response.data;
    if (!lifecycleState) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getClient(id: string) {
    const response = await this.client.get(`/clients/${id}`);
    return response.data;
  }

  async createClient(data: any) {
    const response = await this.client.post('/clients', data);
    cache.delete(CACHE_KEYS.CLIENTS);
    return response.data;
  }

  async updateClient(id: string, data: any) {
    const response = await this.client.patch(`/clients/${id}`, data);
    cache.delete(CACHE_KEYS.CLIENTS);
    return response.data;
  }

  async deleteClient(id: string, deleteMerged: boolean = false) {
    const params = deleteMerged ? { delete_merged: 'true' } : {};
    await this.client.delete(`/clients/${id}`, { params });
    cache.delete(CACHE_KEYS.CLIENTS);
  }

  async getClientPayments(clientId: string, mergedClientIds?: string[]) {
    const mergeKey = mergedClientIds?.length ? [...mergedClientIds].sort().join(',') : '';
    const cacheKey = `client_payments_${clientId}_${mergeKey}`;
    const cached = cache.get<unknown>(cacheKey);
    if (cached != null) return cached;
    const params: any = {};
    if (mergedClientIds && mergedClientIds.length > 1) {
      params.merged_client_ids = mergedClientIds.join(',');
    }
    const response = await this.client.get(`/clients/${clientId}/payments`, { params });
    const data = response.data;
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async createManualPayment(
    clientId: string,
    amount: number,
    paymentDate?: string,
    description?: string,
    paymentMethod?: string,
    receiptUrl?: string
  ) {
    const params: any = { amount };
    if (paymentDate) params.payment_date = paymentDate;
    if (description) params.description = description;
    if (paymentMethod) params.payment_method = paymentMethod;
    if (receiptUrl) params.receipt_url = receiptUrl;
    const response = await this.client.post(`/clients/${clientId}/manual-payment`, null, { params });
    cache.deleteByPrefix(`client_payments_${clientId}_`);
    return response.data;
  }

  async deleteManualPayment(clientId: string, paymentId: string) {
    await this.client.delete(`/clients/${clientId}/manual-payment/${paymentId}`);
    cache.deleteByPrefix(`client_payments_${clientId}_`);
  }

  // Check-ins
  async syncCheckIns() {
    const response = await this.client.post('/clients/check-ins/sync');
    return response.data;
  }

  async getClientCheckIns(clientId: string, limit: number = 50) {
    const response = await this.client.get(`/clients/${clientId}/check-ins`, {
      params: { limit }
    });
    return response.data;
  }

  async getNextCheckIn(clientId: string) {
    const response = await this.client.get(`/clients/${clientId}/check-ins/next`);
    return response.data;
  }

  async updateCheckIn(checkInId: string, completed?: boolean, cancelled?: boolean) {
    const response = await this.client.patch(`/clients/check-ins/${checkInId}`, {
      completed,
      cancelled
    });
    return response.data;
  }

  async deleteCheckIn(checkInId: string) {
    const response = await this.client.delete(`/clients/check-ins/${checkInId}`);
    return response.data;
  }

  async createManualCheckIn(clientId: string, title: string, startTime: string, endTime?: string) {
    const response = await this.client.post(`/clients/${clientId}/check-ins`, {
      title,
      start_time: startTime,
      end_time: endTime
    });
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

  async connectBrevoWithApiKey(apiKey: string) {
    const response = await this.client.post('/oauth/brevo/connect-direct', {
      api_key: apiKey
    });
    return response.data;
  }

  // Cal.com
  async connectCalComWithApiKey(apiKey: string) {
    const response = await this.client.post('/oauth/calcom/connect-direct', {
      api_key: apiKey
    });
    return response.data;
  }

  async getCalComStatus() {
    const response = await this.client.get('/integrations/calcom/status');
    return response.data;
  }

  async disconnectCalCom() {
    await this.client.delete('/oauth/calcom/disconnect');
  }

  async getCalComBookings(limit: number = 50, offset: number = 0) {
    // Backend accepts both 'limit'/'offset' and 'take'/'skip' for backward compatibility
    // Cal.com API uses 'take'/'skip', but we keep 'limit'/'offset' in frontend for consistency
    const response = await this.client.get('/integrations/calcom/bookings', {
      params: { limit, offset }
    });
    return response.data;
  }

  async getCalComEventTypes() {
    const response = await this.client.get('/integrations/calcom/event-types');
    return response.data;
  }

  async getCalComBookingDetails(bookingId: number) {
    const response = await this.client.get(`/integrations/calcom/booking/${bookingId}`);
    return response.data;
  }

  // Calendly
  async connectCalendlyWithApiKey(apiKey: string) {
    const response = await this.client.post('/oauth/calendly/connect-direct', {
      api_key: apiKey
    });
    return response.data;
  }

  async getCalendlyStatus() {
    const response = await this.client.get('/integrations/calendly/status');
    return response.data;
  }

  async disconnectCalendly() {
    await this.client.delete('/oauth/calendly/disconnect');
  }

  async getCalendlyScheduledEvents(params?: {
    count?: number;
    page_token?: string;
    sort?: string;
    user?: string;
    invitee_email?: string;
    status?: string;
    min_start_time?: string;
    max_start_time?: string;
  }) {
    const response = await this.client.get('/integrations/calendly/scheduled-events', {
      params: params || {}
    });
    return response.data;
  }

  async getCalendarUpcomingSummary() {
    const response = await this.client.get('/integrations/calendar/upcoming-summary');
    return response.data;
  }

  async getCalendlyEventTypes(params?: {
    count?: number;
    page_token?: string;
    sort?: string;
    user?: string;
    active?: boolean;
  }) {
    const response = await this.client.get('/integrations/calendly/event-types', {
      params: params || {}
    });
    return response.data;
  }

  async getCalendlyEventDetails(eventUri: string) {
    // Encode the URI for the path parameter
    const encodedUri = encodeURIComponent(eventUri);
    const response = await this.client.get(`/integrations/calendly/event/${encodedUri}`);
    return response.data;
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
    const cached = cache.get<unknown>(CACHE_KEYS.BREVO_STATUS);
    if (cached != null) return cached;
    const response = await this.client.get('/integrations/brevo/status');
    const data = response.data;
    cache.set(CACHE_KEYS.BREVO_STATUS, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  // Brevo Contacts
  async getBrevoContacts(limit: number = 50, offset: number = 0) {
    const response = await this.client.get('/integrations/brevo/contacts', {
      params: { limit, offset }
    });
    return response.data;
  }

  async getBrevoContact(contactId: number) {
    const response = await this.client.get(`/integrations/brevo/contacts/${contactId}`);
    return response.data;
  }

  async createBrevoContact(data: { email: string; attributes?: Record<string, any>; listIds?: number[]; updateEnabled?: boolean }) {
    const response = await this.client.post('/integrations/brevo/contacts', data);
    return response.data;
  }

  async updateBrevoContact(identifier: string, data: { attributes?: Record<string, any>; listIds?: number[]; unlinkListIds?: number[] }, identifierType?: string) {
    const params = identifierType ? { identifierType } : {};
    const response = await this.client.put(`/integrations/brevo/contacts/${encodeURIComponent(identifier)}`, data, { params });
    return response.data;
  }

  async getBrevoContactByEmail(email: string) {
    try {
      // Use the dedicated endpoint for getting contact by email
      const response = await this.client.get(`/integrations/brevo/contacts/by-email/${encodeURIComponent(email)}`);
      return response.data;
    } catch (error: any) {
      // 404 means contact doesn't exist, which is fine
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async deleteBrevoContact(contactId: number) {
    const response = await this.client.delete(`/integrations/brevo/contacts/${contactId}`);
    return response.data;
  }

  async bulkDeleteBrevoContacts(contactIds: number[]) {
    const response = await this.client.post('/integrations/brevo/contacts/bulk-delete', { contactIds });
    return response.data;
  }

  async createClientsFromBrevoContacts(contactIds: number[]) {
    const response = await this.client.post('/integrations/brevo/contacts/create-clients', { contactIds });
    return response.data;
  }

  // Brevo Lists
  async getBrevoLists(limit: number = 50, offset: number = 0) {
    const response = await this.client.get('/integrations/brevo/lists', {
      params: { limit, offset }
    });
    return response.data;
  }

  async createBrevoList(data: { name: string; folderId?: number }) {
    const response = await this.client.post('/integrations/brevo/lists', data);
    return response.data;
  }

  async deleteBrevoList(listId: number) {
    const response = await this.client.delete(`/integrations/brevo/lists/${listId}`);
    return response.data;
  }

  async getBrevoListContacts(listId: number, limit: number = 50, offset: number = 0) {
    const response = await this.client.get(`/integrations/brevo/lists/${listId}/contacts`, {
      params: { limit, offset }
    });
    return response.data;
  }

  async moveBrevoContacts(data: { contactIds: number[]; sourceListId: number; destinationListId: number }) {
    const response = await this.client.post('/integrations/brevo/contacts/move', data);
    return response.data;
  }

  async addBrevoContactsToList(data: { contactIds: number[]; listId: number }) {
    const response = await this.client.post('/integrations/brevo/contacts/add-to-list', data);
    return response.data;
  }

  async removeBrevoContactsFromList(data: { contactIds: number[]; listId: number }) {
    const response = await this.client.post('/integrations/brevo/contacts/remove-from-list', data);
    return response.data;
  }

  // Brevo Transactional Emails
  async sendBrevoTransactionalEmail(data: {
    contactIds?: number[];
    listId?: number;
    recipients?: Array<{ email: string; name?: string }>;
    sender: { email: string; name: string };
    subject: string;
    htmlContent?: string;
    textContent?: string;
    templateId?: number;
    params?: Record<string, any>;
    tags?: string[];
    replyTo?: { email: string; name?: string };
  }) {
    const response = await this.client.post('/integrations/brevo/transactional/send', data);
    return response.data;
  }

  async getBrevoSenders() {
    const response = await this.client.get('/integrations/brevo/senders');
    return response.data;
  }

  async getBrevoAnalytics(period: string = '30days') {
    const response = await this.client.get('/integrations/brevo/analytics', {
      params: { period }
    });
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

  async getStripePayments(
    status?: string,
    range?: number,
    page?: number,
    pageSize?: number,
    useTreasury?: boolean
  ) {
    const cacheKey = `stripe_payments_${status ?? 'all'}_${range ?? 'all'}_${page ?? 1}_${pageSize ?? 100}_${useTreasury ?? false}`;
    const cached = cache.get<unknown>(cacheKey);
    if (cached != null) return cached;
    const params: any = {};
    if (status) params.status = status;
    if (range !== undefined) params.range = range; // undefined means all time
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    if (useTreasury !== undefined) params.use_treasury = useTreasury;
    const response = await this.client.get('/integrations/stripe/payments', { params });
    const data = response.data;
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async deleteStripePayment(paymentId: string, useTreasury: boolean = true) {
    const response = await this.client.delete(`/integrations/stripe/payments/${paymentId}`, {
      params: { use_treasury: useTreasury }
    });
    return response.data;
  }

  async getStripeFailedPayments(page?: number, pageSize?: number, excludeResolved?: boolean) {
    const cacheKey = `${CACHE_KEYS.STRIPE_FAILED_PAYMENTS}_${page ?? 1}_${pageSize ?? 10}_${excludeResolved ?? false}`;
    const cached = cache.get<unknown>(cacheKey);
    if (cached != null) return cached;
    const params: any = {};
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    if (excludeResolved !== undefined) params.exclude_resolved = excludeResolved;
    const response = await this.client.get('/integrations/stripe/failed-payments', { params });
    const data = response.data;
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async findDuplicatePayments() {
    const response = await this.client.get('/integrations/stripe/payments/duplicates');
    return response.data;
  }

  async mergeDuplicatePayments(paymentIds: string[], autoReconcile: boolean = true) {
    const response = await this.client.post('/integrations/stripe/payments/merge-duplicates', {
      payment_ids: paymentIds,
      auto_reconcile: autoReconcile
    });
    return response.data;
  }

  async assignPaymentToClient(paymentId: string, clientId: string, autoReconcile: boolean = true) {
    const response = await this.client.patch(`/integrations/stripe/payments/${paymentId}/assign`, null, {
      params: {
        client_id: clientId,
        auto_reconcile: autoReconcile
      }
    });
    return response.data;
  }

  async resolveFailedPaymentAlert(paymentId: string) {
    const response = await this.client.post(`/integrations/stripe/failed-payments/${paymentId}/resolve`);
    return response.data;
  }

  // Funnels (cached for terminal - LeadsBySource and BookingRateByFunnel both call this)
  async getFunnels(clientId?: string) {
    const cacheKey = clientId ? `${CACHE_KEYS.FUNNELS}_${clientId}` : CACHE_KEYS.FUNNELS;
    if (!clientId) {
      const cached = cache.get<unknown[]>(cacheKey);
      if (cached != null) return cached;
    }
    const params = clientId ? { client_id: clientId } : {};
    const response = await this.client.get('/funnels', { params });
    const data = response.data;
    if (!clientId) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
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
    const cacheKey = `funnel_analytics_${funnelId}_${range ?? 30}`;
    const cached = cache.get<unknown>(cacheKey);
    if (cached != null) return cached;
    const params = range ? { range } : {};
    const response = await this.client.get(`/funnels/${funnelId}/analytics`, { params });
    const data = response.data;
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
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

  async updateOrganization(orgId: string, data: { name?: string; max_user_seats?: number | null }) {
    const response = await this.client.patch(`/admin/organizations/${orgId}`, data);
    return response.data;
  }

  async deleteOrganization(orgId: string) {
    const response = await this.client.delete(`/admin/organizations/${orgId}`);
    return response.data;
  }

  // Admin: Invite organization (email-based onboarding)
  async inviteOrganization(data: { name: string; admin_email: string }) {
    const response = await this.client.post('/admin/organizations/invite', data);
    return response.data;
  }

  async listAdminInvitations() {
    const response = await this.client.get('/admin/organizations/invitations');
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

  // Organization-scoped invitations (org admin/owner)
  async inviteUserToOrg(orgId: string, data: { email: string; role?: string }) {
    const response = await this.client.post(`/organizations/${orgId}/invite-user`, data);
    return response.data;
  }

  async listOrgInvitations(orgId: string) {
    const response = await this.client.get(`/organizations/${orgId}/invitations`);
    return response.data;
  }

  async resendOrgInvitation(orgId: string, invitationId: string) {
    const response = await this.client.post(`/organizations/${orgId}/invitations/${invitationId}/resend`);
    return response.data;
  }

  async cancelOrgInvitation(orgId: string, invitationId: string) {
    await this.client.delete(`/organizations/${orgId}/invitations/${invitationId}`);
  }

  async addSystemOwnerToOrg(orgId: string) {
    const response = await this.client.post(`/organizations/${orgId}/add-system-owner`);
    return response.data;
  }

  // User Management
  async getUsers() {
    const response = await this.client.get('/users');
    return response.data;
  }

  async createUser(data: { email: string; password?: string; role?: string }) {
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

