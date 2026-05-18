<div class="space-y-5">
    <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e(__('nav.audit', 'Ukaguzi')) ?></h1>
        <a href="/audit/logins" class="text-sm text-brand-600 dark:text-brand-400 hover:underline">Historia ya Kuingia →</a>
    </div>

    <!-- Filters -->
    <form method="GET" class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div class="flex flex-wrap gap-3">
            <select name="module" class="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">Moduli zote</option>
                <?php foreach ($modules as $m): ?>
                <option value="<?= e($m['module']) ?>" <?= $filter_module === $m['module'] ? 'selected' : '' ?>>
                    <?= e($m['module']) ?>
                </option>
                <?php endforeach; ?>
            </select>
            <button type="submit" class="px-4 py-2 bg-brand-700 text-white text-sm rounded-xl hover:bg-brand-800 transition-colors">Chuja</button>
            <a href="/audit" class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl">Futa</a>
        </div>
    </form>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <tr>
                        <th class="px-5 py-3.5 text-left font-medium">Mtumiaji</th>
                        <th class="px-5 py-3.5 text-left font-medium">Kitendo</th>
                        <th class="px-5 py-3.5 text-left font-medium">Moduli</th>
                        <th class="px-5 py-3.5 text-left font-medium">Tarehe</th>
                        <th class="px-5 py-3.5 text-left font-medium">IP</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
                    <?php if (empty($logs)): ?>
                    <tr><td colspan="5" class="px-5 py-8 text-center text-gray-400">Hakuna rekodi.</td></tr>
                    <?php else: ?>
                    <?php foreach ($logs as $log): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-5 py-3 font-medium text-gray-900 dark:text-white"><?= e($log['user_name'] ?? 'System') ?></td>
                        <td class="px-5 py-3">
                            <span class="font-mono text-xs text-brand-700 dark:text-brand-400"><?= e($log['action']) ?></span>
                        </td>
                        <td class="px-5 py-3 text-gray-500 dark:text-gray-400"><?= e($log['module']) ?></td>
                        <td class="px-5 py-3 text-gray-500 dark:text-gray-400 text-xs"><?= e(formatDate($log['created_at'], 'd M Y H:i')) ?></td>
                        <td class="px-5 py-3 text-gray-400 font-mono text-xs"><?= e($log['ip_address'] ?? '-') ?></td>
                    </tr>
                    <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>

        <?php if ($lastPage > 1): ?>
        <div class="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <p class="text-sm text-gray-500 dark:text-gray-400">Ukurasa <?= $page ?> / <?= $lastPage ?></p>
            <div class="flex gap-2">
                <?php if ($page > 1): ?>
                <a href="<?= pagePath($page - 1) ?>" class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200">← Iliyotangulia</a>
                <?php endif; ?>
                <?php if ($page < $lastPage): ?>
                <a href="<?= pagePath($page + 1) ?>" class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200">Inayofuata →</a>
                <?php endif; ?>
            </div>
        </div>
        <?php endif; ?>
    </div>
</div>
