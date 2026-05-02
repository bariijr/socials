import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'KES'): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date, fmt = 'dd MMM yyyy'): string {
  return format(new Date(date), fmt);
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'dd MMM yyyy HH:mm');
}

export function timeAgo(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function getLoanStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    submitted: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    disbursed: 'bg-emerald-100 text-emerald-700',
    overdue: 'bg-red-100 text-red-700',
    closed: 'bg-purple-100 text-purple-700',
    rejected: 'bg-rose-100 text-rose-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

export function getKycStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    submitted: 'bg-blue-100 text-blue-700',
    under_review: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

export function getReceiptStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    verified: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    duplicate: 'bg-orange-100 text-orange-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

export function calculateLoanInterest(
  principal: number,
  rate: number,
  days: number,
  frequency: string,
): number {
  const daysMap: Record<string, number> = {
    daily: 1, weekly: 7, monthly: 30, yearly: 365,
  };
  const periodDays = daysMap[frequency] || 30;
  return (principal * rate * days) / (periodDays * 100);
}

export function truncate(str: string, length: number): string {
  return str.length > length ? str.substring(0, length) + '...' : str;
}

export function hasRole(userRole: string, requiredRoles: string[]): boolean {
  const hierarchy: Record<string, number> = {
    super_admin: 4, admin: 3, loan_officer: 2, user: 1,
  };
  const userLevel = hierarchy[userRole] || 0;
  return requiredRoles.some((r) => userLevel >= (hierarchy[r] || 0));
}
