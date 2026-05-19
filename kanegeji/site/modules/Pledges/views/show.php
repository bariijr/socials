<?php
$pct = $pledge['amount_pledged'] > 0 ? min(100, round($pledge['amount_paid'] / $pledge['amount_pledged'] * 100)) : 0;
$remaining = max(0, $pledge['amount_pledged'] - $pledge['amount_paid']);
$sc = ['pending'=>'yellow','partial'=>'blue','fulfilled'=>'green','defaulted'=>'red'][$pledge['status']] ?? 'gray';
?>
<div class="space-y-5 max-w-xl">
    <div class="flex items-center gap-3">
        <a href="/pledges" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Ahadi — <?= e($pledge['donor_name'] ?? ($pledge['first_name'] . ' ' . $pledge['last_name'])) ?></h1>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div class="flex items-center justify-between">
            <div>
                <div class="text-xs text-gray-400">Kampeni</div>
                <div class="font-semibold text-gray-900 dark:text-white mt-0.5"><?= e($pledge['campaign_title'] ?? '-') ?></div>
            </div>
            <span class="px-3 py-1 rounded-full text-sm bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize font-medium"><?= e($pledge['status']) ?></span>
        </div>

        <div class="space-y-2">
            <div class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Maendeleo ya Malipo</span>
                <span class="font-semibold text-gray-900 dark:text-white"><?= $pct ?>%</span>
            </div>
            <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3">
                <div class="bg-brand-600 h-3 rounded-full transition-all" style="width:<?= $pct ?>%"></div>
            </div>
            <div class="flex justify-between text-xs text-gray-400">
                <span>Amelipa: <?= formatCurrency($pledge['amount_paid']) ?></span>
                <span>Jumla: <?= formatCurrency($pledge['amount_pledged']) ?></span>
            </div>
        </div>

        <div class="pt-3 grid grid-cols-2 gap-4 text-sm border-t border-gray-100 dark:border-gray-700">
            <div><div class="text-xs text-gray-400">Baki</div><div class="font-bold text-<?= $remaining > 0 ? 'red-600 dark:text-red-400' : 'green-600 dark:text-green-400' ?> mt-0.5"><?= formatCurrency($remaining) ?></div></div>
            <div><div class="text-xs text-gray-400">Tarehe ya Mwisho</div><div class="text-gray-900 dark:text-white mt-0.5"><?= $pledge['due_date'] ? formatDate($pledge['due_date']) : '-' ?></div></div>
            <?php if ($pledge['phone']): ?><div><div class="text-xs text-gray-400">Simu</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($pledge['phone']) ?></div></div><?php endif; ?>
            <?php if ($pledge['notes']): ?><div class="col-span-2"><div class="text-xs text-gray-400">Maelezo</div><div class="text-gray-700 dark:text-gray-300 mt-0.5"><?= nl2br(e($pledge['notes'])) ?></div></div><?php endif; ?>
        </div>
    </div>

    <?php if ($pledge['status'] !== 'fulfilled' && auth()->can('accounting.create') && $remaining > 0): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 class="font-semibold text-gray-900 dark:text-white mb-4">Rekodi Malipo</h2>
        <form method="POST" action="/pledges/<?= $pledge['id'] ?>/payment" class="flex items-end gap-3">
            <?= csrf_field() ?>
            <div class="flex-1">
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Kiasi Kilicholipwa (TZS)</label>
                <input type="number" name="payment_amount" max="<?= $remaining ?>" min="1" step="0.01" required class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
            <button type="submit" class="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 flex-shrink-0">Hifadhi</button>
        </form>
    </div>
    <?php endif; ?>
</div>
