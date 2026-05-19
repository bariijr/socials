<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Malipo ya Mtandaoni</h1>
    </div>

    <div class="flex gap-2 flex-wrap">
        <a href="?status=" class="px-4 py-2 text-sm rounded-xl font-medium <?= !$status ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' ?>">Yote</a>
        <?php foreach (['pending'=>'Inasubiri','completed'=>'Zilizokamilika','failed'=>'Zilizoshindwa'] as $s => $lbl): ?>
        <a href="?status=<?= $s ?>" class="px-4 py-2 text-sm rounded-xl font-medium <?= $status === $s ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' ?>"><?= $lbl ?></a>
        <?php endforeach; ?>
    </div>

    <div class="grid grid-cols-2 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Zilizokamilika</div>
            <div class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1"><?= formatCurrency($summary['total_completed'] ?? 0) ?></div>
            <div class="text-xs text-gray-400"><?= number_format($summary['cnt_completed'] ?? 0) ?> malipo</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Zinazongoja</div>
            <div class="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1"><?= number_format($summary['cnt_pending'] ?? 0) ?></div>
        </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna malipo kwa hali hii.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Mlipaji</th>
                        <th class="text-left px-5 py-3.5">Mtandao</th>
                        <th class="text-right px-5 py-3.5">Kiasi</th>
                        <th class="text-left px-5 py-3.5">Kusudi</th>
                        <th class="text-left px-5 py-3.5">Tarehe</th>
                        <th class="text-center px-5 py-3.5">Hali</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $p):
                        $statusClass = match($p['status']) {
                            'completed' => 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                            'failed'    => 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                            default     => 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                        };
                        $statusLabel = match($p['status']) {
                            'completed' => 'Imekamilika',
                            'failed'    => 'Imeshindwa',
                            default     => 'Inasubiri',
                        };
                    ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5">
                            <?php if ($p['first_name']): ?>
                            <div class="font-medium text-gray-900 dark:text-white"><?= e($p['first_name'] . ' ' . $p['last_name']) ?></div>
                            <?php endif; ?>
                            <div class="text-xs text-gray-400"><?= e($p['phone']) ?></div>
                        </td>
                        <td class="px-5 py-3.5 font-medium text-gray-700 dark:text-gray-300"><?= strtoupper(e($p['provider'])) ?></td>
                        <td class="px-5 py-3.5 text-right font-bold text-gray-900 dark:text-white"><?= formatCurrency($p['amount']) ?></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= ucfirst(e($p['purpose'])) ?></td>
                        <td class="px-5 py-3.5 text-gray-500 dark:text-gray-400 whitespace-nowrap"><?= formatDate($p['created_at']) ?></td>
                        <td class="px-5 py-3.5 text-center">
                            <span class="px-2 py-0.5 rounded-full text-xs font-medium <?= $statusClass ?>"><?= $statusLabel ?></span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>
</div>
