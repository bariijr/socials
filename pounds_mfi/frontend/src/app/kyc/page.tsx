'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { ChevronRight, ChevronLeft, Check, Download, Upload } from 'lucide-react';
import { kycApi } from '@/lib/api';
import Link from 'next/link';

// Steps
const steps = [
  { title: 'Personal Info', icon: '👤' },
  { title: 'Identification', icon: '🪪' },
  { title: 'Address', icon: '📍' },
  { title: 'Employment', icon: '💼' },
];

const step1Schema = z.object({
  fullName: z.string().min(3, 'Full name required'),
  phone: z.string().min(9, 'Valid phone required'),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
});

const step2Schema = z.object({
  idType: z.string().min(1, 'ID type required'),
  idNumber: z.string().min(5, 'ID number required'),
});

const step3Schema = z.object({
  address: z.string().min(5, 'Address required'),
  city: z.string().min(2, 'City required'),
  county: z.string().optional(),
  postalCode: z.string().optional(),
});

const step4Schema = z.object({
  occupation: z.string().optional(),
  employer: z.string().optional(),
  monthlyIncome: z.number().optional(),
});

const schemas = [step1Schema, step2Schema, step3Schema, step4Schema];

export default function PublicKycPage() {
  const [step, setStep] = useState(0);
  const [kycId, setKycId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);

  const form = useForm<any>({
    resolver: zodResolver(schemas[step]),
    mode: 'onChange',
  });

  const onNext = async (data: any) => {
    setLoading(true);
    try {
      let kyc;
      if (!kycId) {
        kyc = await kycApi.createPublic({ ...data, currentStep: step + 1 });
        setKycId(kyc.id);
      } else {
        kyc = await kycApi.updatePublic(kycId, { ...data, currentStep: step + 1 });
      }
      if (step < steps.length - 1) {
        setStep(step + 1);
      } else {
        // Upload document if selected
        if (docFile && kycId) {
          await kycApi.uploadDocument(kycId, docFile, 'national_id_front');
        }
        await kycApi.submitPublic(kycId || kyc.id);
        setSubmitted(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your KYC application has been submitted. We'll review it and contact you shortly.
          </p>
          {kycId && (
            <a
              href={kycApi.pdfUrl(kycId)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex items-center justify-center gap-2 mb-4"
            >
              <Download className="w-4 h-4" /> Download PDF Copy
            </a>
          )}
          <Link href="/" className="text-sm text-primary-700 hover:underline">
            Return to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary-800 text-white py-4 px-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/" className="text-primary-200 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="font-bold text-sm">Loan Application</p>
            <p className="text-primary-300 text-xs">Pounds Microfinance Ltd</p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-6">
        {/* Progress Steps */}
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className={`flex flex-col items-center`}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                    i < step
                      ? 'bg-green-500 text-white'
                      : i === step
                      ? 'bg-primary-800 text-white'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <p className="text-xs text-gray-500 mt-1 hidden sm:block">{s.title}</p>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Form */}
        <div className="bg-white rounded-2xl shadow-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-2xl">{steps[step].icon}</span>
            <div>
              <h2 className="font-bold text-gray-900">{steps[step].title}</h2>
              <p className="text-xs text-gray-400">Step {step + 1} of {steps.length}</p>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
            {step === 0 && (
              <>
                <Field label="Full Name *" error={form.formState.errors.fullName?.message as string}>
                  <input {...form.register('fullName')} className="input" placeholder="John Kamau Njoroge" />
                </Field>
                <Field label="Phone Number *" error={form.formState.errors.phone?.message as string}>
                  <input {...form.register('phone')} className="input" placeholder="+254 700 000 000" />
                </Field>
                <Field label="Email Address">
                  <input {...form.register('email')} type="email" className="input" placeholder="john@example.com" />
                </Field>
                <Field label="Date of Birth">
                  <input {...form.register('dateOfBirth')} type="date" className="input" />
                </Field>
                <Field label="Gender">
                  <select {...form.register('gender')} className="input">
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <Field label="ID Type *" error={form.formState.errors.idType?.message as string}>
                  <select {...form.register('idType')} className="input">
                    <option value="">Select ID type...</option>
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                    <option value="driving_license">Driving License</option>
                  </select>
                </Field>
                <Field label="ID Number *" error={form.formState.errors.idNumber?.message as string}>
                  <input {...form.register('idNumber')} className="input" placeholder="12345678" />
                </Field>
                <Field label="Upload ID Document (Optional)">
                  <div className="border border-dashed border-gray-200 rounded-xl p-4 text-center">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="doc-upload"
                    />
                    <label htmlFor="doc-upload" className="cursor-pointer">
                      <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                      <p className="text-xs text-gray-500">
                        {docFile ? docFile.name : 'Tap to upload ID photo'}
                      </p>
                    </label>
                  </div>
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <Field label="Physical Address *" error={form.formState.errors.address?.message as string}>
                  <input {...form.register('address')} className="input" placeholder="123 Main Street" />
                </Field>
                <Field label="City/Town *" error={form.formState.errors.city?.message as string}>
                  <input {...form.register('city')} className="input" placeholder="Nairobi" />
                </Field>
                <Field label="County">
                  <input {...form.register('county')} className="input" placeholder="Nairobi County" />
                </Field>
                <Field label="Postal Code">
                  <input {...form.register('postalCode')} className="input" placeholder="00100" />
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <Field label="Occupation">
                  <input {...form.register('occupation')} className="input" placeholder="Teacher, Trader, etc." />
                </Field>
                <Field label="Employer / Business Name">
                  <input {...form.register('employer')} className="input" placeholder="ABC Company" />
                </Field>
                <Field label="Monthly Income (KES)">
                  <input
                    {...form.register('monthlyIncome', { valueAsNumber: true })}
                    type="number"
                    className="input"
                    placeholder="50000"
                  />
                </Field>
              </>
            )}

            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <button type="button" onClick={() => setStep(step - 1)} className="btn-secondary flex-1">
                  <ChevronLeft className="w-4 h-4 inline" /> Back
                </button>
              )}
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? 'Saving...' : step === steps.length - 1 ? 'Submit Application' : 'Continue'}
                {!loading && <ChevronRight className="w-4 h-4 inline ml-1" />}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400">
          Your information is secure and encrypted.{' '}
          <Link href="/" className="text-primary-700 hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  label, children, error,
}: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}
