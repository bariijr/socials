import Link from 'next/link';
import { LandingHero } from '@/components/landing/LandingHero';
import { LoanCalculator } from '@/components/landing/LoanCalculator';

export default function LandingPage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Pounds Microfinance Ltd';

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-800 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-black">£</span>
            </div>
            <span className="font-bold text-gray-900 text-sm">{appName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/kyc" className="text-sm text-primary-700 font-medium hover:underline">
              Apply Now
            </Link>
            <Link href="/login" className="btn-primary text-sm py-2 px-4">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-black leading-tight mb-4">
            Financial Empowerment<br />for Everyone
          </h1>
          <p className="text-primary-200 text-base mb-8">
            Fast, transparent, and affordable loans for individuals and businesses.
            Apply online in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/kyc" className="bg-white text-primary-800 font-bold py-3 px-8 rounded-xl hover:bg-primary-50 transition-colors">
              Apply for a Loan
            </Link>
            <a href="#calculator" className="border border-white/30 text-white font-medium py-3 px-8 rounded-xl hover:bg-white/10 transition-colors">
              Loan Calculator
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-12 px-4 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">Why Choose Us</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: '⚡', title: 'Fast Approval', desc: 'Get approved within 24 hours of submitting your application.' },
            { icon: '🔒', title: 'Secure & Trusted', desc: 'Your data is protected with bank-grade security and encryption.' },
            { icon: '💰', title: 'Flexible Terms', desc: 'Choose loan amounts and repayment terms that suit your needs.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="text-center p-6 rounded-2xl bg-gray-50">
              <div className="text-4xl mb-3">{icon}</div>
              <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Loan Calculator */}
      <section id="calculator" className="py-12 px-4 bg-gray-50">
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">Loan Calculator</h2>
          <p className="text-center text-gray-500 text-sm mb-8">
            Estimate your repayments before applying
          </p>
          <LoanCalculator />
        </div>
      </section>

      {/* Apply CTA */}
      <section className="py-16 px-4 bg-primary-800 text-white text-center">
        <h2 className="text-2xl font-bold mb-4">Ready to Apply?</h2>
        <p className="text-primary-200 mb-8">
          Complete your KYC application online. It takes less than 5 minutes.
        </p>
        <Link href="/kyc" className="inline-block bg-white text-primary-800 font-bold py-3 px-10 rounded-xl hover:bg-primary-50 transition-colors">
          Start Application
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-gray-900 text-gray-400 text-center text-xs">
        <p>© {new Date().getFullYear()} {appName}. All rights reserved.</p>
        <p className="mt-1">Licensed microfinance institution</p>
      </footer>
    </div>
  );
}
