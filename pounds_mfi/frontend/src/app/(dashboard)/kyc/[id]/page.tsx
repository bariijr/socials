'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Download, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { kycApi } from '@/lib/api';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getKycStatusColor,
  hasRole,
} from '@/lib/utils';
import { useAuthStore } from '@/store';
import { KycDocument } from '@/types';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 flex-shrink-0 w-36">{label}</span>
      <span className="text-xs font-medium text-gray-900 text-right">{value ?? '—'}</span>
    </div>
  );
}

function RejectModal({
  kycId,
  onClose,
  onSuccess,
}: {
  kycId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [notes, setNotes] = useState('');
  const { mutate, isPending } = useMutation({
    mutationFn: () => kycApi.reject(kycId, notes),
    onSuccess: () => {
      toast.success('KYC application rejected');
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to reject'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Reject KYC Application</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason for rejection..."
          rows={4}
          className="input w-full resize-none"
        />
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() => mutate()}
            disabled={!notes.trim() || isPending}
            className="bg-red-600 text-white rounded-2xl px-4 py-2.5 font-medium flex-1 disabled:opacity-50 hover:bg-red-700 transition-colors"
          >
            {isPending ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KycDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [showReject, setShowReject] = useState(false);

  const { data: kyc, isLoading } = useQuery({
    queryKey: ['kyc-detail', id],
    queryFn: () => kycApi.get(id),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: () => kycApi.approve(id),
    onSuccess: () => {
      toast.success('KYC application approved');
      qc.invalidateQueries({ queryKey: ['kyc-list'] });
      qc.invalidateQueries({ queryKey: ['kyc-detail', id] });
      router.back();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to approve'),
  });

  const handleRejectSuccess = () => {
    qc.invalidateQueries({ queryKey: ['kyc-list'] });
    qc.invalidateQueries({ queryKey: ['kyc-detail', id] });
    router.back();
  };

  const isAdmin = user ? hasRole(user.role, ['admin', 'super_admin']) : false;

  if (isLoading) {
    return (
      <div className="space-y-4 pt-4">
        <div className="h-8 skeleton rounded-lg" />
        <div className="card h-32 skeleton" />
        <div className="card h-32 skeleton" />
        <div className="card h-32 skeleton" />
      </div>
    );
  }

  if (!kyc) {
    return (
      <div className="pt-4 text-center text-gray-400">KYC application not found</div>
    );
  }

  return (
    <div className="space-y-4 pt-4 pb-4">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-gray-50 pb-2 -mx-4 px-4 pt-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-xl flex-shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="page-title truncate">KYC Application</h1>
          </div>
          <span
            className={`badge ${getKycStatusColor(kyc.status)} capitalize flex-shrink-0`}
          >
            {kyc.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Personal Info */}
      <div className="card">
        <h2 className="section-title mb-3">Personal Information</h2>
        <InfoRow label="Full Name" value={kyc.fullName} />
        <InfoRow label="Phone" value={kyc.phone} />
        <InfoRow label="Email" value={kyc.email} />
        <InfoRow
          label="Date of Birth"
          value={kyc.dateOfBirth ? formatDate(kyc.dateOfBirth) : null}
        />
        <InfoRow label="ID Type" value={kyc.idType} />
        <InfoRow label="ID Number" value={kyc.idNumber} />
        <InfoRow label="Submitted" value={formatDateTime(kyc.createdAt)} />
        <InfoRow
          label="Progress"
          value={`Step ${kyc.currentStep} / ${kyc.totalSteps}`}
        />
        {kyc.isLead && (
          <div className="pt-2">
            <span className="badge bg-purple-100 text-purple-700">Lead Applicant</span>
          </div>
        )}
      </div>

      {/* Address & Employment */}
      <div className="card">
        <h2 className="section-title mb-3">Address &amp; Employment</h2>
        <InfoRow label="Address" value={kyc.address} />
        <InfoRow label="City" value={kyc.city} />
        <InfoRow label="County" value={kyc.county} />
        <InfoRow label="Occupation" value={kyc.occupation} />
        <InfoRow label="Employer" value={kyc.employer} />
        <InfoRow
          label="Monthly Income"
          value={
            kyc.monthlyIncome != null
              ? formatCurrency(kyc.monthlyIncome)
              : null
          }
        />
      </div>

      {/* Documents */}
      {kyc.documents && kyc.documents.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Documents
          </h2>
          <div className="space-y-3">
            {kyc.documents.map((doc: KycDocument) => (
              <div
                key={doc.id}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 capitalize truncate">
                    {doc.documentType.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{doc.fileName}</p>
                  {doc.ocrProcessed ? (
                    <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                      <Check className="w-3 h-3" /> OCR processed
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Pending OCR</p>
                  )}
                </div>
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/kyc/${id}/documents/${doc.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 flex-shrink-0 p-2 text-primary-700 hover:bg-primary-50 rounded-xl transition-colors"
                  aria-label={`Download ${doc.documentType}`}
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {kyc.documents && kyc.documents.length === 0 && (
        <div className="card text-center py-8">
          <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No documents uploaded yet</p>
        </div>
      )}

      {/* Admin Actions */}
      {isAdmin && kyc.status === 'submitted' && (
        <div className="card">
          <h2 className="section-title mb-3">Actions</h2>
          <div className="flex gap-3">
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white rounded-2xl px-4 py-2.5 font-medium flex-1 flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              <Check className="w-4 h-4" />
              {approveMutation.isPending ? 'Approving...' : 'Approve'}
            </button>
            <button
              onClick={() => setShowReject(true)}
              className="bg-red-600 hover:bg-red-700 text-white rounded-2xl px-4 py-2.5 font-medium flex-1 flex items-center justify-center gap-2 transition-colors"
            >
              <X className="w-4 h-4" /> Reject
            </button>
          </div>
        </div>
      )}

      {/* PDF Download — always visible */}
      <div className="card">
        <h2 className="section-title mb-3">Download</h2>
        <a
          href={kycApi.pdfUrl(id)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary w-full flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </a>
      </div>

      {/* Reject Modal */}
      {showReject && (
        <RejectModal
          kycId={id}
          onClose={() => setShowReject(false)}
          onSuccess={handleRejectSuccess}
        />
      )}
    </div>
  );
}
