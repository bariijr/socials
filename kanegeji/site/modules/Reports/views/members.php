<div class="space-y-5">
    <div class="flex items-center gap-3">
        <a href="/reports" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Ripoti ya Wanachama</h1>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <!-- By gender -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm mb-3">Kwa Jinsia</h3>
            <?php foreach ($byGender as $g): ?>
            <div class="flex items-center justify-between py-1.5">
                <span class="text-sm text-gray-600 dark:text-gray-300"><?= e(ucfirst($g['gender'])) ?></span>
                <span class="font-bold text-gray-900 dark:text-white"><?= number_format($g['count']) ?></span>
            </div>
            <?php endforeach; ?>
        </div>

        <!-- By status -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm mb-3">Kwa Hali</h3>
            <?php foreach ($byStatus as $s): ?>
            <div class="flex items-center justify-between py-1.5">
                <span class="text-sm text-gray-600 dark:text-gray-300"><?= e(ucfirst($s['status'])) ?></span>
                <span class="font-bold text-gray-900 dark:text-white"><?= number_format($s['count']) ?></span>
            </div>
            <?php endforeach; ?>
        </div>

        <!-- By community count -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm mb-3">Kwa Jumuiya (Top 5)</h3>
            <?php foreach (array_slice($byCommunity, 0, 5) as $c): ?>
            <div class="flex items-center justify-between py-1.5">
                <span class="text-xs text-gray-600 dark:text-gray-300 truncate"><?= e($c['name']) ?></span>
                <span class="font-bold text-gray-900 dark:text-white ml-2"><?= number_format($c['count']) ?></span>
            </div>
            <?php endforeach; ?>
        </div>
    </div>

    <!-- Full community table -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Wanachama kwa Jumuiya</h3>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <tr>
                        <th class="px-5 py-3 text-left font-medium">Jumuiya</th>
                        <th class="px-5 py-3 text-right font-medium">Wanachama</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
                    <?php foreach ($byCommunity as $c): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-5 py-3 text-gray-900 dark:text-white"><?= e($c['name']) ?></td>
                        <td class="px-5 py-3 text-right font-bold text-gray-900 dark:text-white"><?= number_format($c['count']) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
