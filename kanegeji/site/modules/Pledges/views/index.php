<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Ahadi (Pledges)</h1>
        <?php if (auth()->can('accounting.create')): ?>
        <a href="/pledges/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Ongeza Ahadi
        </a>
        <?php endif; ?>
    </div>

    <?php if ($summary): ?>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Jumla ya Ahadi</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white mt-1"><?= formatCurrency($summary['total_pledged'] ?? 0) ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Jumla Iliyolipwa</div>
            <div class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1"><?= formatCurrency($summary['total_paid'] ?? 0) ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Idadi ya Ahadi</div>
            <div class="text-2xl font-bold text-brand-700 dark:text-brand-400 mt-1"><?= $summary['total'] ?? 0 ?></div>
        </div>
    </div>
    <?php endif; ?>

    <form method="GET" class="flex flex-wrap gap-2">
        <select name="campaign_id" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2.5 text-gray-700 dark:text-gray-300">
            <option value="">Kampeni Zote</option>
            <?php foreach ($campaigns as $c): ?>
            <option value="<?= $c['id'] ?>" <?= ($filters['campaign_id'] ?? '') == $c['id'] ? 'selected' : '' ?>><?= e($c['title']) ?></option>
            <?php endforeach; ?>
        </select>
        <select name="status" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2.5 text-gray-700 dark:text-gray-300">
            <option value="">Hali Zote</option>
            <option value="pending" <?= ($filters['status'] ?? '') === 'pending' ? 'selected' : '' ?>>Inayosubiri</option>
            <option value="partial" <?= ($filters['status'] ?? '') === 'partial' ? 'selected' : '' ?>>Sehemu</option>
            <option value="fulfilled" <?= ($filters['status'] ?? '') === 'fulfilled' ? 'selected' : '' ?>>Imekamilika</option>
            <option value="defaulted" <?= ($filters['status'] ?? '') === 'defaulted' ? 'selected' : '' ?>>Haijalipwa</option>
        </select>
        <button type="submit" class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200">Chuja</button>
    </form>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400">Hakuna ahadi zilizohifadhiwa bado.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Mchangiaji</th>
                        <th class="text-left px-5 py-3.5">Kampeni</th>
                        <th class="text-right px-5 py-3.5">Aliahidi</th>
                        <th class="text-right px-5 py-3.5">Amelipa</th>
                        <th class="px-5 py-3.5">Maendeleo</th>
                        <th class="text-left px-5 py-3.5">Hali</th>
                        <th class="px-5 py-3.5"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $p):
                        $pct = $p['amount_pledged'] > 0 ? min(100, round($p['amount_paid'] / $p['amount_pledged'] * 100)) : 0;
                        $sc = ['pending'=>'yellow','partial'=>'blue','fulfilled'=>'green','defaulted'=>'red'][$p['status']] ?? 'gray';
                    ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5">
                            <div class="font-medium text-gray-900 dark:text-white"><?= e($p['donor_name'] ?? ($p['first_name'] . ' ' . $p['last_name'])) ?></div>
                            <?php if ($p['phone']): ?><div class="text-xs text-gray-400"><?= e($p['phone']) ?></div><?php endif; ?>
                        </td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($p['campaign_title'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-right font-medium text-gray-900 dark:text-white"><?= formatCurrency($p['amount_pledged']) ?></td>
                        <td class="px-5 py-3.5 text-right text-green-600 dark:text-green-400"><?= formatCurrency($p['amount_paid']) ?></td>
                        <td class="px-5 py-3.5">
                            <div class="flex items-center gap-2">
                                <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                    <div class="bg-brand-600 h-1.5 rounded-full" style="width:<?= $pct ?>%"></div>
                                </div>
                                <span class="text-xs text-gray-400"><?= $pct ?>%</span>
                            </div>
                        </td>
                        <td class="px-5 py-3.5"><span class="px-2 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($p['status']) ?></span></td>
                        <td class="px-5 py-3.5 text-right"><a href="/pledges/<?= $p['id'] ?>" class="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline">Angalia</a></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
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
