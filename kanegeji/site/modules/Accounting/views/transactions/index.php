<div class="space-y-5">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e(__('accounting.transactions', 'Miamala')) ?></h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">Jumla: <?= number_format($paginator['total']) ?></p>
        </div>
        <?php if (\App\Core\Auth::can('accounting.create')): ?>
        <a href="/accounting/transactions/create"
           class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            <?= e(__('accounting.add_transaction', 'Ongeza Muamala')) ?>
        </a>
        <?php endif; ?>
    </div>

    <!-- Summary cards -->
    <div class="grid grid-cols-3 gap-3">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Mapato</p>
            <p class="font-bold text-green-600 dark:text-green-400 text-lg"><?= formatCurrency($summary['income']) ?></p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Matumizi</p>
            <p class="font-bold text-red-600 dark:text-red-400 text-lg"><?= formatCurrency($summary['expenses']) ?></p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Salio</p>
            <p class="font-bold text-lg <?= $summary['net'] >= 0 ? 'text-brand-600 dark:text-brand-400' : 'text-red-600 dark:text-red-400' ?>">
                <?= formatCurrency($summary['net']) ?>
            </p>
        </div>
    </div>

    <!-- Filters -->
    <form method="GET" action="/accounting/transactions" class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <select name="type" class="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">Aina zote</option>
                <option value="income"  <?= ($filters['type'] ?? '') === 'income'   ? 'selected' : '' ?>>Mapato</option>
                <option value="expense" <?= ($filters['type'] ?? '') === 'expense'  ? 'selected' : '' ?>>Matumizi</option>
            </select>
            <select name="status" class="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">Hali zote</option>
                <option value="pending"  <?= ($filters['status'] ?? '') === 'pending'  ? 'selected' : '' ?>>Inasubiri</option>
                <option value="approved" <?= ($filters['status'] ?? '') === 'approved' ? 'selected' : '' ?>>Imeidhinishwa</option>
                <option value="rejected" <?= ($filters['status'] ?? '') === 'rejected' ? 'selected' : '' ?>>Imekataliwa</option>
            </select>
            <input type="date" name="date_from" value="<?= e($dateFrom) ?>"
                   class="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            <input type="date" name="date_to" value="<?= e($dateTo) ?>"
                   class="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        </div>
        <div class="flex gap-2 mt-3">
            <button type="submit" class="px-4 py-2 bg-brand-700 text-white text-sm rounded-xl hover:bg-brand-800 transition-colors">Chuja</button>
            <a href="/accounting/transactions" class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Futa</a>
        </div>
    </form>

    <!-- Table -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($paginator['data'])): ?>
        <div class="py-16 text-center">
            <p class="text-gray-400 text-sm">Hakuna miamala iliyopatikana.</p>
        </div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    <tr>
                        <th class="px-5 py-3.5 text-left font-medium">Kumbukumbu</th>
                        <th class="px-5 py-3.5 text-left font-medium">Aina / Kategoria</th>
                        <th class="px-5 py-3.5 text-left font-medium">Tarehe</th>
                        <th class="px-5 py-3.5 text-right font-medium">Kiasi</th>
                        <th class="px-5 py-3.5 text-left font-medium">Hali</th>
                        <th class="px-5 py-3.5 text-right font-medium">Vitendo</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
                    <?php foreach ($paginator['data'] as $tx): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td class="px-5 py-3.5">
                            <p class="font-mono text-xs text-gray-600 dark:text-gray-300"><?= e($tx['reference_no']) ?></p>
                            <p class="text-xs text-gray-400 mt-0.5"><?= e($tx['recorded_by_name'] ?? '') ?></p>
                        </td>
                        <td class="px-5 py-3.5">
                            <span class="inline-block px-2 py-0.5 text-xs rounded-md font-medium mr-2
                                         <?= $tx['type'] === 'income' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' ?>">
                                <?= $tx['type'] === 'income' ? 'Mapato' : 'Matumizi' ?>
                            </span>
                            <span class="text-gray-600 dark:text-gray-300"><?= e($tx['category_name'] ?? $tx['description'] ?? '-') ?></span>
                        </td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-300"><?= e(formatDate($tx['transaction_date'])) ?></td>
                        <td class="px-5 py-3.5 text-right">
                            <span class="font-semibold <?= $tx['type'] === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>">
                                <?= formatCurrency($tx['amount']) ?>
                            </span>
                        </td>
                        <td class="px-5 py-3.5">
                            <span class="inline-block px-2 py-0.5 text-xs rounded-md
                                         <?= match($tx['status']) {
                                             'approved' => 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                                             'pending'  => 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                                             default    => 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                                         } ?>">
                                <?= e(ucfirst($tx['status'])) ?>
                            </span>
                        </td>
                        <td class="px-5 py-3.5 text-right">
                            <a href="/accounting/transactions/<?= $tx['id'] ?>" class="text-brand-600 dark:text-brand-400 hover:underline text-xs font-medium">Angalia</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <!-- Pagination -->
        <?php if ($paginator['last_page'] > 1): ?>
        <div class="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <p class="text-sm text-gray-500 dark:text-gray-400"><?= $paginator['from'] ?>–<?= $paginator['to'] ?> / <?= number_format($paginator['total']) ?></p>
            <div class="flex gap-2">
                <?php if ($paginator['current_page'] > 1): ?>
                <a href="<?= pagePath($paginator['current_page'] - 1) ?>" class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">← Iliyotangulia</a>
                <?php endif; ?>
                <?php if ($paginator['current_page'] < $paginator['last_page']): ?>
                <a href="<?= pagePath($paginator['current_page'] + 1) ?>" class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">Inayofuata →</a>
                <?php endif; ?>
            </div>
        </div>
        <?php endif; ?>
        <?php endif; ?>
    </div>
</div>
