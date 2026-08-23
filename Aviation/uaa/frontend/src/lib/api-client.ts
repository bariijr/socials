const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3011';

export interface Leg {
  id: string;
  tripNo: string;
  icao: string;
  tail: string | null;
  country: string | null;
  arrDate: string | null;
  depDate: string | null;
  legId: number;
  region?: string | null;
  clientName?: string | null;
  operatorName?: string | null;
  clientNo?: string | null;
  agentName?: string | null;
  agentContacts?: string | null;
  captName?: string | null;
  captEmail?: string | null;
  acType?: string | null;
  mtowLb?: number | null;
  pgh?: string | null;
  tssTeam?: string | null;
}

export interface CreateLegInput {
  tripNo: string;
  icao: string;
  country?: string;
  region?: string;
  refNo?: string;
  clientName?: string;
  operatorName?: string;
  clientNo?: string;
  agentName?: string;
  agentContacts?: string;
  tail?: string;
  arrDate?: string;
  depDate?: string;
  arrFrom?: string;
  depToIcao?: string;
  activityType?: string;
  captName?: string;
  captEmail?: string;
  acType?: string;
  mtowLb?: number;
  pgh?: string;
  tssTeam?: string;
  serviceReportSent?: boolean;
  returnedInTime?: boolean;
}

export async function login(username: string, password: string): Promise<{ accessToken: string }> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error('Login failed');
  return response.json();
}

export async function getLegs(token: string): Promise<Leg[]> {
  const response = await fetch(`${API_URL}/legs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load legs');
  return response.json();
}

export async function getLeg(token: string, id: string): Promise<Leg> {
  const response = await fetch(`${API_URL}/legs/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load leg');
  return response.json();
}

export async function createLeg(token: string, input: CreateLegInput): Promise<Leg> {
  const response = await fetch(`${API_URL}/legs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Failed to create leg');
  return response.json();
}

export interface PermitRequest {
  id: string;
  legId: string;
  country: string;
  status: 'NOT_STARTED' | 'REQUESTED' | 'CHASING' | 'CONFIRMED' | 'RECONFIRM_REQUIRED' | 'CANCELLED';
  requiredByZ: string | null;
  validFrom: string | null;
  validTo: string | null;
  clearanceNumber: string | null;
}

export interface UpdatePermitRequestInput {
  status?: PermitRequest['status'];
  clearanceNumber?: string;
  validFrom?: string;
  validTo?: string;
}

export async function listPermitRequests(token: string, legId: string): Promise<PermitRequest[]> {
  const response = await fetch(`${API_URL}/legs/${legId}/permit-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load permit requests');
  return response.json();
}

export async function createPermitRequest(token: string, legId: string, country: string): Promise<PermitRequest> {
  const response = await fetch(`${API_URL}/legs/${legId}/permit-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ country }),
  });
  if (!response.ok) throw new Error('Failed to create permit request');
  return response.json();
}

export async function updatePermitRequest(
  token: string,
  id: string,
  input: UpdatePermitRequestInput,
): Promise<PermitRequest> {
  const response = await fetch(`${API_URL}/permit-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Failed to update permit request');
  return response.json();
}

export interface PermitRequestWithUrgency extends PermitRequest {
  urgency: 'BREACH' | 'URGENT' | 'DUE' | 'OK';
  legSummary: { tripNo: string; icao: string; tail: string | null } | null;
}

export async function listAllPermitRequests(token: string): Promise<PermitRequestWithUrgency[]> {
  const response = await fetch(`${API_URL}/permit-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to load permit requests');
  return response.json();
}
