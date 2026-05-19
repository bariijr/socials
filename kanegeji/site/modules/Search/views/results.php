<div class="space-y-6">
    <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Matokeo ya Utafutaji</h1>
        <?php if ($q): ?>
        <p class="text-sm text-gray-500 mt-0.5">
            "<?= e($q) ?>" — <?= $total ?> matokeo
        </p>
        <?php endif; ?>
    </div>

    <!-- Search bar -->
    <form method="GET" action="/search" class="flex gap-2">
        <input type="search" name="q" value="<?= e($q) ?>"
               placeholder="Tafuta wanachama, miamala, matukio..."
               autofocus
               class="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
        <button type="submit"
                class="px-5 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            Tafuta
        </button>
    </form>

    <?php if (!$q): ?>
    <div class="text-center text-gray-400 text-sm py-12">Andika neno la kutafuta hapo juu.</div>
    <?php elseif ($total === 0): ?>
    <div class="text-center text-gray-400 text-sm py-12">Hakuna matokeo kwa "<?= e($q) ?>".</div>
    <?php else: ?>

    <?php if (!empty($members)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <svg class="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Wanachama</h3>
            <span class="ml-auto text-xs text-gray-400"><?= count($members) ?></span>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($members as $m): ?>
            <a href="/members/<?= $m['id'] ?>" class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-sm flex-shrink-0">
                    <?= mb_substr($m['first_name'], 0, 1) . mb_substr($m['last_name'], 0, 1) ?>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 dark:text-white"><?= e($m['first_name'] . ' ' . $m['last_name']) ?></div>
                    <div class="text-xs text-gray-400"><?= e($m['member_number'] ?? '') ?><?= $m['phone'] ? ' · ' . e($m['phone']) : '' ?></div>
                </div>
                <svg class="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </a>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

    <?php if (!empty($transactions)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Miamala</h3>
            <span class="ml-auto text-xs text-gray-400"><?= count($transactions) ?></span>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($transactions as $t): ?>
            <a href="/accounting/transactions/<?= $t['id'] ?>" class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 dark:text-white"><?= e($t['description']) ?></div>
                    <div class="text-xs text-gray-400"><?= formatDate($t['transaction_date']) ?><?= $t['category_name'] ? ' · ' . e($t['category_name']) : '' ?></div>
                </div>
                <span class="text-sm font-bold <?= $t['type'] === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?> flex-shrink-0">
                    <?= ($t['type'] === 'income' ? '+' : '-') . formatCurrency($t['amount']) ?>
                </span>
            </a>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

    <?php if (!empty($events)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Matukio</h3>
            <span class="ml-auto text-xs text-gray-400"><?= count($events) ?></span>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($events as $ev): ?>
            <a href="/events/<?= $ev['id'] ?>" class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 dark:text-white"><?= e($ev['title']) ?></div>
                    <div class="text-xs text-gray-400"><?= formatDate($ev['start_date']) ?><?= $ev['location'] ? ' · ' . e($ev['location']) : '' ?></div>
                </div>
                <svg class="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </a>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

    <?php if (!empty($documents)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Nyaraka</h3>
            <span class="ml-auto text-xs text-gray-400"><?= count($documents) ?></span>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($documents as $d): ?>
            <a href="/documents/<?= $d['id'] ?>" class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 dark:text-white"><?= e($d['title']) ?></div>
                    <div class="text-xs text-gray-400"><?= formatDate($d['created_at']) ?></div>
                </div>
                <svg class="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </a>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

    <?php if (!empty($announcements)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Matangazo</h3>
            <span class="ml-auto text-xs text-gray-400"><?= count($announcements) ?></span>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($announcements as $a): ?>
            <div class="px-5 py-3">
                <div class="text-sm font-medium text-gray-900 dark:text-white"><?= e($a['title']) ?></div>
                <div class="text-xs text-gray-400"><?= timeAgo($a['created_at']) ?></div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

    <?php endif; ?>
</div>
