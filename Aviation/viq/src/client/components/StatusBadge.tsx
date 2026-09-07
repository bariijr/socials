// src/client/components/StatusBadge.tsx
//
// One shared color-coded status pill for both Trip and Service statuses,
// consolidating the color logic that previously lived duplicated as
// TripsPage.tsx's private tripStatusColor() and dataStore.ts's exported
// statusColor() (Service-only) -- both deleted now that every call site
// uses this component instead. `className` lets callers layer on
// size/spacing without touching the color logic.
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TRIP_STATUS_COLORS: Record<string, string> = {
  'Planning': 'bg-blue-100 text-blue-700',
  'Active': 'bg-emerald-100 text-emerald-700',
  'Complete': 'bg-slate-100 text-slate-600',
  'Cancelled': 'bg-red-100 text-red-700',
};

const SERVICE_STATUS_COLORS: Record<string, string> = {
  'Confirmed': 'bg-emerald-100 text-emerald-700',
  'Requested': 'bg-blue-100 text-blue-700',
  'Chasing': 'bg-amber-100 text-amber-700',
  'Not Started': 'bg-slate-100 text-slate-600',
  'Cancelled': 'bg-gray-100 text-gray-500',
  'Re-confirm Required': 'bg-rose-100 text-rose-700',
  'Not Required': 'bg-slate-100 text-slate-600',
};

export function StatusBadge({ status, entityType, className }: { status: string; entityType: 'trip' | 'service'; className?: string }) {
  const colorMap = entityType === 'trip' ? TRIP_STATUS_COLORS : SERVICE_STATUS_COLORS;
  const colorClassName = colorMap[status] ?? 'bg-gray-100 text-gray-600';
  return <Badge variant="secondary" className={cn(colorClassName, className)}>{status}</Badge>;
}
