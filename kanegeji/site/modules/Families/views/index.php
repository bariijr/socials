<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Familia</h1>
        <?php if (auth()->can('members.create')): ?>
        <a href="/families/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Ongeza Familia
        </a>
        <?php endif; ?>
    </div>

    <form method="GET" class="flex flex-wrap gap-2">
        <input type="text" name="q" value="<?= e($_GET['q'] ?? '') ?>" placeholder="Tafuta jina la familia..." class="flex-1 min-w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
        <select name="community_id" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2.5 text-gray-700 dark:text-gray-300">
            <option value="">Jumuiya Zote</option>
            <?php foreach ($communities as $c): ?>
            <option value="<?= $c['id'] ?>" <?= ($_GET['community_id'] ?? '') == $c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option>
            <?php endforeach; ?>
        </select>
        <button type="submit" class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200">Tafuta</button>
    </form>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400">Hakuna familia zilizosajiliwa bado.</div>
        <?php else: ?>
        <div class="hidden md:block overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Jina la Familia</th>
                        <th class="text-left px-5 py-3.5">Jumuiya</th>
                        <th class="text-right px-5 py-3.5">Wanachama</th>
                        <th class="px-5 py-3.5"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $fam): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-4">
                            <div class="flex items-center gap-3">
                                <div class="w-9 h-9 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                                    <svg class="w-4 h-4 text-pink-600 dark:text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                                </div>
                                <span class="font-medium text-gray-900 dark:text-white"><?= e($fam['family_name']) ?></span>
                            </div>
                        </td>
                        <td class="px-5 py-4 text-gray-600 dark:text-gray-400"><?= e($fam['community_name'] ?? '-') ?></td>
                        <td class="px-5 py-4 text-right">
                            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-xs font-bold"><?= $fam['member_count'] ?></span>
                        </td>
                        <td class="px-5 py-4 text-right"><a href="/families/<?= $fam['id'] ?>" class="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline">Angalia</a></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($rows as $fam): ?>
            <a href="/families/<?= $fam['id'] ?>" class="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-5 h-5 text-pink-600 dark:text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                </div>
                <div class="flex-1">
                    <div class="font-medium text-gray-900 dark:text-white text-sm"><?= e($fam['family_name']) ?></div>
                    <div class="text-xs text-gray-400"><?= e($fam['community_name'] ?? 'Bila jumuiya') ?> · <?= $fam['member_count'] ?> wanachama</div>
                </div>
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </a>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>

    <?php if ($total > $perPage): ?>
    <div class="flex justify-center gap-2">
        <?php for ($p = 1; $p <= ceil($total/$perPage); $p++): ?>
        <a href="?<?= http_build_query(array_merge($_GET, ['page' => $p])) ?>" class="px-3 py-1.5 text-sm rounded-lg <?= $p == $page ? 'bg-brand-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700' ?>"><?= $p ?></a>
        <?php endfor; ?>
    </div>
    <?php endif; ?>
</div>
