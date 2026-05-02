'use client';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { dashboardApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Users, AlertCircle, DollarSign,
  CheckCircle, Clock, XCircle,
} from 'lucide-react';

const COLORS = ['#1e40af', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

function KpiCard({
  label, value, icon: Icon, color, sub,
}: {
  label: string; value: string | number; icon: any; color: string; sub?: string;
}) {
  return (
    <div className="card flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['kpis'],
    queryFn: () => dashboardApi.kpis(),
  });

  const { data: trend } = useQuery({
    queryKey: ['trend'],
    queryFn: () => dashboardApi.trend(6),
  });

  const { data: breakdown } = useQuery({
    queryKey: ['loan-breakdown'],
    queryFn: () => dashboardApi.loanBreakdown(),
  });

  if (kpisLoading) {
    return (
      <div className="space-y-4 pt-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card h-20 skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-4">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Financial overview</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Total Issued"
          value={formatCurrency(kpis?.totalIssued || 0)}
          icon={DollarSign}
          color="bg-primary-800"
        />
        <KpiCard
          label="Total Repaid"
          value={formatCurrency(kpis?.totalRepaid || 0)}
          icon={CheckCircle}
          color="bg-secondary-600"
          sub={`${kpis?.collectionRate || '0'}% rate`}
        />
        <KpiCard
          label="Outstanding"
          value={formatCurrency(kpis?.totalOutstanding || 0)}
          icon={TrendingUp}
          color="bg-amber-500"
        />
        <KpiCard
          label="Penalties"
          value={formatCurrency(kpis?.totalPenalties || 0)}
          icon={AlertCircle}
          color="bg-red-600"
        />
        <KpiCard
          label="Active Loans"
          value={kpis?.activeLoans || 0}
          icon={Clock}
          color="bg-blue-600"
          sub={`${kpis?.overdueLoans || 0} overdue`}
        />
        <KpiCard
          label="Total Users"
          value={kpis?.totalUsers || 0}
          icon={Users}
          color="bg-purple-600"
          sub={`${kpis?.pendingKyc || 0} pending KYC`}
        />
      </div>

      {/* Loan Trend Chart */}
      {trend && trend.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4">Loan Trend (6 months)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="issued" fill="#1e40af" radius={[4, 4, 0, 0]} name="Issued" />
              <Bar dataKey="repaid" fill="#059669" radius={[4, 4, 0, 0]} name="Repaid" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-3 h-3 rounded bg-primary-800 inline-block" /> Issued
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-3 h-3 rounded bg-secondary-600 inline-block" /> Repaid
            </span>
          </div>
        </div>
      )}

      {/* Loan Status Breakdown */}
      {breakdown && breakdown.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-4">Loan Status</h2>
          <div className="flex items-center gap-4">
            <PieChart width={120} height={120}>
              <Pie
                data={breakdown}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={55}
              >
                {breakdown.map((_: any, index: number) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
            <div className="flex flex-col gap-1.5">
              {breakdown.map((item: any, i: number) => (
                <div key={item.status} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-xs text-gray-600 capitalize">
                    {item.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-semibold text-gray-900 ml-auto">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
