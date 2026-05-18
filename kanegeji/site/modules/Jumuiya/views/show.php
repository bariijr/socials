<div class="max-w-4xl mx-auto space-y-5">
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
            <a href="/jumuiya" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            </a>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($community['name']) ?></h1>
        </div>
        <?php if (\App\Core\Auth::can('jumuiya.manage')): ?>
        <a href="/jumuiya/<?= $community['id'] ?>/edit" class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Hariri</a>
        <?php endif; ?>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p class="text-2xl font-bold text-brand-700 dark:text-brand-400"><?= number_format($community['member_count']) ?></p>
            <p class="text-xs text-gray-400 mt-0.5">Wanachama</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p class="text-lg font-bold text-green-600 dark:text-green-400"><?= formatCurrency(array_sum(array_column($contributions, 'total'))) ?></p>
            <p class="text-xs text-gray-400 mt-0.5">Michango Yote</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p class="text-sm font-bold text-gray-700 dark:text-gray-300"><?= e($community['leader_name'] ?? '-') ?></p>
            <p class="text-xs text-gray-400 mt-0.5">Kiongozi</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p class="text-sm font-bold text-gray-700 dark:text-gray-300"><?= e($community['zone'] ?? '-') ?></p>
            <p class="text-xs text-gray-400 mt-0.5">Kata</p>
        </div>
    </div>

    <!-- Members list -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Wanachama (<?= count($members) ?>)</h3>
        </div>
        <?php if (empty($members)): ?>
        <p class="px-5 py-8 text-center text-sm text-gray-400">Hakuna wanachama bado.</p>
        <?php else: ?>
        <div class="divide-y divide-gray-50 dark:divide-gray-700">
            <?php foreach ($members as $m): ?>
            <a href="/members/<?= $m['id'] ?>" class="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div class="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 text-xs font-bold flex-shrink-0">
                    <?= e(mb_substr($m['first_name'], 0, 1) . mb_substr($m['last_name'], 0, 1)) ?>
                </div>
                <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-white"><?= e($m['first_name'] . ' ' . $m['last_name']) ?></p>
                    <p class="text-xs text-gray-400"><?= e($m['phone'] ?? '-') ?></p>
                </div>
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
            </a>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>
</div>
