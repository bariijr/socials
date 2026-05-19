<div class="space-y-6">
    <!-- Page header -->
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white"><?= e(__('nav.dashboard', 'Dashibodi')) ?></h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5"><?= e($summary['month']) ?></p>
        </div>
        <div class="flex items-center gap-2">
            <?php if (\App\Core\Auth::can('accounting.create')): ?>
            <a href="/accounting/transactions/create"
               class="inline-flex items-center gap-2 px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                <?= e(__('accounting.add_transaction', 'Ongeza Muamala')) ?>
            </a>
            <?php endif; ?>
        </div>
    </div>

    <!-- KPI cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Income -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between mb-3">
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400"><?= e(__('accounting.total_income', 'Mapato')) ?></p>
                <div class="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <svg class="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/>
                    </svg>
                </div>
            </div>
            <p class="text-xl font-bold text-gray-900 dark:text-white"><?= formatCurrency($summary['income']) ?></p>
            <p class="text-xs text-gray-400 mt-1">Mwezi huu</p>
        </div>

        <!-- Expenses -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between mb-3">
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400"><?= e(__('accounting.total_expenses', 'Matumizi')) ?></p>
                <div class="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg class="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6"/>
                    </svg>
                </div>
            </div>
            <p class="text-xl font-bold text-gray-900 dark:text-white"><?= formatCurrency($summary['expenses']) ?></p>
            <p class="text-xs text-gray-400 mt-1">Mwezi huu</p>
        </div>

        <!-- Net balance -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between mb-3">
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400"><?= e(__('accounting.net_balance', 'Salio')) ?></p>
                <div class="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                    <svg class="w-4 h-4 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
            </div>
            <p class="text-xl font-bold <?= $summary['net'] >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>">
                <?= formatCurrency($summary['net']) ?>
            </p>
            <p class="text-xs text-gray-400 mt-1">Mwezi huu</p>
        </div>

        <!-- Members -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between mb-3">
                <p class="text-xs font-medium text-gray-500 dark:text-gray-400"><?= e(__('members.total_members', 'Wanachama')) ?></p>
                <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                </div>
            </div>
            <p class="text-xl font-bold text-gray-900 dark:text-white"><?= number_format($summary['members']) ?></p>
            <p class="text-xs text-gray-400 mt-1"><?= $summary['communities'] ?> jumuiya</p>
        </div>
    </div>

    <!-- Pending approvals alert -->
    <?php if ($summary['pending_tx'] > 0 && \App\Core\Auth::can('accounting.approve')): ?>
    <div class="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
        <svg class="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <p class="text-sm text-amber-800 dark:text-amber-300 flex-1">
            Kuna <strong><?= $summary['pending_tx'] ?></strong> miamala inayosubiri idhini.
        </p>
        <a href="/accounting/transactions?status=pending" class="text-sm font-semibold text-amber-700 dark:text-amber-300 hover:underline">Angalia →</a>
    </div>
    <?php endif; ?>

    <!-- Campaign progress -->
    <?php if ($summary['active_campaigns'] > 0): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Kampeni Zinazoendelea (<?= $summary['active_campaigns'] ?>)</h3>
            <a href="/campaigns" class="text-xs text-brand-600 dark:text-brand-400 hover:underline">Angalia zote</a>
        </div>
        <?php
        $pct = $summary['campaign_target'] > 0
            ? min(100, round($summary['campaign_raised'] / $summary['campaign_target'] * 100))
            : 0;
        ?>
        <div class="space-y-1.5">
            <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span><?= formatCurrency($summary['campaign_raised']) ?> imekusanywa</span>
                <span><?= $pct ?>% ya <?= formatCurrency($summary['campaign_target']) ?></span>
            </div>
            <div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-brand-500 to-brand-700 rounded-full transition-all" style="width: <?= $pct ?>%"></div>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <!-- Income/Expense chart -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Mapato vs Matumizi (Miezi 6)</h3>
            <a href="/reports" class="text-xs text-brand-600 dark:text-brand-400 hover:underline">Ripoti kamili</a>
        </div>
        <canvas id="financeChart" height="80"></canvas>
    </div>

    <!-- Recent transactions + community ranking -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Recent transactions -->
        <div class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Miamala ya Hivi Karibuni</h3>
                <a href="/accounting/transactions" class="text-xs text-brand-600 dark:text-brand-400 hover:underline">Angalia zote</a>
            </div>
            <div class="divide-y divide-gray-50 dark:divide-gray-700">
                <?php if (empty($recentTx)): ?>
                <p class="px-5 py-8 text-center text-sm text-gray-400"><?= e(__('common.no_results', 'Hakuna matokeo.')) ?></p>
                <?php else: ?>
                <?php foreach ($recentTx as $tx): ?>
                <div class="flex items-center gap-3 px-5 py-3.5">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                                <?= $tx['type'] === 'income' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30' ?>">
                        <svg class="w-4 h-4 <?= $tx['type'] === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <?php if ($tx['type'] === 'income'): ?>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/>
                            <?php else: ?>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6"/>
                            <?php endif; ?>
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-900 dark:text-white truncate"><?= e($tx['category_name'] ?? $tx['description'] ?? '-') ?></p>
                        <p class="text-xs text-gray-400"><?= e(formatDate($tx['transaction_date'])) ?></p>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <p class="text-sm font-semibold <?= $tx['type'] === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>">
                            <?= $tx['type'] === 'income' ? '+' : '-' ?><?= formatCurrency($tx['amount']) ?>
                        </p>
                        <span class="inline-block text-xs px-1.5 py-0.5 rounded-md
                                     <?= match($tx['status']) {
                                         'approved' => 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                                         'pending'  => 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                                         default    => 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
                                     } ?>">
                            <?= e(ucfirst($tx['status'])) ?>
                        </span>
                    </div>
                </div>
                <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </div>

        <!-- Community ranking -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 class="font-semibold text-gray-900 dark:text-white text-sm"><?= e(__('jumuiya.ranking', 'Nafasi za Jumuiya')) ?></h3>
                <a href="/jumuiya" class="text-xs text-brand-600 dark:text-brand-400 hover:underline">Zote</a>
            </div>
            <div class="divide-y divide-gray-50 dark:divide-gray-700">
                <?php if (empty($communities)): ?>
                <p class="px-5 py-8 text-center text-sm text-gray-400">Hakuna data.</p>
                <?php else: ?>
                <?php foreach ($communities as $i => $c): ?>
                <div class="flex items-center gap-3 px-5 py-3.5">
                    <span class="w-6 text-center text-xs font-bold <?= $i === 0 ? 'text-gold' : 'text-gray-400' ?>">
                        #<?= $i + 1 ?>
                    </span>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-900 dark:text-white truncate"><?= e($c['name']) ?></p>
                        <p class="text-xs text-gray-400"><?= $c['member_count'] ?> wanachama</p>
                    </div>
                    <p class="text-xs font-semibold text-brand-600 dark:text-brand-400 flex-shrink-0">
                        <?= formatCurrency($c['contributions']) ?>
                    </p>
                </div>
                <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
(function() {
    const labels   = <?= json_encode($chartData['labels']) ?>;
    const income   = <?= json_encode($chartData['income']) ?>;
    const expenses = <?= json_encode($chartData['expenses']) ?>;
    const isDark   = document.documentElement.classList.contains('dark') || localStorage.getItem('darkMode') === '1';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#9ca3af' : '#6b7280';

    new Chart(document.getElementById('financeChart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Mapato',
                    data: income,
                    backgroundColor: 'rgba(34,197,94,0.7)',
                    borderRadius: 6,
                    borderSkipped: false,
                },
                {
                    label: 'Matumizi',
                    data: expenses,
                    backgroundColor: 'rgba(239,68,68,0.7)',
                    borderRadius: 6,
                    borderSkipped: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top', labels: { color: textColor, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => ' TZS ' + ctx.raw.toLocaleString(),
                    },
                },
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor } },
                y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => 'TZS ' + (v/1000).toFixed(0) + 'k' } },
            },
        },
    });
})();
</script>
