'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, BellOff, CheckCheck } from 'lucide-react';
import { notificationsApi } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Notification } from '@/types';

const CHANNEL_ICONS: Record<string, string> = {
  email: '✉️',
  sms: '💬',
  whatsapp: '📱',
  push: '🔔',
};

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list({ limit: 50 }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const notifications: Notification[] = data?.items || [];
  const unread = notifications.filter((n) => !n.isRead);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="flex items-center justify-between h-14 px-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-xl">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="font-semibold text-gray-900 text-sm">Notifications</h1>
              {unread.length > 0 && (
                <p className="text-xs text-gray-500">{unread.length} unread</p>
              )}
            </div>
          </div>
          {unread.length > 0 && (
            <button
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="flex items-center gap-1.5 text-xs text-primary-700 font-medium px-3 py-1.5 hover:bg-primary-50 rounded-xl"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4">
        {isLoading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="card h-20 skeleton" />
            ))}
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BellOff className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm font-medium">No notifications yet</p>
            <p className="text-gray-300 text-xs mt-1">You'll see updates here when something happens</p>
          </div>
        )}

        <div className="space-y-2">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => { if (!n.isRead) markReadMutation.mutate(n.id); }}
              className={cn(
                'w-full text-left card transition-all',
                !n.isRead && 'border-primary-200 bg-primary-50/50',
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base',
                  n.isRead ? 'bg-gray-100' : 'bg-primary-100',
                )}>
                  {CHANNEL_ICONS[n.channel] || '🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm truncate', n.isRead ? 'text-gray-700' : 'font-semibold text-gray-900')}>
                      {n.title}
                    </p>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-primary-600 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
