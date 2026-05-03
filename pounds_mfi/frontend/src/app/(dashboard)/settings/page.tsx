'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { settingsApi, backupsApi, loansApi } from '@/lib/api';
import { useAuthStore } from '@/store';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import { Database, Shield, Bell, Palette, Globe, Package, Plus, Pencil, Check, X } from 'lucide-react';
import { LoanPackage } from '@/types';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('branding');

  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: () => settingsApi.branding(),
  });

  const { data: backups, refetch: refetchBackups } = useQuery({
    queryKey: ['backups'],
    queryFn: () => backupsApi.list(),
    enabled: user?.role === 'super_admin',
  });

  const { data: packages } = useQuery({
    queryKey: ['loan-packages'],
    queryFn: () => loansApi.packages(),
    enabled: activeTab === 'packages',
  });

  const [showPkgForm, setShowPkgForm] = useState(false);
  const [editingPkg, setEditingPkg] = useState<LoanPackage | null>(null);
  const [pkgForm, setPkgForm] = useState({
    name: '', description: '', interestRate: '', interestFrequency: 'monthly',
    minAmount: '', maxAmount: '', minDuration: '', maxDuration: '',
    processingFeePercent: '', penaltyPercent: '',
  });

  const createPkgMutation = useMutation({
    mutationFn: () => loansApi.createPackage({
      ...pkgForm,
      interestRate: parseFloat(pkgForm.interestRate),
      minAmount: parseFloat(pkgForm.minAmount),
      maxAmount: parseFloat(pkgForm.maxAmount),
      minDuration: parseInt(pkgForm.minDuration),
      maxDuration: parseInt(pkgForm.maxDuration),
      processingFeePercent: parseFloat(pkgForm.processingFeePercent),
      penaltyPercent: parseFloat(pkgForm.penaltyPercent),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan-packages'] });
      toast.success('Package created');
      setShowPkgForm(false);
      setPkgForm({ name: '', description: '', interestRate: '', interestFrequency: 'monthly', minAmount: '', maxAmount: '', minDuration: '', maxDuration: '', processingFeePercent: '', penaltyPercent: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const updatePkgMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => loansApi.updatePackage(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan-packages'] });
      toast.success('Package updated');
      setEditingPkg(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const backupMutation = useMutation({
    mutationFn: () => backupsApi.run(),
    onSuccess: () => {
      toast.success('Backup started');
      refetchBackups();
    },
    onError: () => toast.error('Backup failed'),
  });

  const tabs = [
    { id: 'branding', label: 'Branding', icon: Palette },
    { id: 'packages', label: 'Packages', icon: Package },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'language', label: 'Language', icon: Globe },
    ...(user?.role === 'super_admin' ? [{ id: 'backup', label: 'Backup', icon: Database }] : []),
  ];

  return (
    <div className="space-y-4 pt-4">
      <h1 className="page-title">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'bg-primary-800 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Branding */}
      {activeTab === 'branding' && (
        <div className="card space-y-4">
          <h2 className="section-title">Branding Information</h2>
          <p className="text-xs text-gray-500">
            Branding is configured via environment variables in your .env file.
          </p>
          {branding && (
            <div className="space-y-2 text-sm">
              {Object.entries(branding).map(([key, value]) => (
                <div key={key} className="flex justify-between border-b border-gray-50 pb-2">
                  <span className="text-gray-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="font-medium text-gray-900 truncate max-w-[60%] text-right">
                    {value as string || '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loan Packages */}
      {activeTab === 'packages' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Loan Packages</h2>
            {!showPkgForm && (
              <button
                onClick={() => setShowPkgForm(true)}
                className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> New Package
              </button>
            )}
          </div>

          {/* Create Form */}
          {showPkgForm && (
            <div className="card space-y-3">
              <h3 className="font-medium text-sm text-gray-900">Create Loan Package</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Name *</label>
                  <input value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} className="input" placeholder="e.g. Standard Monthly" />
                </div>
                <div>
                  <label className="label">Interest Rate (%)</label>
                  <input type="number" value={pkgForm.interestRate} onChange={(e) => setPkgForm({ ...pkgForm, interestRate: e.target.value })} className="input" placeholder="5" />
                </div>
                <div>
                  <label className="label">Frequency</label>
                  <select value={pkgForm.interestFrequency} onChange={(e) => setPkgForm({ ...pkgForm, interestFrequency: e.target.value })} className="input">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="label">Min Amount (KES)</label>
                  <input type="number" value={pkgForm.minAmount} onChange={(e) => setPkgForm({ ...pkgForm, minAmount: e.target.value })} className="input" placeholder="1000" />
                </div>
                <div>
                  <label className="label">Max Amount (KES)</label>
                  <input type="number" value={pkgForm.maxAmount} onChange={(e) => setPkgForm({ ...pkgForm, maxAmount: e.target.value })} className="input" placeholder="100000" />
                </div>
                <div>
                  <label className="label">Min Duration (days)</label>
                  <input type="number" value={pkgForm.minDuration} onChange={(e) => setPkgForm({ ...pkgForm, minDuration: e.target.value })} className="input" placeholder="7" />
                </div>
                <div>
                  <label className="label">Max Duration (days)</label>
                  <input type="number" value={pkgForm.maxDuration} onChange={(e) => setPkgForm({ ...pkgForm, maxDuration: e.target.value })} className="input" placeholder="365" />
                </div>
                <div>
                  <label className="label">Processing Fee (%)</label>
                  <input type="number" value={pkgForm.processingFeePercent} onChange={(e) => setPkgForm({ ...pkgForm, processingFeePercent: e.target.value })} className="input" placeholder="2" />
                </div>
                <div>
                  <label className="label">Penalty (%)</label>
                  <input type="number" value={pkgForm.penaltyPercent} onChange={(e) => setPkgForm({ ...pkgForm, penaltyPercent: e.target.value })} className="input" placeholder="1" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => createPkgMutation.mutate()} disabled={!pkgForm.name || createPkgMutation.isPending} className="btn-primary flex-1 text-sm">
                  {createPkgMutation.isPending ? 'Creating...' : 'Create'}
                </button>
                <button onClick={() => setShowPkgForm(false)} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Packages List */}
          <div className="space-y-3">
            {packages?.map((pkg: LoanPackage) => (
              <div key={pkg.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{pkg.name}</p>
                    <p className="text-xs text-gray-500">
                      {pkg.interestRate}% {pkg.interestFrequency} · {pkg.processingFeePercent}% fee
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${pkg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {pkg.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => setEditingPkg(editingPkg?.id === pkg.id ? null : pkg)}
                      className="p-1.5 hover:bg-gray-100 rounded-lg"
                    >
                      <Pencil className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>Min: {formatCurrency(pkg.minAmount)}</span>
                  <span>Max: {formatCurrency(pkg.maxAmount)}</span>
                  <span>Min: {pkg.minDuration}d</span>
                  <span>Max: {pkg.maxDuration}d</span>
                </div>

                {editingPkg?.id === pkg.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                    <button
                      onClick={() => updatePkgMutation.mutate({ id: pkg.id, data: { isActive: !pkg.isActive } })}
                      disabled={updatePkgMutation.isPending}
                      className={`flex-1 text-xs py-2 rounded-xl font-medium flex items-center justify-center gap-1 ${
                        pkg.isActive
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}
                    >
                      {pkg.isActive ? <><X className="w-3.5 h-3.5" /> Deactivate</> : <><Check className="w-3.5 h-3.5" /> Activate</>}
                    </button>
                  </div>
                )}
              </div>
            ))}
            {packages?.length === 0 && (
              <div className="card text-center py-10">
                <p className="text-gray-400 text-sm">No loan packages yet. Create one above.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Security */}
      {activeTab === 'security' && (
        <div className="card space-y-4">
          <h2 className="section-title">Security Settings</h2>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Session Timeout', value: '15 minutes of inactivity' },
              { label: 'Failed Login Lockout', value: 'After 5 attempts (30 min)' },
              { label: 'Password Policy', value: 'Minimum 8 characters' },
              { label: 'JWT Token Expiry', value: '15 minutes' },
              { label: 'Audit Logging', value: 'All mutations logged' },
              { label: 'IP Tracking', value: 'Enabled' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-900">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notifications */}
      {activeTab === 'notifications' && (
        <div className="card">
          <h2 className="section-title mb-4">Notification Preferences</h2>
          <p className="text-xs text-gray-500 mb-4">
            Update your notification preferences in your profile settings.
          </p>
          <div className="space-y-3">
            {[
              { key: 'email', label: 'Email Notifications', desc: 'Loan updates, receipts, alerts' },
              { key: 'sms', label: 'SMS Notifications', desc: 'Important alerts and reminders' },
              { key: 'push', label: 'Push Notifications', desc: 'In-app notifications' },
              { key: 'whatsapp', label: 'WhatsApp Messages', desc: 'Loan status updates' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                </div>
                <div className="w-10 h-6 bg-primary-200 rounded-full relative cursor-pointer">
                  <div className="w-5 h-5 bg-primary-700 rounded-full absolute top-0.5 right-0.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Language */}
      {activeTab === 'language' && (
        <div className="card">
          <h2 className="section-title mb-4">Language</h2>
          <div className="space-y-2">
            {[
              { code: 'en', label: 'English', flag: '🇬🇧' },
              { code: 'sw', label: 'Kiswahili', flag: '🇰🇪' },
            ].map(({ code, label, flag }) => (
              <button
                key={code}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-primary-200 hover:bg-primary-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{flag}</span>
                  <span className="font-medium text-sm">{label}</span>
                </div>
                {code === 'en' && <span className="text-xs text-primary-700 font-medium">Active</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Backup */}
      {activeTab === 'backup' && user?.role === 'super_admin' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="section-title mb-4">Database Backup</h2>
            <p className="text-xs text-gray-500 mb-4">
              Backups run automatically at 2:00 AM daily and are emailed to admin recipients.
            </p>
            <button
              onClick={() => backupMutation.mutate()}
              disabled={backupMutation.isPending}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Database className="w-4 h-4" />
              {backupMutation.isPending ? 'Running Backup...' : 'Run Backup Now'}
            </button>
          </div>

          {backups && (
            <div className="card">
              <h2 className="section-title mb-3">Backup History</h2>
              <div className="space-y-2">
                {backups.slice(0, 10).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 text-xs">
                    <div>
                      <p className="font-medium text-gray-900">{b.fileName || 'In progress...'}</p>
                      <p className="text-gray-400">{formatDateTime(b.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.fileSize && (
                        <span className="text-gray-400">
                          {(b.fileSize / 1024 / 1024).toFixed(1)} MB
                        </span>
                      )}
                      <span className={`badge ${
                        b.status === 'success' ? 'bg-green-100 text-green-700' :
                        b.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {b.status}
                      </span>
                    </div>
                  </div>
                ))}
                {(!backups || backups.length === 0) && (
                  <p className="text-gray-400 text-sm text-center py-4">No backups yet</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
