'use client';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { Upload, FileText, Check, X, Eye, Plus, Loader2 } from 'lucide-react';
import { receiptsApi } from '@/lib/api';
import { formatCurrency, formatDate, getReceiptStatusColor } from '@/lib/utils';
import { Receipt } from '@/types';
import { cn } from '@/lib/utils';

export default function ReceiptsPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'list' | 'upload' | 'text'>('list');
  const [uploading, setUploading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [textForm, setTextForm] = useState({ receiptNumber: '', amount: '', paymentDate: '', loanId: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['receipts'],
    queryFn: () => receiptsApi.list({ limit: 20 }),
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles[0]) return;
    setUploading(true);
    try {
      const result = await receiptsApi.upload(acceptedFiles[0], {});
      setOcrResult(result);
      toast.success('Receipt uploaded. Please confirm the OCR details.');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Upload failed';
      if (err.response?.status === 409) {
        toast.error(`Duplicate receipt: ${msg}`);
      } else {
        toast.error(msg);
      }
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const confirmOcr = async () => {
    if (!ocrResult) return;
    setConfirming(ocrResult.id);
    try {
      await receiptsApi.confirmOcr(ocrResult.id, ocrResult.ocrRawData?.extracted || {});
      qc.invalidateQueries({ queryKey: ['receipts'] });
      toast.success('Receipt verified!');
      setOcrResult(null);
      setMode('list');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Confirmation failed');
    } finally {
      setConfirming(null);
    }
  };

  const submitText = async () => {
    try {
      await receiptsApi.submitText({
        ...textForm,
        amount: parseFloat(textForm.amount),
      });
      qc.invalidateQueries({ queryKey: ['receipts'] });
      toast.success('Receipt submitted');
      setMode('list');
      setTextForm({ receiptNumber: '', amount: '', paymentDate: '', loanId: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Submission failed');
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Receipts</h1>
          <p className="text-xs text-gray-500">{data?.total || 0} total</p>
        </div>
        {mode === 'list' && (
          <div className="flex gap-2">
            <button onClick={() => setMode('upload')} className="btn-primary text-sm py-2 px-3">
              <Upload className="w-4 h-4 inline mr-1" /> Upload
            </button>
            <button onClick={() => setMode('text')} className="btn-secondary text-sm py-2 px-3">
              <FileText className="w-4 h-4 inline mr-1" /> Text
            </button>
          </div>
        )}
        {mode !== 'list' && (
          <button onClick={() => setMode('list')} className="btn-secondary text-sm py-2 px-3">
            Cancel
          </button>
        )}
      </div>

      {/* Upload Mode */}
      {mode === 'upload' && !ocrResult && (
        <div
          {...getRootProps()}
          className={cn(
            'card border-2 border-dashed cursor-pointer transition-colors text-center py-12',
            isDragActive ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300',
          )}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
              <p className="text-sm text-gray-600">Processing with OCR...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-10 h-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">
                {isDragActive ? 'Drop receipt here' : 'Drag & drop or tap to upload'}
              </p>
              <p className="text-xs text-gray-400">JPG, PNG, PDF up to 10MB</p>
            </div>
          )}
        </div>
      )}

      {/* OCR Confirmation */}
      {ocrResult && (
        <div className="card space-y-4">
          <h2 className="section-title text-amber-700">Confirm OCR Data</h2>
          <p className="text-xs text-gray-500">Review and correct the extracted information</p>
          <div className="space-y-3">
            {['receiptNumber', 'amount', 'date'].map((field) => (
              <div key={field}>
                <label className="label capitalize">{field.replace(/([A-Z])/g, ' $1')}</label>
                <input
                  type="text"
                  defaultValue={ocrResult.ocrRawData?.extracted?.[field] || ''}
                  onChange={(e) => {
                    const updated = { ...ocrResult };
                    if (!updated.ocrRawData) updated.ocrRawData = { extracted: {} };
                    updated.ocrRawData.extracted[field] = e.target.value;
                    setOcrResult(updated);
                  }}
                  className="input"
                  placeholder={`Enter ${field}...`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={confirmOcr} disabled={!!confirming} className="btn-primary flex-1">
              {confirming ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : <Check className="w-4 h-4 inline mr-1" />}
              Confirm & Verify
            </button>
            <button onClick={() => setOcrResult(null)} className="btn-secondary">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Text Input Mode */}
      {mode === 'text' && (
        <div className="card space-y-4">
          <h2 className="section-title">Manual Receipt Entry</h2>
          {Object.entries(textForm).map(([key, value]) => (
            key !== 'loanId' && (
              <div key={key}>
                <label className="label capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                <input
                  type={key === 'amount' ? 'number' : key === 'paymentDate' ? 'date' : 'text'}
                  value={value}
                  onChange={(e) => setTextForm({ ...textForm, [key]: e.target.value })}
                  className="input"
                />
              </div>
            )
          ))}
          <button onClick={submitText} className="btn-primary w-full">Submit Receipt</button>
        </div>
      )}

      {/* Receipts List */}
      {mode === 'list' && (
        <div className="space-y-3">
          {isLoading && [...Array(3)].map((_, i) => <div key={i} className="card h-20 skeleton" />)}
          {!isLoading && data?.items?.length === 0 && (
            <div className="card text-center py-12">
              <p className="text-gray-400 text-sm">No receipts found</p>
            </div>
          )}
          {data?.items?.map((receipt: Receipt) => (
            <div key={receipt.id} className="card">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-sm">{receipt.receiptNumber}</p>
                  <p className="text-xs text-gray-500">{receipt.payerName || 'Unknown payer'}</p>
                </div>
                <span className={`badge ${getReceiptStatusColor(receipt.status)} capitalize`}>
                  {receipt.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-primary-800">{formatCurrency(receipt.amount)}</span>
                <span className="text-xs text-gray-400">
                  {receipt.paymentDate ? formatDate(receipt.paymentDate) : formatDate(receipt.createdAt)}
                </span>
              </div>
              {receipt.ocrProcessed && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> OCR processed
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
