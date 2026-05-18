<div class="space-y-5">
    <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Kampeni</h1>
        <?php if (\App\Core\Auth::can('accounting.create')): ?>
        <a href="/campaigns/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Ongeza Kampeni
        </a>
        <?php endif; ?>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <?php foreach ($campaigns as $c):
            $pct = ($c['target_amount'] ?? 0) > 0 ? min(100, round($c['raised'] / $c['target_amount'] * 100)) : 0;
        ?>
        <a href="/campaigns/<?= $c['id'] ?>" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:shadow-md transition-shadow block">
            <div class="flex items-center justify-between mb-2">
                <span class="inline-block px-2 py-0.5 text-xs rounded-lg <?= match($c['status']) {
                    'active'    => 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                    'completed' => 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                    'draft'     => 'bg-gray-100 dark:bg-gray-700 text-gray-500',
                    default     => 'bg-red-100 dark:bg-red-900/30 text-red-600',
                } ?>">
                    <?= e(ucfirst($c['status'])) ?>
                </span>
            </div>
            <h3 class="font-bold text-gray-900 dark:text-white mb-1 line-clamp-2"><?= e($c['title']) ?></h3>
            <?php if ($c['end_date']): ?>
            <p class="text-xs text-gray-400 mb-3">Inaisha: <?= e(formatDate($c['end_date'])) ?></p>
            <?php endif; ?>
            <div class="space-y-1.5">
                <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span><?= formatCurrency($c['raised']) ?> imekusanywa</span>
                    <?php if ($c['target_amount']): ?>
                    <span><?= $pct ?>% ya <?= formatCurrency($c['target_amount']) ?></span>
                    <?php endif; ?>
                </div>
                <?php if ($c['target_amount']): ?>
                <div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-brand-500 to-brand-700 rounded-full" style="width: <?= $pct ?>%"></div>
                </div>
                <?php endif; ?>
            </div>
        </a>
        <?php endforeach; ?>
    </div>
</div>
