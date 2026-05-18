<div class="space-y-5">
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
            <a href="/reports" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            </a>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($pageTitle) ?></h1>
        </div>
        <?php if (\App\Core\Auth::can('reports.export')): ?>
        <form method="POST" action="/reports/export" class="flex items-center gap-2">
            <?= csrf_field() ?>
            <input type="hidden" name="type" value="<?= e($type) ?>">
            <select name="format" class="text-sm border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                <option value="pdf">PDF</option>
                <option value="excel">Excel</option>
            </select>
            <button type="submit" class="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">
                Hamisha
            </button>
        </form>
        <?php endif; ?>
    </div>

    <!-- Date filter -->
    <form method="GET" class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div class="flex flex-wrap items-end gap-3">
            <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"><?= e(__('reports.from', 'Kutoka')) ?></label>
                <input type="date" name="date_from" value="<?= e($dateFrom) ?>"
                       class="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"><?= e(__('reports.to', 'Hadi')) ?></label>
                <input type="date" name="date_to" value="<?= e($dateTo) ?>"
                       class="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
            <button type="submit" class="px-4 py-2 bg-brand-700 text-white text-sm rounded-xl hover:bg-brand-800 transition-colors">
                <?= e(__('reports.generate', 'Tengeneza')) ?>
            </button>
        </div>
    </form>

    <!-- Summary -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 text-center">
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-1"><?= e(formatDate($dateFrom)) ?> — <?= e(formatDate($dateTo)) ?></p>
        <p class="text-4xl font-black <?= $type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>">
            <?= formatCurrency((float)($summary['total'] ?? 0)) ?>
        </p>
        <p class="text-sm text-gray-400 mt-1"><?= number_format((int)($summary['count'] ?? 0)) ?> miamala</p>
    </div>

    <!-- By category -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Kwa Kategoria</h3>
        </div>
        <?php $grandTotal = max(1, (float)($summary['total'] ?? 1)); ?>
        <div class="divide-y divide-gray-50 dark:divide-gray-700">
            <?php foreach ($byCategory as $cat): ?>
            <div class="px-5 py-3.5">
                <div class="flex items-center justify-between mb-1.5">
                    <span class="text-sm text-gray-700 dark:text-gray-300"><?= e($cat['category'] ?? 'Isiyojulikana') ?></span>
                    <div class="text-right">
                        <span class="text-sm font-semibold text-gray-900 dark:text-white"><?= formatCurrency($cat['total']) ?></span>
                        <span class="text-xs text-gray-400 ml-2"><?= round($cat['total'] / $grandTotal * 100, 1) ?>%</span>
                    </div>
                </div>
                <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full <?= $type === 'income' ? 'bg-green-500' : 'bg-red-500' ?> rounded-full" style="width: <?= min(100, round($cat['total'] / $grandTotal * 100)) ?>%"></div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>

    <!-- Transactions table -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Miamala yote (<?= count($transactions) ?>)</h3>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <tr>
                        <th class="px-5 py-3 text-left font-medium">Kumbukumbu</th>
                        <th class="px-5 py-3 text-left font-medium">Kategoria</th>
                        <th class="px-5 py-3 text-left font-medium">Njia</th>
                        <th class="px-5 py-3 text-left font-medium">Tarehe</th>
                        <th class="px-5 py-3 text-right font-medium">Kiasi</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
                    <?php foreach ($transactions as $tx): ?>
                    <tr>
                        <td class="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400"><?= e($tx['reference_no']) ?></td>
                        <td class="px-5 py-3 text-gray-700 dark:text-gray-300"><?= e($tx['category_name'] ?? '-') ?></td>
                        <td class="px-5 py-3 text-gray-500 dark:text-gray-400"><?= e($tx['payment_method_name'] ?? '-') ?></td>
                        <td class="px-5 py-3 text-gray-500 dark:text-gray-400"><?= e(formatDate($tx['transaction_date'])) ?></td>
                        <td class="px-5 py-3 text-right font-semibold <?= $type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>">
                            <?= formatCurrency($tx['amount']) ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
