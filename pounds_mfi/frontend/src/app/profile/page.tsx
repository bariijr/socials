'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, User, Bell, Key, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersApi } from '@/lib/api';
import { useAuthStore } from '@/store';
import { cn } from '@/lib/utils';

type Tab = 'profile' | 'notifications' | 'security';

export default function ProfilePage() {
  const router = useRouter();
  const { user, updateUser } = useAuthStore();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('profile');
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [language, setLanguage] = useState(user?.language || 'en');
  const [notifPrefs, setNotifPrefs] = useState(
    user?.notificationPreferences || { email: true, sms: true, whatsapp: false, push: true },
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const profileMutation = useMutation({
    mutationFn: () => usersApi.updateMe({ firstName, lastName, phone, language, notificationPreferences: notifPrefs }),
    onSuccess: (data: any) => {
      updateUser(data);
      toast.success('Profile updated');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Update failed'),
  });

  const passwordMutation = useMutation({
    mutationFn: () => {
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match');
      if (newPassword.length < 8) throw new Error('Password must be at least 8 characters');
      return usersApi.updateMe({ currentPassword, newPassword });
    },
    onSuccess: () => {
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (e: any) => toast.error(e.message || e.response?.data?.message || 'Failed'),
  });

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Alerts', icon: Bell },
    { id: 'security', label: 'Security', icon: Key },
  ];

  const NOTIF_CHANNELS = [
    { key: 'email', label: 'Email' },
    { key: 'sms', label: 'SMS' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'push', label: 'In-app push' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="flex items-center h-14 px-4 max-w-2xl mx-auto gap-3">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-xl">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="font-semibold text-gray-900 text-sm">My Profile</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Avatar */}
        <div className="flex flex-col items-center py-4">
          <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mb-2">
            <span className="text-primary-700 text-2xl font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          <p className="font-semibold text-gray-900">{user?.firstName} {user?.lastName}</p>
          <p className="text-xs text-gray-500">{user?.email}</p>
          <span className="mt-1 text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full capitalize">
            {user?.role?.replace('_', ' ')}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-xl transition-all',
                tab === id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {tab === 'profile' && (
          <div className="card space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>
            <div>
              <label className="label">Phone Number</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254700000000"
                className="input w-full"
              />
            </div>
            <div>
              <label className="label">Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input w-full">
                <option value="en">English</option>
                <option value="sw">Swahili</option>
              </select>
            </div>
            <button
              onClick={() => profileMutation.mutate()}
              disabled={profileMutation.isPending}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {profileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* Notifications Tab */}
        {tab === 'notifications' && (
          <div className="card space-y-4">
            <p className="text-sm text-gray-600">Choose how you receive notifications</p>
            <div className="space-y-3">
              {NOTIF_CHANNELS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{label}</span>
                  <button
                    onClick={() => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }))}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors',
                      notifPrefs[key] ? 'bg-primary-700' : 'bg-gray-200',
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                      notifPrefs[key] ? 'translate-x-5' : 'translate-x-0.5',
                    )} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => profileMutation.mutate()}
              disabled={profileMutation.isPending}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {profileMutation.isPending ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        )}

        {/* Security Tab */}
        {tab === 'security' && (
          <div className="card space-y-3">
            <p className="text-sm text-gray-600">Change your password</p>
            <div>
              <label className="label">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input w-full"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input w-full"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input w-full"
                autoComplete="new-password"
              />
            </div>
            <button
              onClick={() => passwordMutation.mutate()}
              disabled={!currentPassword || !newPassword || passwordMutation.isPending}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" />
              {passwordMutation.isPending ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
