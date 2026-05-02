'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { ChevronLeft, Calculator } from 'lucide-react';
import { loansApi, usersApi } from '@/lib/api';
import { formatCurrency, calculateLoanInterest } from '@/lib/utils';
import { useAuthStore } from '@/store';

const schema = z.object({
  borrowerId: z.string().min(1, 'Borrower is required'),
  packageId: z.string().min(1, 'Loan package is required'),
  principalAmount: z.number().positive('Amount must be positive'),
  durationDays: z.number().int().positive('Duration is required'),
  purpose: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewLoanPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const { data: packages } = useQuery({
    queryKey: ['loan-packages'],
    queryFn: () => loansApi.packages(),
  });

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.list({ role: 'user', status: 'active', limit: 100 }),
  });

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { principalAmount: 10000, durationDays: 30 },
  });

  const watchedPackageId = watch('packageId');
  const watchedAmount = watch('principalAmount');
  const watchedDuration = watch('durationDays');

  const selectedPackage = packages?.find((p: any) => p.id === watchedPackageId);

  const interest = selectedPackage
    ? calculateLoanInterest(
        watchedAmount || 0,
        selectedPackage.interestRate,
        watchedDuration || 0,
        selectedPackage.interestFrequency,
      )
    : 0;
  const fee = selectedPackage ? ((watchedAmount || 0) * selectedPackage.processingFeePercent) / 100 : 0;
  const disbursed = (watchedAmount || 0) - fee;
  const totalRepayable = (watchedAmount || 0) + interest;

  const mutation = useMutation({
    mutationFn: (data: FormData) => loansApi.create(data),
    onSuccess: (loan) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast.success('Loan created successfully');
      router.push(`/loans/${loan.id}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to create loan');
    },
  });

  return (
    <div className="space-y-5 pt-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-gray-100 rounded-xl">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="page-title">New Loan Application</h1>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
        {/* Borrower */}
        <div className="card space-y-4">
          <h2 className="section-title">Borrower Information</h2>
          <div>
            <label className="label">Select Borrower *</label>
            <select {...register('borrowerId')} className="input">
              <option value="">Choose borrower...</option>
              {users?.items?.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} — {u.email}
                </option>
              ))}
            </select>
            {errors.borrowerId && <p className="text-red-500 text-xs mt-1">{errors.borrowerId.message}</p>}
          </div>
        </div>

        {/* Loan Package */}
        <div className="card space-y-4">
          <h2 className="section-title">Loan Package</h2>
          <div>
            <label className="label">Package *</label>
            <select {...register('packageId')} className="input">
              <option value="">Choose package...</option>
              {packages?.map((pkg: any) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} — {pkg.interestRate}% {pkg.interestFrequency}
                </option>
              ))}
            </select>
            {errors.packageId && <p className="text-red-500 text-xs mt-1">{errors.packageId.message}</p>}
          </div>

          {selectedPackage && (
            <div className="bg-primary-50 rounded-xl p-3 text-xs space-y-1">
              <p><span className="text-gray-500">Min/Max:</span> <span className="font-medium">{formatCurrency(selectedPackage.minAmount)} — {formatCurrency(selectedPackage.maxAmount)}</span></p>
              <p><span className="text-gray-500">Duration:</span> <span className="font-medium">{selectedPackage.minDuration} — {selectedPackage.maxDuration} days</span></p>
              <p><span className="text-gray-500">Processing fee:</span> <span className="font-medium">{selectedPackage.processingFeePercent}%</span></p>
            </div>
          )}

          <div>
            <label className="label">Principal Amount (KES) *</label>
            <input
              {...register('principalAmount', { valueAsNumber: true })}
              type="number"
              className="input"
              placeholder="10000"
            />
            {errors.principalAmount && <p className="text-red-500 text-xs mt-1">{errors.principalAmount.message}</p>}
          </div>

          <div>
            <label className="label">Duration (Days) *</label>
            <input
              {...register('durationDays', { valueAsNumber: true })}
              type="number"
              className="input"
              placeholder="30"
            />
          </div>
        </div>

        {/* Loan Summary */}
        {selectedPackage && watchedAmount > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="w-4 h-4 text-primary-700" />
              <h2 className="section-title">Loan Summary</h2>
            </div>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Principal', value: formatCurrency(watchedAmount || 0) },
                { label: `Interest (${selectedPackage.interestRate}%)`, value: formatCurrency(interest) },
                { label: `Processing Fee (${selectedPackage.processingFeePercent}%)`, value: `- ${formatCurrency(fee)}` },
                { label: 'Amount Disbursed', value: formatCurrency(disbursed), bold: true },
                { label: 'Total Repayable', value: formatCurrency(totalRepayable), highlight: true },
              ].map(({ label, value, bold, highlight }) => (
                <div
                  key={label}
                  className={`flex justify-between py-1.5 ${
                    highlight ? 'border-t border-gray-100 pt-2.5 font-bold text-primary-800' : ''
                  }`}
                >
                  <span className={bold ? 'font-medium' : 'text-gray-500'}>{label}</span>
                  <span className={bold || highlight ? 'font-bold' : ''}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Purpose */}
        <div className="card space-y-4">
          <div>
            <label className="label">Loan Purpose</label>
            <textarea
              {...register('purpose')}
              className="input min-h-[80px] resize-none"
              placeholder="What is the loan for?"
            />
          </div>
          <div>
            <label className="label">Internal Notes</label>
            <textarea
              {...register('notes')}
              className="input min-h-[60px] resize-none"
              placeholder="Officer notes..."
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="btn-primary w-full py-3 text-base"
        >
          {mutation.isPending ? 'Creating...' : 'Create Loan Application'}
        </button>
      </form>
    </div>
  );
}
