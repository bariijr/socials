'use client';
import { Bell, LogOut, User, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { authApi, notificationsApi, api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function TopBar({ title }: { title?: string }) {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: unreadCount } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 30000,
    enabled: !!user,
  });

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      api.clearTokens();
      clearAuth();
      router.push('/login');
      toast.success('Logged out successfully');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center justify-between h-14 px-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-primary-800 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-black">£</span>
          </div>
          <h1 className="font-semibold text-gray-900 text-sm">
            {title || 'Pounds MFI'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/notifications')}
            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-700 text-xs font-bold">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-2xl shadow-lg border border-gray-100 py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-50">
                  <p className="text-sm font-medium text-gray-900">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                  <span className="inline-block mt-1 text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full capitalize">
                    {user?.role?.replace('_', ' ')}
                  </span>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); router.push('/profile'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <User className="w-4 h-4" /> Profile
                </button>
                <button
                  onClick={() => { setMenuOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
