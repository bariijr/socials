'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Search, Filter, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { loansApi } from '@/lib/api';
import { formatCurrency, formatDate, getLoanStatusColor } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { Loan, LoanStatus } from '@/types';
import { hasRole } from '@/lib/utils';

const STATUS_OPTIONS: LoanStatus[] = [
  'draft', 'submitted', 'approved', 'disbursed', 'overdue', 'closed', 'rejected',
];

export default function LoansPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['loans', { search, status, page }],
    queryFn: () => loansApi.list({ search, status, page, limit: 20 }),
  });

  const canCreate = user && hasRole(user.role, ['loan_officer', 'admin', 'super_admin']);

  if (isLoading) {
    return (
      <div className="space-y-3 pt-4">
        <div className="card h-12 skeleton" />
        {[...Array(5)].map((_, i) => <div key={i} className="card h-24 skeleton" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Loans</h1>
          <p className="text-xs text-gray-500">{data?.total || 0} total</p>
        </div>
        {canCreate && (
          <button
            onClick={() => router.push('/loans/new')}
            className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
          >
            <Plus className="w-4 h-4" /> New Loan
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 text-sm py-2"
            placeholder="Search loan number..."
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input w-auto text-sm py-2 px-3"
        >
          <option value="">All status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>
      </div>

      {/* Loan List */}
      <div className="space-y-3">
        {data?.items?.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-gray-400 text-sm">No loans found</p>
          </div>
        )}

        {data?.items?.map((loan: Loan) => (
          <button
            key={loan.id}
            onClick={() => router.push(`/loans/${loan.id}`)}
            className="card w-full text-left hover:shadow-card-hover transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-sm text-gray-900">{loan.loanNumber}</p>
                <p className="text-xs text-gray-500">
                  {loan.borrower?.firstName} {loan.borrower?.lastName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${getLoanStatusColor(loan.status)} capitalize`}>
                  {loan.status}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-gray-400">Principal</p>
                <p className="font-semibold text-gray-900">{formatCurrency(loan.principalAmount)}</p>
              </div>
              <div>
                <p className="text-gray-400">Outstanding</p>
                <p className={`font-semibold ${loan.outstandingBalance > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                  {formatCurrency(loan.outstandingBalance)}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Due Date</p>
                <p className={`font-semibold ${loan.status === 'overdue' ? 'text-red-600' : 'text-gray-900'}`}>
                  {loan.dueDate ? formatDate(loan.dueDate) : 'N/A'}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {data?.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-sm py-1.5 px-3"
          >
            Previous
          </button>
          <span className="flex items-center text-sm text-gray-500">
            {page} / {data?.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data?.pages, p + 1))}
            disabled={page === data?.pages}
            className="btn-secondary text-sm py-1.5 px-3"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
