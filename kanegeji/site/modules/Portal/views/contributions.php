<div class="space-y-5">
    <div class="flex items-center gap-3">
        <a href="/portal" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Michango Yangu</h1>
    </div>

    <div class="grid grid-cols-2 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Jumla Mwaka Huu</div>
            <div class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1"><?= formatCurrency($yearTotal) ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Idadi ya Michango</div>
            <div class="text-2xl font-bold text-brand-600 dark:text-brand-400 mt-1"><?= number_format($total) ?></div>
        </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna michango iliyoandikwa bado.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Tarehe</th>
                        <th class="text-left px-5 py-3.5">Maelezo</th>
                        <th class="text-right px-5 py-3.5">Kiasi</th>
                        <th class="text-center px-5 py-3.5">Hali</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $r): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400 whitespace-nowrap"><?= formatDate($r['transaction_date']) ?></td>
                        <td class="px-5 py-3.5 text-gray-900 dark:text-white"><?= e($r['category_name'] ?? $r['description'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-right font-semibold text-green-600 dark:text-green-400"><?= formatCurrency($r['amount']) ?></td>
                        <td class="px-5 py-3.5 text-center">
                            <span class="px-2 py-0.5 rounded-full text-xs <?= $r['status'] === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700' ?>"><?= e($r['status'] === 'approved' ? 'Imethibitishwa' : 'Inasubiri') ?></span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php if ($total > $perPage): ?>
        <div class="flex justify-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <?php for ($pg = 1; $pg <= ceil($total/$perPage); $pg++): ?>
            <a href="?page=<?= $pg ?>" class="px-3 py-1.5 text-sm rounded-lg <?= $pg == $page ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' ?>"><?= $pg ?></a>
            <?php endfor; ?>
        </div>
        <?php endif; ?>
        <?php endif; ?>
    </div>
</div>
