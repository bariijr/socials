<div class="space-y-5">
    <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e(__('jumuiya.title', 'Jumuiya')) ?></h1>
        <?php if (\App\Core\Auth::can('jumuiya.manage')): ?>
        <a href="/jumuiya/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            <?= e(__('jumuiya.add_jumuiya', 'Ongeza Jumuiya')) ?>
        </a>
        <?php endif; ?>
    </div>

    <!-- Ranking grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <?php foreach ($communities as $i => $c): ?>
        <a href="/jumuiya/<?= $c['id'] ?>"
           class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:shadow-md transition-shadow block">
            <div class="flex items-center justify-between mb-3">
                <span class="text-2xl font-black <?= $i === 0 ? 'text-yellow-500' : ($i === 1 ? 'text-gray-400' : ($i === 2 ? 'text-amber-600' : 'text-gray-300 dark:text-gray-600')) ?>">#<?= $i + 1 ?></span>
                <span class="text-xs px-2 py-0.5 rounded-lg <?= $c['active'] ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500' ?>">
                    <?= $c['active'] ? 'Hai' : 'Imefungwa' ?>
                </span>
            </div>
            <h3 class="font-bold text-gray-900 dark:text-white text-lg mb-1"><?= e($c['name']) ?></h3>
            <?php if ($c['zone']): ?>
            <p class="text-xs text-gray-400 mb-3"><?= e($c['zone']) ?></p>
            <?php endif; ?>
            <div class="flex items-center justify-between">
                <div class="text-center">
                    <p class="text-lg font-bold text-brand-700 dark:text-brand-400"><?= number_format($c['member_count']) ?></p>
                    <p class="text-xs text-gray-400">Wanachama</p>
                </div>
                <div class="text-center">
                    <p class="text-lg font-bold text-green-600 dark:text-green-400"><?= formatCurrency($c['contributions_this_year']) ?></p>
                    <p class="text-xs text-gray-400">Mchango <?= date('Y') ?></p>
                </div>
            </div>
            <?php if ($c['leader_name']): ?>
            <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <p class="text-xs text-gray-400">Kiongozi: <span class="text-gray-700 dark:text-gray-300 font-medium"><?= e($c['leader_name']) ?></span></p>
            </div>
            <?php endif; ?>
        </a>
        <?php endforeach; ?>
    </div>
</div>
