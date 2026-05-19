<div class="space-y-5">
    <div class="flex items-center gap-3">
        <a href="/portal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Risiti Zangu</h1>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna risiti bado.</div>
        <?php else: ?>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($rows as $r): ?>
            <div class="flex items-center gap-4 px-5 py-4">
                <div class="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-900 dark:text-white text-sm"><?= e($r['description'] ?? 'Mchango') ?></div>
                    <div class="text-xs text-gray-400"><?= formatDate($r['transaction_date']) ?> · <?= e($r['receipt_number'] ?? $r['id']) ?></div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="font-bold text-green-600 dark:text-green-400"><?= formatCurrency($r['amount']) ?></div>
                    <a href="/accounting/receipts/<?= $r['transaction_id'] ?>" class="text-xs text-brand-600 dark:text-brand-400 hover:underline">Pakua PDF</a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>
</div>
