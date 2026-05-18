<div class="space-y-5">
    <h1 class="text-xl font-bold text-gray-900 dark:text-white">Orodha ya Akaunti (Chart of Accounts)</h1>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <tr>
                        <th class="px-5 py-3.5 text-left font-medium">Nambari</th>
                        <th class="px-5 py-3.5 text-left font-medium">Jina</th>
                        <th class="px-5 py-3.5 text-left font-medium">Aina</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
                    <?php foreach ($accounts as $a): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400"><?= e($a['code']) ?></td>
                        <td class="px-5 py-3 text-gray-900 dark:text-white"><?= e($a['name']) ?></td>
                        <td class="px-5 py-3">
                            <span class="px-2 py-0.5 text-xs rounded-lg <?= match($a['type_name']) {
                                'Income'  => 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                                'Expense' => 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                                'Asset'   => 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                                default   => 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
                            } ?>"><?= e($a['type_name']) ?></span>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
