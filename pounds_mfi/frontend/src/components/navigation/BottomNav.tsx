'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, Receipt, Users, Settings, ClipboardCheck, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { hasRole } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, roles: ['loan_officer', 'admin', 'super_admin'] },
  { href: '/loans', label: 'Loans', icon: FileText, roles: ['user', 'loan_officer', 'admin', 'super_admin'] },
  { href: '/receipts', label: 'Receipts', icon: Receipt, roles: ['user', 'loan_officer', 'admin', 'super_admin'] },
  { href: '/kyc', label: 'KYC', icon: ClipboardCheck, roles: ['loan_officer', 'admin', 'super_admin'] },
  { href: '/users', label: 'Users', icon: Users, roles: ['admin', 'super_admin'] },
  { href: '/audit', label: 'Audit', icon: ShieldCheck, roles: ['admin', 'super_admin'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'super_admin'] },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();

  const visible = navItems.filter((item) =>
    user ? hasRole(user.role, item.roles) : false,
  );

  if (!user) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 bottom-nav">
      <div className="flex items-center h-16 max-w-lg mx-auto px-1 overflow-x-auto scrollbar-none">
        {visible.map((item) => {
          const active = pathname === item.href || (item.href !== '/loans' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transition-colors flex-shrink-0 min-w-[52px]',
                active ? 'text-primary-700' : 'text-gray-400 hover:text-gray-600',
              )}
            >
              <item.icon
                className={cn('w-5 h-5 transition-all', active && 'scale-110')}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span className={cn('text-[9px] font-medium', active && 'font-semibold')}>
                {item.label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-1 h-1 rounded-full bg-primary-700" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
