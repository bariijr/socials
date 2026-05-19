<div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Ulinganisho wa Fedha</h1>
        <div class="flex gap-2">
            <?php for ($y = date('Y'); $y >= date('Y') - 4; $y--): ?>
            <a href="?year=<?= $y ?>" class="px-3 py-1.5 text-sm rounded-lg font-medium
               <?= $year == $y ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' ?>">
                <?= $y ?>
            </a>
            <?php endfor; ?>
        </div>
    </div>

    <!-- Summary cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <?php
        $thisIncome   = array_sum(array_column($thisYear, 'income'));
        $thisExpense  = array_sum(array_column($thisYear, 'expense'));
        $prevIncome   = array_sum(array_column($prevYear, 'income'));
        $prevExpense  = array_sum(array_column($prevYear, 'expense'));
        $incomeChange = $prevIncome > 0 ? (($thisIncome - $prevIncome) / $prevIncome * 100) : 0;
        $expenseChange= $prevExpense > 0 ? (($thisExpense - $prevExpense) / $prevExpense * 100) : 0;
        ?>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Mapato <?= $year ?></div>
            <div class="text-xl font-bold text-green-600 dark:text-green-400 mt-1"><?= formatCurrency($thisIncome) ?></div>
            <div class="text-xs <?= $incomeChange >= 0 ? 'text-green-500' : 'text-red-500' ?> mt-0.5">
                <?= $incomeChange >= 0 ? '↑' : '↓' ?> <?= abs(round($incomeChange, 1)) ?>% vs <?= $year - 1 ?>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Matumizi <?= $year ?></div>
            <div class="text-xl font-bold text-red-600 dark:text-red-400 mt-1"><?= formatCurrency($thisExpense) ?></div>
            <div class="text-xs <?= $expenseChange <= 0 ? 'text-green-500' : 'text-red-500' ?> mt-0.5">
                <?= $expenseChange >= 0 ? '↑' : '↓' ?> <?= abs(round($expenseChange, 1)) ?>% vs <?= $year - 1 ?>
            </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Faida <?= $year ?></div>
            <?php $surplus = $thisIncome - $thisExpense; ?>
            <div class="text-xl font-bold <?= $surplus >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?> mt-1"><?= formatCurrency(abs($surplus)) ?></div>
            <div class="text-xs text-gray-400"><?= $surplus >= 0 ? 'Faida' : 'Hasara' ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Faida <?= $year - 1 ?></div>
            <?php $prevSurplus = $prevIncome - $prevExpense; ?>
            <div class="text-xl font-bold <?= $prevSurplus >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?> mt-1"><?= formatCurrency(abs($prevSurplus)) ?></div>
            <div class="text-xs text-gray-400"><?= $prevSurplus >= 0 ? 'Faida' : 'Hasara' ?></div>
        </div>
    </div>

    <!-- Chart -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h3 class="font-semibold text-gray-900 dark:text-white text-sm mb-4">Mapato vs Matumizi — Kila Mwezi</h3>
        <canvas id="comparisonChart" height="80"></canvas>
    </div>

    <!-- Monthly table -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Jedwali la Kila Mwezi</h3>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3">Mwezi</th>
                        <th class="text-right px-5 py-3">Mapato <?= $year ?></th>
                        <th class="text-right px-5 py-3">Mapato <?= $year-1 ?></th>
                        <th class="text-right px-5 py-3">Matumizi <?= $year ?></th>
                        <th class="text-right px-5 py-3">Matumizi <?= $year-1 ?></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php
                    $monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ago','Sep','Okt','Nov','Des'];
                    $thisMap = array_column($thisYear, null, 'month');
                    $prevMap = array_column($prevYear, null, 'month');
                    for ($m = 1; $m <= 12; $m++):
                        $mk = str_pad($m, 2, '0', STR_PAD_LEFT);
                        $ti = (float) ($thisMap[$year . '-' . $mk]['income']  ?? 0);
                        $te = (float) ($thisMap[$year . '-' . $mk]['expense'] ?? 0);
                        $pi = (float) ($prevMap[($year-1) . '-' . $mk]['income']  ?? 0);
                        $pe = (float) ($prevMap[($year-1) . '-' . $mk]['expense'] ?? 0);
                    ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3 font-medium text-gray-900 dark:text-white"><?= $monthNames[$m-1] ?></td>
                        <td class="px-5 py-3 text-right text-green-600 dark:text-green-400"><?= $ti > 0 ? formatCurrency($ti) : '—' ?></td>
                        <td class="px-5 py-3 text-right text-gray-400"><?= $pi > 0 ? formatCurrency($pi) : '—' ?></td>
                        <td class="px-5 py-3 text-right text-red-600 dark:text-red-400"><?= $te > 0 ? formatCurrency($te) : '—' ?></td>
                        <td class="px-5 py-3 text-right text-gray-400"><?= $pe > 0 ? formatCurrency($pe) : '—' ?></td>
                    </tr>
                    <?php endfor; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
<?php
$months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ago','Sep','Okt','Nov','Des'];
$labels = json_encode($months);
$thisInc = $thisSep = $prevInc = $prevSep = [];
for ($m = 1; $m <= 12; $m++) {
    $mk = date('Y') != $year ? ($year . '-' . str_pad($m, 2, '0', STR_PAD_LEFT)) : (date('Y') . '-' . str_pad($m, 2, '0', STR_PAD_LEFT));
    $mk = $year . '-' . str_pad($m, 2, '0', STR_PAD_LEFT);
    $pm = ($year-1) . '-' . str_pad($m, 2, '0', STR_PAD_LEFT);
    $thisInc[]= (float)($thisMap[$mk]['income']  ?? 0);
    $thisSep[]= (float)($thisMap[$mk]['expense'] ?? 0);
    $prevInc[]= (float)($prevMap[$pm]['income']  ?? 0);
    $prevSep[]= (float)($prevMap[$pm]['expense'] ?? 0);
}
?>
new Chart(document.getElementById('comparisonChart'), {
    type: 'bar',
    data: {
        labels: <?= $labels ?>,
        datasets: [
            { label: 'Mapato <?= $year ?>',   data: <?= json_encode($thisInc) ?>, backgroundColor: 'rgba(34,197,94,0.7)' },
            { label: 'Mapato <?= $year-1 ?>', data: <?= json_encode($prevInc) ?>, backgroundColor: 'rgba(34,197,94,0.25)' },
            { label: 'Matumizi <?= $year ?>',   data: <?= json_encode($thisSep) ?>, backgroundColor: 'rgba(239,68,68,0.7)' },
            { label: 'Matumizi <?= $year-1 ?>', data: <?= json_encode($prevSep) ?>, backgroundColor: 'rgba(239,68,68,0.25)' },
        ]
    },
    options: { responsive: true, plugins: { legend: { position: 'top' } } }
});
</script>
