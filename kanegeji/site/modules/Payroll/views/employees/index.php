<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Wafanyakazi</h1>
        <?php if (auth()->can('payroll_manage')): ?>
        <a href="/payroll/employees/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Ongeza Mfanyakazi
        </a>
        <?php endif; ?>
    </div>

    <form method="GET" class="flex flex-wrap gap-2">
        <input type="text" name="q" value="<?= e($_GET['q'] ?? '') ?>" placeholder="Tafuta jina, nambari, nafasi..." class="flex-1 min-w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
        <select name="status" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2.5 text-gray-700 dark:text-gray-300">
            <option value="">Hali Zote</option>
            <option value="active" <?= ($_GET['status'] ?? '') === 'active' ? 'selected' : '' ?>>Wanaofanya kazi</option>
            <option value="inactive" <?= ($_GET['status'] ?? '') === 'inactive' ? 'selected' : '' ?>>Wasio na kazi</option>
            <option value="terminated" <?= ($_GET['status'] ?? '') === 'terminated' ? 'selected' : '' ?>>Waliondoka</option>
        </select>
        <button type="submit" class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Tafuta</button>
    </form>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400">Hakuna wafanyakazi waliosajiliwa bado.</div>
        <?php else: ?>
        <div class="hidden md:block overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Mfanyakazi</th>
                        <th class="text-left px-5 py-3.5">Nafasi</th>
                        <th class="text-left px-5 py-3.5">Aina</th>
                        <th class="text-left px-5 py-3.5">Hali</th>
                        <th class="text-left px-5 py-3.5">Simu</th>
                        <th class="px-5 py-3.5"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $emp): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td class="px-5 py-4">
                            <div class="flex items-center gap-3">
                                <div class="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-400 font-semibold text-sm">
                                    <?= mb_substr($emp['first_name'], 0, 1) . mb_substr($emp['last_name'], 0, 1) ?>
                                </div>
                                <div>
                                    <div class="font-medium text-gray-900 dark:text-white"><?= e($emp['first_name'] . ' ' . $emp['last_name']) ?></div>
                                    <div class="text-xs text-gray-400"><?= e($emp['employee_number']) ?></div>
                                </div>
                            </div>
                        </td>
                        <td class="px-5 py-4 text-gray-600 dark:text-gray-400"><?= e($emp['position']) ?></td>
                        <td class="px-5 py-4 text-gray-600 dark:text-gray-400 capitalize"><?= e(str_replace('_', ' ', $emp['employment_type'])) ?></td>
                        <td class="px-5 py-4">
                            <?php $sc = ['active'=>'green','inactive'=>'yellow','terminated'=>'red'][$emp['status']] ?? 'gray' ?>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400">
                                <?= e($emp['status']) ?>
                            </span>
                        </td>
                        <td class="px-5 py-4 text-gray-600 dark:text-gray-400"><?= e($emp['phone'] ?? '-') ?></td>
                        <td class="px-5 py-4 text-right">
                            <a href="/payroll/employees/<?= $emp['id'] ?>" class="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline">Angalia</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($rows as $emp): ?>
            <a href="/payroll/employees/<?= $emp['id'] ?>" class="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 font-semibold">
                    <?= mb_substr($emp['first_name'], 0, 1) . mb_substr($emp['last_name'], 0, 1) ?>
                </div>
                <div class="flex-1">
                    <div class="font-medium text-gray-900 dark:text-white text-sm"><?= e($emp['first_name'] . ' ' . $emp['last_name']) ?></div>
                    <div class="text-xs text-gray-400"><?= e($emp['position']) ?> · <?= e($emp['employee_number']) ?></div>
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
        <a href="?<?= http_build_query(array_merge($_GET, ['page' => $p])) ?>"
           class="px-3 py-1.5 text-sm rounded-lg <?= $p == $page ? 'bg-brand-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700' ?>">
            <?= $p ?>
        </a>
        <?php endfor; ?>
    </div>
    <?php endif; ?>
</div>
