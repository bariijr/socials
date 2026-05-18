<div class="space-y-5">
    <div class="flex items-center gap-3">
        <a href="/audit" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Historia ya Kuingia</h1>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <tr>
                        <th class="px-5 py-3.5 text-left font-medium">Barua pepe</th>
                        <th class="px-5 py-3.5 text-left font-medium">Hali</th>
                        <th class="px-5 py-3.5 text-left font-medium">IP</th>
                        <th class="px-5 py-3.5 text-left font-medium">Tarehe</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
                    <?php foreach ($logs as $log): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-5 py-3 text-gray-900 dark:text-white"><?= e($log['email'] ?? '-') ?></td>
                        <td class="px-5 py-3">
                            <span class="inline-block px-2 py-0.5 text-xs rounded-md <?= match($log['status']) {
                                'success' => 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                                'locked'  => 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                                default   => 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                            } ?>">
                                <?= e(ucfirst($log['status'])) ?>
                            </span>
                        </td>
                        <td class="px-5 py-3 font-mono text-xs text-gray-400"><?= e($log['ip_address']) ?></td>
                        <td class="px-5 py-3 text-gray-400 text-xs"><?= e(formatDate($log['created_at'], 'd M Y H:i')) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
