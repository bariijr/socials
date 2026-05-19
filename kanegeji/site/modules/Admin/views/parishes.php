<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <a href="/admin" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            </a>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">Parokia Zote</h1>
        </div>
        <a href="/admin/parishes/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Parokia Mpya
        </a>
    </div>

    <form method="GET" class="flex gap-2">
        <input type="text" name="q" value="<?= e($search) ?>" placeholder="Tafuta jina au jimbo..." class="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
        <button type="submit" class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200">Tafuta</button>
    </form>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna parokia zilizopatikana.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Parokia</th>
                        <th class="text-left px-5 py-3.5">Jimbo</th>
                        <th class="text-left px-5 py-3.5">Simu</th>
                        <th class="text-right px-5 py-3.5">Wanachama</th>
                        <th class="text-right px-5 py-3.5">Watumiaji</th>
                        <th class="text-center px-5 py-3.5">Hali</th>
                        <th class="px-5 py-3.5"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $p): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5">
                            <div class="font-medium text-gray-900 dark:text-white"><?= e($p['name']) ?></div>
                            <?php if ($p['email']): ?><div class="text-xs text-gray-400"><?= e($p['email']) ?></div><?php endif; ?>
                        </td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($p['diocese'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($p['phone'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-right"><?= number_format($p['member_count']) ?></td>
                        <td class="px-5 py-3.5 text-right"><?= number_format($p['user_count']) ?></td>
                        <td class="px-5 py-3.5 text-center">
                            <span class="px-2 py-0.5 rounded-full text-xs <?= $p['active'] ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700' ?>">
                                <?= $p['active'] ? 'Inafanya kazi' : 'Imesimamishwa' ?>
                            </span>
                        </td>
                        <td class="px-5 py-3.5 text-right">
                            <a href="/admin/parishes/<?= $p['id'] ?>" class="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline">Angalia</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php if ($total > $perPage): ?>
        <div class="flex justify-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <?php for ($pg = 1; $pg <= ceil($total/$perPage); $pg++): ?>
            <a href="?page=<?= $pg ?><?= $search ? '&q=' . urlencode($search) : '' ?>" class="px-3 py-1.5 text-sm rounded-lg <?= $pg == $page ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' ?>"><?= $pg ?></a>
            <?php endfor; ?>
        </div>
        <?php endif; ?>
        <?php endif; ?>
    </div>
</div>
