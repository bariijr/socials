<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Bajeti</h1>
        <div class="flex items-center gap-3">
            <form method="GET" class="flex gap-2">
                <select name="year" onchange="this.form.submit()" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-700 dark:text-gray-300">
                    <?php foreach ($years as $y): ?>
                    <option value="<?= $y ?>" <?= $y == $year ? 'selected' : '' ?>><?= $y ?></option>
                    <?php endforeach; ?>
                </select>
            </form>
            <?php if (auth()->can('budget_manage')): ?>
            <a href="/budget/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                Ongeza Bajeti
            </a>
            <?php endif; ?>
        </div>
    </div>

    <!-- Summary -->
    <?php
    $totalBudgeted = (float) ($totals['total_budgeted'] ?? 0);
    $totalActual   = (float) ($actualTotal['total'] ?? 0);
    $overallPct    = $totalBudgeted > 0 ? min(100, round($totalActual / $totalBudgeted * 100)) : 0;
    ?>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
            <div class="text-xs text-gray-400">Jumla Bajeti <?= $year ?></div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white mt-1"><?= formatCurrency($totalBudgeted) ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
            <div class="text-xs text-gray-400">Halisi Ilitumika</div>
            <div class="text-2xl font-bold text-red-600 dark:text-red-400 mt-1"><?= formatCurrency($totalActual) ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
            <div class="text-xs text-gray-400">Salio la Bajeti</div>
            <div class="text-2xl font-bold <?= ($totalBudgeted - $totalActual) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?> mt-1">
                <?= formatCurrency($totalBudgeted - $totalActual) ?>
            </div>
        </div>
    </div>

    <!-- Overall progress bar -->
    <?php if ($totalBudgeted > 0): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <div class="flex justify-between text-sm mb-2">
            <span class="font-medium text-gray-700 dark:text-gray-300">Matumizi ya Jumla vs Bajeti</span>
            <span class="font-bold <?= $overallPct >= 90 ? 'text-red-600' : ($overallPct >= 75 ? 'text-amber-600' : 'text-green-600') ?>"><?= $overallPct ?>%</span>
        </div>
        <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3">
            <div class="h-3 rounded-full transition-all <?= $overallPct >= 90 ? 'bg-red-500' : ($overallPct >= 75 ? 'bg-amber-500' : 'bg-green-500') ?>" style="width:<?= $overallPct ?>%"></div>
        </div>
    </div>
    <?php endif; ?>

    <!-- Budget table -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($budgets)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna bajeti kwa mwaka <?= $year ?>. <a href="/budget/create" class="text-brand-600 hover:underline">Ongeza bajeti.</a></div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Jina</th>
                        <th class="text-left px-5 py-3.5">Kategoria</th>
                        <th class="text-left px-5 py-3.5">Kipindi</th>
                        <th class="text-right px-5 py-3.5">Imepangwa</th>
                        <th class="text-right px-5 py-3.5">Halisi</th>
                        <th class="text-right px-5 py-3.5">Salio</th>
                        <th class="px-5 py-3.5">Maendeleo</th>
                        <?php if (auth()->can('budget_manage')): ?><th class="px-5 py-3.5"></th><?php endif; ?>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($budgets as $b):
                        $actual  = (float) $b['actual_spent'];
                        $plan    = (float) $b['amount_budgeted'];
                        $balance = $plan - $actual;
                        $pct     = $plan > 0 ? min(100, round($actual / $plan * 100)) : 0;
                        $barColor = $pct >= 90 ? 'bg-red-500' : ($pct >= 75 ? 'bg-amber-500' : 'bg-green-500');
                    ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5 font-medium text-gray-900 dark:text-white"><?= e($b['name']) ?></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($b['category_name'] ?? '—') ?></td>
                        <td class="px-5 py-3.5 text-gray-500 dark:text-gray-400 capitalize"><?= e(['monthly'=>'Kila Mwezi','quarterly'=>'Kila Robo','annual'=>'Kila Mwaka'][$b['period']] ?? $b['period']) ?></td>
                        <td class="px-5 py-3.5 text-right font-semibold text-gray-900 dark:text-white"><?= formatCurrency($plan) ?></td>
                        <td class="px-5 py-3.5 text-right text-red-600 dark:text-red-400"><?= formatCurrency($actual) ?></td>
                        <td class="px-5 py-3.5 text-right font-semibold <?= $balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>"><?= formatCurrency($balance) ?></td>
                        <td class="px-5 py-3.5">
                            <div class="flex items-center gap-2 min-w-24">
                                <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                    <div class="<?= $barColor ?> h-2 rounded-full" style="width:<?= $pct ?>%"></div>
                                </div>
                                <span class="text-xs text-gray-400 w-8 text-right"><?= $pct ?>%</span>
                            </div>
                        </td>
                        <?php if (auth()->can('budget_manage')): ?>
                        <td class="px-5 py-3.5 text-right">
                            <form method="POST" action="/budget/<?= $b['id'] ?>/delete" onsubmit="return confirm('Futa bajeti hii?')">
                                <?= csrf_field() ?>
                                <button class="text-xs text-red-500 hover:text-red-700">Futa</button>
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
