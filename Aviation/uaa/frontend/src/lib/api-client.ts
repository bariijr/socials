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
