<div class="space-y-5">
    <div class="flex items-center gap-3">
        <a href="/admin/parishes" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($parish['name']) ?></h1>
        <span class="px-2 py-0.5 rounded-full text-xs <?= $parish['active'] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500' ?>">
            <?= $parish['active'] ? 'Inafanya kazi' : 'Imesimamishwa' ?>
        </span>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Wanachama</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white mt-1"><?= number_format($stats['members']) ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Miamala</div>
            <div class="text-2xl font-bold text-brand-600 dark:text-brand-400 mt-1"><?= number_format($stats['transactions']) ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Jumla Mapato</div>
            <div class="text-xl font-bold text-green-600 dark:text-green-400 mt-1"><?= formatCurrency($stats['total_income']) ?></div>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Parish details -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-3">
            <h2 class="font-semibold text-gray-900 dark:text-white text-sm">Maelezo ya Parokia</h2>
            <div class="grid grid-cols-2 gap-3 text-sm">
                <div><div class="text-xs text-gray-400">Jimbo</div><div class="text-gray-900 dark:text-white"><?= e($parish['diocese'] ?? '-') ?></div></div>
                <div><div class="text-xs text-gray-400">Simu</div><div class="text-gray-900 dark:text-white"><?= e($parish['phone'] ?? '-') ?></div></div>
                <div class="col-span-2"><div class="text-xs text-gray-400">Anwani</div><div class="text-gray-900 dark:text-white"><?= e($parish['address'] ?? '-') ?></div></div>
                <div class="col-span-2"><div class="text-xs text-gray-400">Barua Pepe</div><div class="text-gray-900 dark:text-white"><?= e($parish['email'] ?? '-') ?></div></div>
            </div>
            <div class="pt-3 border-t border-gray-100 dark:border-gray-700">
                <form method="POST" action="/admin/parishes/<?= $parish['id'] ?>/toggle">
                    <?= csrf_field() ?>
                    <button class="px-4 py-2 text-sm rounded-xl <?= $parish['active'] ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100' ?> font-medium">
                        <?= $parish['active'] ? 'Simamisha Parokia' : 'Amilisha Parokia' ?>
                    </button>
                </form>
            </div>
        </div>

        <!-- Users -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 class="font-semibold text-gray-900 dark:text-white text-sm">Watumiaji (<?= count($users) ?>)</h2>
            </div>
            <?php if (empty($users)): ?>
            <div class="p-8 text-center text-gray-400 text-sm">Hakuna watumiaji.</div>
            <?php else: ?>
            <div class="divide-y divide-gray-100 dark:divide-gray-700">
                <?php foreach ($users as $u): ?>
                <div class="flex items-center gap-3 px-5 py-3">
                    <div class="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        <?= mb_substr($u['name'], 0, 1) ?>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm font-medium text-gray-900 dark:text-white truncate"><?= e($u['name']) ?></div>
                        <div class="text-xs text-gray-400"><?= e($u['email']) ?></div>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400 capitalize"><?= e(str_replace('_',' ',$u['role'])) ?></span>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
    </div>
</div>
