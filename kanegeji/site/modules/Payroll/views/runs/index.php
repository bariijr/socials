<?php $months = ['','Januari','Februari','Machi','Aprili','Mei','Juni','Julai','Agosti','Septemba','Oktoba','Novemba','Desemba']; ?>
<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Malipo ya Mishahara</h1>
        <?php if (auth()->can('payroll_manage')): ?>
        <a href="/payroll/runs/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Tengeneza Malipo
        </a>
        <?php endif; ?>
    </div>

    <?php if (empty($runs)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400">
        Hakuna malipo yaliyotengenezwa bado.
    </div>
    <?php else: ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Kipindi</th>
                        <th class="text-left px-5 py-3.5">Nambari</th>
                        <th class="text-right px-5 py-3.5">Wafanyakazi</th>
                        <th class="text-right px-5 py-3.5">Jumla Halisi</th>
                        <th class="text-left px-5 py-3.5">Hali</th>
                        <th class="px-5 py-3.5"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($runs as $run): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-4 font-medium text-gray-900 dark:text-white"><?= $months[$run['period_month']] ?> <?= $run['period_year'] ?></td>
                        <td class="px-5 py-4 font-mono text-xs text-gray-500"><?= e($run['run_number']) ?></td>
                        <td class="px-5 py-4 text-right text-gray-600 dark:text-gray-400"><?= $run['employee_count'] ?></td>
                        <td class="px-5 py-4 text-right font-semibold text-gray-900 dark:text-white"><?= formatCurrency($run['total_net']) ?></td>
                        <td class="px-5 py-4">
                            <?php $sc = ['draft'=>'yellow','approved'=>'blue','paid'=>'green'][$run['status']] ?? 'gray' ?>
                            <span class="px-2.5 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($run['status']) ?></span>
                        </td>
                        <td class="px-5 py-4 text-right"><a href="/payroll/runs/<?= $run['id'] ?>" class="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline">Angalia</a></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
    <?php endif; ?>

    <a href="/payroll/employees" class="inline-flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:underline">
        Angalia Wafanyakazi →
    </a>
</div>
