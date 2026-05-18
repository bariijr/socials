<div class="space-y-5">
    <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Bajeti <?= $year ?></h1>
        <div class="flex gap-2">
            <a href="?year=<?= $year - 1 ?>" class="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600">&larr; <?= $year - 1 ?></a>
            <a href="?year=<?= $year + 1 ?>" class="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600"><?= $year + 1 ?> &rarr;</a>
        </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <tr>
                        <th class="px-5 py-3.5 text-left font-medium">Kategoria</th>
                        <th class="px-5 py-3.5 text-right font-medium">Bajeti</th>
                        <th class="px-5 py-3.5 text-right font-medium">Halisi</th>
                        <th class="px-5 py-3.5 text-right font-medium">Tofauti</th>
                        <th class="px-5 py-3.5 text-left font-medium">Maendeleo</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
                    <?php if (empty($budgets)): ?>
                    <tr><td colspan="5" class="px-5 py-8 text-center text-gray-400">Hakuna bajeti iliyowekwa kwa <?= $year ?>.</td></tr>
                    <?php else: ?>
                    <?php foreach ($budgets as $b):
                        $pct  = $b['amount'] > 0 ? min(100, round($b['spent'] / $b['amount'] * 100)) : 0;
                        $diff = $b['amount'] - $b['spent'];
                    ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-5 py-3.5 font-medium text-gray-900 dark:text-white"><?= e($b['category_name'] ?? 'Isiyojulikana') ?></td>
                        <td class="px-5 py-3.5 text-right text-gray-700 dark:text-gray-300"><?= formatCurrency($b['amount']) ?></td>
                        <td class="px-5 py-3.5 text-right text-gray-700 dark:text-gray-300"><?= formatCurrency($b['spent']) ?></td>
                        <td class="px-5 py-3.5 text-right font-semibold <?= $diff >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>"><?= formatCurrency(abs($diff)) ?></td>
                        <td class="px-5 py-3.5">
                            <div class="flex items-center gap-2">
                                <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full <?= $pct > 90 ? 'bg-red-500' : ($pct > 70 ? 'bg-amber-500' : 'bg-green-500') ?>" style="width: <?= $pct ?>%"></div>
                                </div>
                                <span class="text-xs text-gray-400 w-10 text-right"><?= $pct ?>%</span>
                            </div>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
