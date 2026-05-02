'use client';
import { useState } from 'react';
import { formatCurrency, calculateLoanInterest } from '@/lib/utils';

const PACKAGES = [
  { name: 'Emergency', rate: 15, freq: 'weekly', min: 1000, max: 20000, fee: 5 },
  { name: 'Starter', rate: 10, freq: 'monthly', min: 5000, max: 50000, fee: 5 },
  { name: 'Business', rate: 8, freq: 'monthly', min: 50000, max: 500000, fee: 5 },
  { name: 'Premium', rate: 6, freq: 'monthly', min: 500000, max: 5000000, fee: 3 },
];

export function LoanCalculator() {
  const [pkg, setPkg] = useState(PACKAGES[1]);
  const [amount, setAmount] = useState(30000);
  const [days, setDays] = useState(30);

  const interest = calculateLoanInterest(amount, pkg.rate, days, pkg.freq);
  const fee = (amount * pkg.fee) / 100;
  const disbursed = amount - fee;
  const total = amount + interest;
  const weekly = total / Math.max(1, Math.ceil(days / 7));

  return (
    <div className="bg-white rounded-2xl shadow-card p-6 space-y-6">
      {/* Package Selection */}
      <div>
        <p className="label">Loan Type</p>
        <div className="grid grid-cols-2 gap-2">
          {PACKAGES.map((p) => (
            <button
              key={p.name}
              onClick={() => {
                setPkg(p);
                setAmount(Math.min(Math.max(amount, p.min), p.max));
              }}
              className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                pkg.name === p.name
                  ? 'bg-primary-800 text-white border-primary-800'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300'
              }`}
            >
              {p.name}
              <span className="block text-xs opacity-70">{p.rate}% / {p.freq}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Amount Slider */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="label mb-0">Loan Amount</p>
          <span className="font-bold text-primary-800">{formatCurrency(amount)}</span>
        </div>
        <input
          type="range"
          min={pkg.min}
          max={pkg.max}
          step={pkg.min}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-primary-800"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{formatCurrency(pkg.min)}</span>
          <span>{formatCurrency(pkg.max)}</span>
        </div>
      </div>

      {/* Duration Slider */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="label mb-0">Duration</p>
          <span className="font-bold text-primary-800">{days} days</span>
        </div>
        <input
          type="range"
          min={7}
          max={365}
          step={7}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-primary-800"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>7 days</span>
          <span>365 days</span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-primary-50 rounded-xl p-4 space-y-2 text-sm">
        {[
          { label: 'Principal', value: formatCurrency(amount) },
          { label: `Interest (${pkg.rate}% ${pkg.freq})`, value: formatCurrency(interest) },
          { label: `Processing Fee (${pkg.fee}%)`, value: `− ${formatCurrency(fee)}` },
          { label: 'You Receive', value: formatCurrency(disbursed), bold: true },
        ].map(({ label, value, bold }) => (
          <div key={label} className="flex justify-between">
            <span className="text-gray-500">{label}</span>
            <span className={bold ? 'font-bold text-primary-800' : ''}>{value}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-primary-200 pt-2 mt-2">
          <span className="font-bold text-gray-900">Total Repayable</span>
          <span className="font-bold text-primary-800 text-base">{formatCurrency(total)}</span>
        </div>
        <p className="text-xs text-center text-gray-400 pt-1">
          ≈ {formatCurrency(weekly)} / week
        </p>
      </div>

      <a
        href="/kyc"
        className="block text-center btn-primary py-3 text-base font-bold"
      >
        Apply Now — Free
      </a>
    </div>
  );
}
