<?php
$title = 'Dashboard — Pounds MFI';
$page  = 'dashboard';
$chartjs = true;
?>
<?php ob_start(); ?>

<div x-data="dashboard()" x-init="loadData()">
    <!-- KPI Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Active Loans</div>
            <div class="text-2xl font-bold text-gray-900" x-text="kpis.activeLoans ?? '—'"></div>
            <div class="text-xs text-gray-400 mt-1">Currently disbursed</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Overdue</div>
            <div class="text-2xl font-bold text-red-600" x-text="kpis.overdueLoans ?? '—'"></div>
            <div class="text-xs text-gray-400 mt-1">Past due date</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Outstanding</div>
            <div class="text-2xl font-bold text-gray-900" x-text="kpis.totalOutstanding ? fmt(kpis.totalOutstanding) : '—'"></div>
            <div class="text-xs text-gray-400 mt-1">Total balance due</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Collection Rate</div>
            <div class="text-2xl font-bold text-green-600" x-text="kpis.collectionRate ? kpis.collectionRate + '%' : '—'"></div>
            <div class="text-xs text-gray-400 mt-1">All time</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Total Issued</div>
            <div class="text-2xl font-bold text-gray-900" x-text="kpis.totalIssued ? fmt(kpis.totalIssued) : '—'"></div>
            <div class="text-xs text-gray-400 mt-1">Disbursed value</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Total Repaid</div>
            <div class="text-2xl font-bold text-gray-900" x-text="kpis.totalRepaid ? fmt(kpis.totalRepaid) : '—'"></div>
            <div class="text-xs text-gray-400 mt-1">Collected amount</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Total Users</div>
            <div class="text-2xl font-bold text-gray-900" x-text="kpis.totalUsers ?? '—'"></div>
            <div class="text-xs text-gray-400 mt-1">Registered borrowers</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Pending KYC</div>
            <div class="text-2xl font-bold text-amber-600" x-text="kpis.pendingKyc ?? '—'"></div>
            <div class="text-xs text-gray-400 mt-1">Awaiting review</div>
        </div>
    </div>

    <!-- Charts row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <h2 class="text-sm font-semibold text-gray-700 mb-4">Loan Trend (6 Months)</h2>
            <canvas id="trendChart" height="180"></canvas>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <h2 class="text-sm font-semibold text-gray-700 mb-4">Loan Status Breakdown</h2>
            <canvas id="breakdownChart" height="180"></canvas>
        </div>
    </div>

    <!-- Recent Activity -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-sm font-semibold text-gray-700">Recent Loans</h2>
                <a href="/loans" class="text-xs text-blue-600 hover:underline">View all</a>
            </div>
            <div class="space-y-2" x-show="!loading">
                <template x-for="loan in activity.recentLoans" :key="loan.id">
                    <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div>
                            <div class="text-sm font-medium text-gray-900" x-text="loan.loanNumber"></div>
                            <div class="text-xs text-gray-500" x-text="loan.firstName + ' ' + loan.lastName"></div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm font-medium" x-text="fmt(loan.principalAmount)"></div>
                            <span class="text-xs px-2 py-0.5 rounded-full" :class="statusClass(loan.status)" x-text="loan.status"></span>
                        </div>
                    </div>
                </template>
                <div x-show="!activity.recentLoans?.length" class="text-sm text-gray-400 py-4 text-center">No recent loans</div>
            </div>
            <div x-show="loading" class="py-6 flex justify-center"><div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-sm font-semibold text-gray-700">Recent Repayments</h2>
                <a href="/receipts" class="text-xs text-blue-600 hover:underline">View all</a>
            </div>
            <div class="space-y-2" x-show="!loading">
                <template x-for="r in activity.recentRepayments" :key="r.id">
                    <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div>
                            <div class="text-sm font-medium text-gray-900" x-text="r.loanNumber"></div>
                            <div class="text-xs text-gray-500" x-text="r.paymentDate"></div>
                        </div>
                        <div class="text-sm font-medium text-green-600" x-text="fmt(r.amount)"></div>
                    </div>
                </template>
                <div x-show="!activity.recentRepayments?.length" class="text-sm text-gray-400 py-4 text-center">No recent repayments</div>
            </div>
        </div>
    </div>
</div>

<script>
function dashboard() {
    return {
        kpis: {}, activity: { recentLoans: [], recentRepayments: [] }, loading: true,

        async loadData() {
            const token = localStorage.getItem('access_token');
            if (!token) return;
            try {
                const [kRes, aRes, tRes, bRes] = await Promise.all([
                    fetch('/api/dashboard/kpis', { headers: { Authorization: 'Bearer ' + token } }),
                    fetch('/api/dashboard/activity', { headers: { Authorization: 'Bearer ' + token } }),
                    fetch('/api/dashboard/trend', { headers: { Authorization: 'Bearer ' + token } }),
                    fetch('/api/dashboard/breakdown', { headers: { Authorization: 'Bearer ' + token } }),
                ]);
                this.kpis = await kRes.json();
                this.activity = await aRes.json();
                const trend = await tRes.json();
                const breakdown = await bRes.json();
                this.loading = false;
                this.$nextTick(() => this.renderCharts(trend, breakdown));
            } catch { this.loading = false; }
        },

        renderCharts(trend, breakdown) {
            new Chart(document.getElementById('trendChart'), {
                type: 'line',
                data: {
                    labels: trend.map(t => t.month),
                    datasets: [
                        { label: 'Issued', data: trend.map(t => t.issued), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 },
                        { label: 'Repaid', data: trend.map(t => t.repaid), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3 },
                    ]
                },
                options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
            });
            const colors = { draft:'#94a3b8', submitted:'#f59e0b', approved:'#3b82f6', disbursed:'#10b981', overdue:'#ef4444', closed:'#6366f1', rejected:'#9ca3af' };
            new Chart(document.getElementById('breakdownChart'), {
                type: 'doughnut',
                data: {
                    labels: breakdown.map(b => b.status),
                    datasets: [{ data: breakdown.map(b => b.count), backgroundColor: breakdown.map(b => colors[b.status] ?? '#d1d5db') }]
                },
                options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
            });
        },

        fmt(n) { return 'TZS ' + Number(n).toLocaleString(); },
        statusClass(s) {
            return { draft:'bg-gray-100 text-gray-600', submitted:'bg-amber-100 text-amber-700', approved:'bg-blue-100 text-blue-700', disbursed:'bg-green-100 text-green-700', overdue:'bg-red-100 text-red-700', closed:'bg-purple-100 text-purple-700', rejected:'bg-gray-100 text-gray-500' }[s] ?? 'bg-gray-100 text-gray-600';
        }
    };
}
</script>

<?php $slot = ob_get_clean(); require __DIR__ . '/../layouts/app.php'; ?>
