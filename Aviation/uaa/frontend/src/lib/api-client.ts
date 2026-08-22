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
