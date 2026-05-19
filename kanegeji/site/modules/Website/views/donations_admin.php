<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Michango ya Mtandaoni</h1>
    </div>

    <div class="flex gap-2">
        <?php foreach (['pending'=>'Inayosubiri','verified'=>'Iliyothibitishwa','rejected'=>'Iliyokataliwa'] as $s => $label): ?>
        <a href="?status=<?= $s ?>" class="px-4 py-2 text-sm rounded-xl font-medium <?= $status === $s ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200' ?>"><?= $label ?></a>
        <?php endforeach; ?>
    </div>

    <div class="grid grid-cols-2 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Idadi</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white mt-1"><?= $total['cnt'] ?? 0 ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Jumla</div>
            <div class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1"><?= formatCurrency($total['total'] ?? 0) ?></div>
        </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna michango yenye hali hii.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Mchangiaji</th>
                        <th class="text-left px-5 py-3.5">Kampeni</th>
                        <th class="text-right px-5 py-3.5">Kiasi</th>
                        <th class="text-left px-5 py-3.5">Njia / Namba</th>
                        <th class="text-left px-5 py-3.5">Tarehe</th>
                        <?php if ($status === 'pending'): ?><th class="px-5 py-3.5"></th><?php endif; ?>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $d): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5">
                            <div class="font-medium text-gray-900 dark:text-white"><?= e($d['donor_name'] ?? 'Asiyejulikana') ?></div>
                            <?php if ($d['donor_phone']): ?><div class="text-xs text-gray-400"><?= e($d['donor_phone']) ?></div><?php endif; ?>
                        </td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($d['campaign_title'] ?? 'Jumla') ?></td>
                        <td class="px-5 py-3.5 text-right font-bold text-green-600 dark:text-green-400"><?= formatCurrency($d['amount']) ?></td>
                        <td class="px-5 py-3.5">
                            <div class="text-gray-600 dark:text-gray-400"><?= e(strtoupper($d['payment_method'] ?? '-')) ?></div>
                            <?php if ($d['reference_number']): ?><div class="text-xs text-gray-400 font-mono"><?= e($d['reference_number']) ?></div><?php endif; ?>
                            <?php if ($d['proof_file']): ?><a href="/storage/uploads/donations/<?= e($d['proof_file']) ?>" target="_blank" class="text-xs text-brand-600 hover:underline">Thibitisho</a><?php endif; ?>
                        </td>
                        <td class="px-5 py-3.5 text-gray-500 dark:text-gray-400 whitespace-nowrap"><?= formatDate($d['created_at']) ?></td>
                        <?php if ($status === 'pending'): ?>
                        <td class="px-5 py-3.5 text-right">
                            <form method="POST" action="/donations/<?= $d['id'] ?>/verify"><?= csrf_field() ?>
                                <button class="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700">Thibitisha</button>
                            </form>
                        </td>
                        <?php endif; ?>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>
</div>
