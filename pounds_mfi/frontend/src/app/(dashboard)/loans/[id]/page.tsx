'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Check, X, Send, DollarSign, Plus,
  AlertCircle, User, FileText, Lock, History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { loansApi, disbursementsApi } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, getLoanStatusColor } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { hasRole } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Repayment } from '@/types';

function InfoRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 flex-shrink-0 w-32">{label}</span>
      <span className={cn('text-xs font-medium text-gray-900 text-right', className)}>{value}</span>
    </div>
  );
}

function RepaymentModal({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mpesa');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      loansApi.recordRepayment(loanId, { amount: parseFloat(amount), paymentMethod, reference, paymentDate }),
    onSuccess: () => {
      toast.success('Repayment recorded');
      qc.invalidateQueries({ queryKey: ['loan', loanId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Record Repayment</h3>
        <div className="space-y-3">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount (KES)"
            className="input w-full"
          />
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input w-full">
            <option value="mpesa">M-Pesa</option>
            <option value="bank">Bank Transfer</option>
            <option value="cash">Cash</option>
          </select>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Transaction reference"
            className="input w-full"
          />
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="input w-full"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => mutate()}
            disabled={!amount || isPending}
            className="btn-primary flex-1"
          >
            {isPending ? 'Saving...' : 'Record'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DisburseModal({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank');
  const [bankName, setBankName] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [disbursedAt, setDisbursedAt] = useState(new Date().toISOString().split('T')[0]);
  const [file, setFile] = useState<File | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Proof required');
      return disbursementsApi.disburse(loanId, { amount, method, bankName, transactionRef, disbursedAt }, file);
    },
    onSuccess: () => {
      toast.success('Disbursement recorded');
      qc.invalidateQueries({ queryKey: ['loan', loanId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Record Disbursement</h3>
        <div className="space-y-3">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount disbursed (KES)"
            className="input w-full"
          />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="input w-full">
            <option value="bank">Bank Transfer</option>
            <option value="mpesa">M-Pesa</option>
            <option value="cash">Cash</option>
          </select>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Bank name"
            className="input w-full"
          />
          <input
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value)}
            placeholder="Transaction reference"
            className="input w-full"
          />
          <input
            type="date"
            value={disbursedAt}
            onChange={(e) => setDisbursedAt(e.target.value)}
            className="input w-full"
          />
          <div>
            <label className="text-xs text-gray-500 block mb-1">Proof of disbursement *</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="input w-full text-sm"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => mutate()}
            disabled={!amount || !file || isPending}
            className="btn-primary flex-1"
          >
            {isPending ? 'Saving...' : 'Disburse'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const { mutate, isPending } = useMutation({
    mutationFn: () => loansApi.reject(loanId, reason),
    onSuccess: () => {
      toast.success('Loan rejected');
      qc.invalidateQueries({ queryKey: ['loan', loanId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Reject Loan</h3>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejection..."
          rows={4}
          className="input w-full resize-none"
        />
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => mutate()}
            disabled={!reason || isPending}
            className="bg-red-600 text-white rounded-2xl px-4 py-2.5 font-medium flex-1 disabled:opacity-50"
          >
            {isPending ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [showRepay, setShowRepay] = useState(false);
  const [showDisburse, setShowDisburse] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const { data: loan, isLoading } = useQuery({
    queryKey: ['loan', id],
    queryFn: () => loansApi.get(id),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: () => loansApi.approve(id),
    onSuccess: () => {
      toast.success('Loan approved');
      qc.invalidateQueries({ queryKey: ['loan', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to approve'),
  });

  const submitMutation = useMutation({
    mutationFn: () => loansApi.submit(id),
    onSuccess: () => {
      toast.success('Loan submitted for review');
      qc.invalidateQueries({ queryKey: ['loan', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to submit'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 pt-4">
        <div className="h-8 skeleton rounded-lg" />
        <div className="card h-48 skeleton" />
        <div className="card h-32 skeleton" />
      </div>
    );
  }

  if (!loan) return <div className="pt-4 text-center text-gray-400">Loan not found</div>;

  const canApprove = user &&
    hasRole(user.role, ['admin', 'super_admin']) &&
    loan.status === 'submitted' &&
    loan.createdBy?.id !== user.id;

  const canDisburse = user &&
    hasRole(user.role, ['admin', 'super_admin']) &&
    loan.status === 'approved';

  const canRepay = user &&
    hasRole(user.role, ['loan_officer', 'admin', 'super_admin']) &&
    (loan.status === 'disbursed' || loan.status === 'overdue');

  const canSubmit = user &&
    loan.status === 'draft' &&
    (loan.createdBy?.id === user.id || hasRole(user.role, ['admin', 'super_admin']));

  const canReject = user &&
    hasRole(user.role, ['admin', 'super_admin']) &&
    loan.status === 'submitted';

  const progress = loan.totalRepayable > 0
    ? Math.min(100, (loan.totalRepaid / loan.totalRepayable) * 100)
    : 0;

  return (
    <div className="space-y-4 pt-4 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-xl">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="page-title">{loan.loanNumber}</h1>
            {loan.isLocked && <Lock className="w-4 h-4 text-amber-500" />}
          </div>
          <span className={`badge ${getLoanStatusColor(loan.status)} capitalize`}>{loan.status}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
          >
            <Send className="w-4 h-4" />
            {submitMutation.isPending ? 'Submitting...' : 'Submit for Review'}
          </button>
        )}
        {canApprove && (
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="bg-secondary-600 hover:bg-secondary-700 text-white rounded-2xl px-3 py-2 text-sm font-medium flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            {approveMutation.isPending ? 'Approving...' : 'Approve'}
          </button>
        )}
        {canReject && (
          <button
            onClick={() => setShowReject(true)}
            className="bg-red-600 hover:bg-red-700 text-white rounded-2xl px-3 py-2 text-sm font-medium flex items-center gap-1.5"
          >
            <X className="w-4 h-4" /> Reject
          </button>
        )}
        {canDisburse && (
          <button
            onClick={() => setShowDisburse(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-3 py-2 text-sm font-medium flex items-center gap-1.5"
          >
            <DollarSign className="w-4 h-4" /> Disburse
          </button>
        )}
        {canRepay && (
          <button
            onClick={() => setShowRepay(true)}
            className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
          >
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        )}
      </div>

      {/* Repayment Progress */}
      {(loan.status === 'disbursed' || loan.status === 'overdue' || loan.status === 'closed') && (
        <div className="card">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-500">Repayment Progress</span>
            <span className="text-xs font-semibold text-gray-900">{progress.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={cn('h-2 rounded-full transition-all', loan.status === 'overdue' ? 'bg-red-500' : 'bg-secondary-600')}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-gray-500">Paid: {formatCurrency(loan.totalRepaid)}</span>
            <span className="text-xs text-gray-500">Total: {formatCurrency(loan.totalRepayable)}</span>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card bg-primary-50 border-0">
          <p className="text-xs text-primary-600">Principal</p>
          <p className="font-bold text-primary-900">{formatCurrency(loan.principalAmount)}</p>
        </div>
        <div className="card bg-amber-50 border-0">
          <p className="text-xs text-amber-600">Outstanding</p>
          <p className="font-bold text-amber-900">{formatCurrency(loan.outstandingBalance)}</p>
        </div>
        {loan.totalPenalties > 0 && (
          <div className="card bg-red-50 border-0 col-span-2">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-xs text-red-600">Penalties accrued: {formatCurrency(loan.totalPenalties)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Loan Details */}
      <div className="card">
        <h2 className="section-title mb-3">Loan Details</h2>
        <InfoRow label="Loan Package" value={loan.package?.name} />
        <InfoRow label="Interest Rate" value={`${loan.interestRate}%`} />
        <InfoRow label="Duration" value={`${loan.durationDays} days`} />
        <InfoRow label="Processing Fee" value={formatCurrency(loan.processingFeeAmount)} />
        <InfoRow label="Total Repayable" value={formatCurrency(loan.totalRepayable)} />
        <InfoRow label="Disbursed" value={formatCurrency(loan.disbursedAmount)} />
        <InfoRow
          label="Due Date"
          value={loan.dueDate ? formatDate(loan.dueDate) : 'Not set'}
          className={loan.status === 'overdue' ? 'text-red-600' : undefined}
        />
        {loan.purpose && <InfoRow label="Purpose" value={loan.purpose} />}
      </div>

      {/* Borrower */}
      <div className="card">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <User className="w-4 h-4" /> Borrower
        </h2>
        <InfoRow label="Name" value={`${loan.borrower?.firstName} ${loan.borrower?.lastName}`} />
        <InfoRow label="Email" value={loan.borrower?.email} />
        {loan.borrower?.phone && <InfoRow label="Phone" value={loan.borrower.phone} />}
      </div>

      {/* Officers */}
      <div className="card">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Processing
        </h2>
        <InfoRow
          label="Created by"
          value={`${loan.createdBy?.firstName} ${loan.createdBy?.lastName}`}
        />
        {loan.approvedBy && (
          <InfoRow
            label="Approved by"
            value={`${loan.approvedBy.firstName} ${loan.approvedBy.lastName}`}
          />
        )}
        <InfoRow label="Created" value={formatDateTime(loan.createdAt)} />
        {loan.notes && <InfoRow label="Notes" value={loan.notes} />}
      </div>

      {/* Repayment History */}
      {loan.repayments && loan.repayments.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <History className="w-4 h-4" /> Payment History
          </h2>
          <div className="space-y-2">
            {[...loan.repayments]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((r: Repayment) => (
                <div key={r.id} className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(r.amount)}</p>
                    <p className="text-xs text-gray-500">
                      {r.paymentDate ? formatDate(r.paymentDate) : formatDate(r.createdAt)}
                      {r.paymentMethod && ` · ${r.paymentMethod}`}
                    </p>
                    {r.recordedBy && (
                      <p className="text-[10px] text-gray-400">
                        by {r.recordedBy.firstName} {r.recordedBy.lastName}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      'badge text-[10px] capitalize',
                      r.status === 'verified' ? 'bg-green-100 text-green-700' :
                      r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700',
                    )}>
                      {r.status}
                    </span>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Bal: {formatCurrency(r.balanceAfter)}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showRepay && <RepaymentModal loanId={id} onClose={() => setShowRepay(false)} />}
      {showDisburse && <DisburseModal loanId={id} onClose={() => setShowDisburse(false)} />}
      {showReject && <RejectModal loanId={id} onClose={() => setShowReject(false)} />}
    </div>
  );
}
