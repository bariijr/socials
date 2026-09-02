import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../lib/authContext';

export default function RequireRole({ role, children }: { role: string; children: ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== role) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
