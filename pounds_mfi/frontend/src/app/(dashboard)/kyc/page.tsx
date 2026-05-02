'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { kycApi } from '@/lib/api';
import { formatDate, getKycStatusColor } from '@/lib/utils';
import { KycForm } from '@/types';
import { useAuthStore } from '@/store';
import { hasRole } from '@/lib/utils';

export default function KycPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['kyc-list', { search, status: statusFilter }],
    queryFn: () => kycApi.list({ search, status: statusFilter, limit: 20 }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => kycApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc-list'] });
      toast.success('KYC approved');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => kycApi.reject(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kyc-list'] });
      toast.success('KYC rejected');
    },
  });

  const canApprove = user && hasRole(user.role, ['admin', 'super_admin']);

  return (
    <div className="space-y-4 pt-4">
      <div>
        <h1 className="page-title">KYC Applications</h1>
        <p className="text-xs text-gray-500">{data?.total || 0} total</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 text-sm py-2"
            placeholder="Search name, phone, ID..."
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto text-sm py-2 px-3"
        >
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="space-y-3">
        {isLoading && [...Array(3)].map((_, i) => <div key={i} className="card h-24 skeleton" />)}
        {!isLoading && data?.items?.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-gray-400 text-sm">No KYC applications found</p>
          </div>
        )}

        {data?.items?.map((kyc: KycForm) => (
          <div key={kyc.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-sm">{kyc.fullName || 'Unnamed applicant'}</p>
                <p className="text-xs text-gray-500">{kyc.phone || kyc.email || kyc.idNumber}</p>
                <p className="text-xs text-gray-400">{formatDate(kyc.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`badge ${getKycStatusColor(kyc.status)} capitalize`}>
                  {kyc.status.replace('_', ' ')}
                </span>
                {kyc.isLead && (
                  <span className="badge bg-purple-100 text-purple-700">Lead</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Step {kyc.currentStep}/{kyc.totalSteps}</span>
              <div className="w-24 bg-gray-100 rounded-full h-1">
                <div
                  className="bg-primary-600 h-1 rounded-full"
                  style={{ width: `${(kyc.currentStep / kyc.totalSteps) * 100}%` }}
                />
              </div>
            </div>

            {canApprove && kyc.status === 'submitted' && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => approveMutation.mutate(kyc.id)}
                  disabled={approveMutation.isPending}
                  className="btn-primary flex-1 text-xs py-2 flex items-center justify-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => {
                    const notes = prompt('Rejection reason:');
                    if (notes) rejectMutation.mutate({ id: kyc.id, notes });
                  }}
                  className="btn-danger flex-1 text-xs py-2 flex items-center justify-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <a
                href={kycApi.pdfUrl(kyc.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-700 hover:underline"
              >
                Download PDF
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
