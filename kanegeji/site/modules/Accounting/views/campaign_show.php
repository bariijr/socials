<?php $pct = ($campaign['target_amount'] ?? 0) > 0 ? min(100, round($campaign['raised'] / $campaign['target_amount'] * 100)) : 0; ?>
<div class="max-w-3xl mx-auto space-y-5">
    <div class="flex items-center gap-3">
        <a href="/campaigns" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($campaign['title']) ?></h1>
    </div>

    <!-- Progress card -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div class="flex items-center justify-between mb-4">
            <span class="text-2xl font-black text-green-600 dark:text-green-400"><?= formatCurrency($campaign['raised']) ?></span>
            <?php if ($campaign['target_amount']): ?>
            <span class="text-sm text-gray-400">lengo: <?= formatCurrency($campaign['target_amount']) ?></span>
            <?php endif; ?>
        </div>
        <?php if ($campaign['target_amount']): ?>
        <div class="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
            <div class="h-full bg-gradient-to-r from-brand-500 to-brand-700 rounded-full transition-all" style="width: <?= $pct ?>%"></div>
        </div>
        <p class="text-xs text-gray-400"><?= $pct ?>% ya lengo imefikiwa</p>
        <?php endif; ?>
        <?php if ($campaign['description']): ?>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-4"><?= e($campaign['description']) ?></p>
        <?php endif; ?>
    </div>

    <!-- Contributions -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Michango (<?= count($contributions) ?>)</h3>
        </div>
        <div class="divide-y divide-gray-50 dark:divide-gray-700">
            <?php if (empty($contributions)): ?>
            <p class="px-5 py-6 text-center text-sm text-gray-400">Hakuna michango bado.</p>
            <?php else: ?>
            <?php foreach ($contributions as $c): ?>
            <div class="flex items-center gap-3 px-5 py-3.5">
                <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                        <?= $c['anonymous'] ? 'Anonymous' : e(($c['first_name'] ? $c['first_name'] . ' ' . $c['last_name'] : ($c['donor_name'] ?? '-'))) ?>
                    </p>
                    <p class="text-xs text-gray-400"><?= e($c['community_name'] ?? '') ?> &bull; <?= e(formatDate($c['created_at'])) ?></p>
                </div>
                <p class="font-semibold text-green-600 dark:text-green-400"><?= formatCurrency($c['amount']) ?></p>
            </div>
            <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>
</div>
