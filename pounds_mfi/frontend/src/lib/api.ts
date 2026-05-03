import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1`
  : '/api/v1';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use((config) => {
      const token = Cookies.get('access_token') || localStorage.getItem('access_token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.client.interceptors.response.use(
      (res) => res,
      async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && !original._retry) {
          original._retry = true;
          try {
            const refreshToken = Cookies.get('refresh_token') || localStorage.getItem('refresh_token');
            if (refreshToken) {
              const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
              const { accessToken } = data.data;
              Cookies.set('access_token', accessToken, { secure: true, sameSite: 'strict' });
              localStorage.setItem('access_token', accessToken);
              original.headers.Authorization = `Bearer ${accessToken}`;
              return this.client(original);
            }
          } catch {
            this.clearTokens();
            if (typeof window !== 'undefined') window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      },
    );
  }

  setTokens(accessToken: string, refreshToken: string) {
    Cookies.set('access_token', accessToken, { secure: true, sameSite: 'strict', expires: 1 });
    Cookies.set('refresh_token', refreshToken, { secure: true, sameSite: 'strict', expires: 7 });
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }

  clearTokens() {
    Cookies.remove('access_token');
    Cookies.remove('refresh_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.get<{ data: T }>(url, config);
    return res.data.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.post<{ data: T }>(url, data, config);
    return res.data.data;
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.patch<{ data: T }>(url, data, config);
    return res.data.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.delete<{ data: T }>(url, config);
    return res.data.data;
  }

  async upload<T>(url: string, formData: FormData): Promise<T> {
    const res = await this.client.post<{ data: T }>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  }
}

export const api = new ApiClient();

// ─── Auth ─────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: any; accessToken: string; refreshToken: string }>('/auth/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// ─── Users ────────────────────────────────────
export const usersApi = {
  list: (params?: any) => api.get<any>('/users', { params }),
  get: (id: string) => api.get<any>(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/users/${id}/status`, { status }),
  updateMe: (data: any) => api.patch('/users/me', data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// ─── Loans ────────────────────────────────────
export const loansApi = {
  list: (params?: any) => api.get<any>('/loans', { params }),
  get: (id: string) => api.get<any>(`/loans/${id}`),
  create: (data: any) => api.post('/loans', data),
  submit: (id: string) => api.patch(`/loans/${id}/submit`),
  approve: (id: string) => api.patch(`/loans/${id}/approve`),
  reject: (id: string, reason: string) => api.patch(`/loans/${id}/reject`, { reason }),
  recordRepayment: (id: string, data: any) => api.post(`/loans/${id}/repayments`, data),
  lock: (id: string) => api.post(`/loans/${id}/lock`),
  unlock: (id: string) => api.post(`/loans/${id}/unlock`),
  packages: () => api.get<any>('/loans/packages'),
  createPackage: (data: any) => api.post('/loans/packages', data),
  updatePackage: (id: string, data: any) => api.patch(`/loans/packages/${id}`, data),
};

// ─── KYC ──────────────────────────────────────
export const kycApi = {
  list: (params?: any) => api.get<any>('/kyc', { params }),
  get: (id: string) => api.get<any>(`/kyc/${id}`),
  create: (data: any) => api.post('/kyc', data),
  update: (id: string, data: any) => api.patch(`/kyc/${id}`, data),
  createPublic: (data: any) => api.post('/kyc/public', data),
  updatePublic: (id: string, data: any) => api.patch(`/kyc/public/${id}`, data),
  submitPublic: (id: string) => api.post(`/kyc/public/${id}/submit`),
  uploadDocument: (id: string, file: File, documentType: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentType', documentType);
    return api.upload(`/kyc/${id}/documents`, fd);
  },
  submit: (id: string) => api.post(`/kyc/${id}/submit`),
  approve: (id: string) => api.patch(`/kyc/${id}/approve`),
  reject: (id: string, notes: string) => api.patch(`/kyc/${id}/reject`, { notes }),
  pdfUrl: (id: string) => `${BASE_URL}/kyc/${id}/pdf`,
};

// ─── Receipts ─────────────────────────────────
export const receiptsApi = {
  list: (params?: any) => api.get<any>('/receipts', { params }),
  get: (id: string) => api.get<any>(`/receipts/${id}`),
  upload: (file: File, data: any) => {
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(data).forEach(([k, v]) => fd.append(k, v as string));
    return api.upload('/receipts/upload', fd);
  },
  submitText: (data: any) => api.post('/receipts/text', data),
  confirmOcr: (id: string, data: any) => api.patch(`/receipts/${id}/confirm-ocr`, data),
  verify: (id: string) => api.patch(`/receipts/${id}/verify`),
  reject: (id: string, reason: string) => api.patch(`/receipts/${id}/reject`, { reason }),
};

// ─── Dashboard ────────────────────────────────
export const dashboardApi = {
  kpis: () => api.get<any>('/dashboard/kpis'),
  trend: (months?: number) => api.get<any>('/dashboard/trend', { params: { months } }),
  loanBreakdown: () => api.get<any>('/dashboard/loan-breakdown'),
  activity: () => api.get<any>('/dashboard/activity'),
};

// ─── Notifications ────────────────────────────
export const notificationsApi = {
  list: (params?: any) => api.get<any>('/notifications', { params }),
  unreadCount: () => api.get<any>('/notifications/unread-count'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

// ─── Settings ─────────────────────────────────
export const settingsApi = {
  branding: () => api.get<any>('/settings/branding'),
  public: () => api.get<any>('/settings/public'),
  getAll: () => api.get<any>('/settings'),
  set: (settings: Record<string, string>) => api.post('/settings', settings),
};

// ─── Disbursements ────────────────────────────
export const disbursementsApi = {
  disburse: (loanId: string, data: any, file: File) => {
    const fd = new FormData();
    fd.append('proof', file);
    Object.entries(data).forEach(([k, v]) => fd.append(k, v as string));
    return api.upload(`/disbursements/loans/${loanId}`, fd);
  },
  findByLoan: (loanId: string) => api.get<any>(`/disbursements/loans/${loanId}`),
};

// ─── Backups ──────────────────────────────────
export const backupsApi = {
  list: () => api.get<any>('/backups'),
  run: () => api.post('/backups/run'),
};
