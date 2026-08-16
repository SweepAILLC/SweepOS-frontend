import axios from 'axios';
import Cookies from 'js-cookie';
import type { OwnerOrgNotice } from '@/types/admin';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

function authHeaders() {
  const token = Cookies.get('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listPortalNotices(): Promise<
  Array<{ id: string; title: string; body: string; created_at?: string; read?: boolean }>
> {
  const response = await axios.get(`${API_BASE_URL}/portal/notices`, { headers: authHeaders() });
  return Array.isArray(response.data) ? response.data : [];
}

export async function markPortalNoticeRead(noticeId: string): Promise<void> {
  await axios.post(`${API_BASE_URL}/portal/notices/${noticeId}/read`, {}, { headers: authHeaders() });
}

export async function listOwnerNotices(): Promise<OwnerOrgNotice[]> {
  const response = await axios.get(`${API_BASE_URL}/admin/notices`, { headers: authHeaders() });
  return Array.isArray(response.data) ? response.data : [];
}

export async function sendOwnerNotice(data: {
  title: string;
  body: string;
  org_ids?: string[];
}): Promise<OwnerOrgNotice[]> {
  const response = await axios.post(`${API_BASE_URL}/admin/notices`, data, { headers: authHeaders() });
  return Array.isArray(response.data) ? response.data : [];
}

export async function pingActivityHeartbeat(): Promise<void> {
  try {
    await axios.post(`${API_BASE_URL}/users/me/activity-heartbeat`, {}, { headers: authHeaders() });
  } catch {
    // Non-blocking
  }
}
