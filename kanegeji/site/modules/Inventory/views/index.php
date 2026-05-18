<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Mali / Vifaa</h1>
        <?php if (auth()->can('inventory_manage')): ?>
        <a href="/inventory/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Ongeza Mali
        </a>
        <?php endif; ?>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-2 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Mali Zote</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white mt-1"><?= $summary['total'] ?? 0 ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Thamani ya Jumla</div>
            <div class="text-2xl font-bold text-brand-700 dark:text-brand-400 mt-1"><?= formatCurrency($summary['total_value'] ?? 0) ?></div>
        </div>
    </div>

    <form method="GET" class="flex flex-wrap gap-2">
        <input type="text" name="q" value="<?= e($_GET['q'] ?? '') ?>" placeholder="Tafuta jina, nambari, mahali..." class="flex-1 min-w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
        <select name="category_id" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2.5 text-gray-700 dark:text-gray-300">
            <option value="">Aina Zote</option>
            <?php foreach ($categories as $cat): ?>
            <option value="<?= $cat['id'] ?>" <?= ($_GET['category_id'] ?? '') == $cat['id'] ? 'selected' : '' ?>><?= e($cat['name']) ?></option>
            <?php endforeach; ?>
        </select>
        <select name="status" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2.5 text-gray-700 dark:text-gray-300">
            <option value="">Hali Zote</option>
            <option value="active" <?= ($_GET['status'] ?? '') === 'active' ? 'selected' : '' ?>>Inafanya kazi</option>
            <option value="maintenance" <?= ($_GET['status'] ?? '') === 'maintenance' ? 'selected' : '' ?>>Matengenezo</option>
            <option value="disposed" <?= ($_GET['status'] ?? '') === 'disposed' ? 'selected' : '' ?>>Imetupwa</option>
        </select>
        <button type="submit" class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200">Tafuta</button>
    </form>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400">Hakuna mali zilizosajiliwa bado.</div>
        <?php else: ?>
        <div class="hidden md:block overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Mali</th>
                        <th class="text-left px-5 py-3.5">Aina</th>
                        <th class="text-left px-5 py-3.5">Mahali</th>
                        <th class="text-right px-5 py-3.5">Thamani</th>
                        <th class="text-left px-5 py-3.5">Hali</th>
                        <th class="px-5 py-3.5"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $asset): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-4">
                            <div class="font-medium text-gray-900 dark:text-white"><?= e($asset['name']) ?></div>
                            <div class="text-xs text-gray-400 font-mono"><?= e($asset['asset_number']) ?></div>
                        </td>
                        <td class="px-5 py-4 text-gray-600 dark:text-gray-400"><?= e($asset['category_name'] ?? '-') ?></td>
                        <td class="px-5 py-4 text-gray-600 dark:text-gray-400"><?= e($asset['location'] ?? '-') ?></td>
                        <td class="px-5 py-4 text-right text-gray-900 dark:text-white"><?= $asset['current_value'] ? formatCurrency($asset['current_value']) : '-' ?></td>
                        <td class="px-5 py-4">
                            <?php $sc = ['active'=>'green','maintenance'=>'yellow','disposed'=>'red'][$asset['status']] ?? 'gray' ?>
                            <span class="px-2.5 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($asset['status']) ?></span>
                        </td>
                        <td class="px-5 py-4 text-right"><a href="/inventory/<?= $asset['id'] ?>" class="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline">Angalia</a></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($rows as $asset): ?>
            <a href="/inventory/<?= $asset['id'] ?>" class="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <svg class="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                </div>
                <div class="flex-1"><div class="font-medium text-gray-900 dark:text-white text-sm"><?= e($asset['name']) ?></div><div class="text-xs text-gray-400"><?= e($asset['category_name'] ?? '') ?> · <?= e($asset['asset_number']) ?></div></div>
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
