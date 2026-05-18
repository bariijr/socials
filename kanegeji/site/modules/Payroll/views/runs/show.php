<?php $months = ['','Januari','Februari','Machi','Aprili','Mei','Juni','Julai','Agosti','Septemba','Oktoba','Novemba','Desemba']; ?>
<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <a href="/payroll/runs" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            </a>
            <div>
                <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= $months[$run['period_month']] ?> <?= $run['period_year'] ?></h1>
                <div class="text-xs text-gray-400 font-mono"><?= e($run['run_number']) ?></div>
            </div>
        </div>
        <div class="flex gap-2">
            <?php if ($run['status'] === 'draft' && auth()->can('payroll_approve')): ?>
            <form method="POST" action="/payroll/runs/<?= $run['id'] ?>/approve" onsubmit="return confirm('Idhinisha malipo haya?')">
                <?= csrf_field() ?>
                <button type="submit" class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700">Idhinisha</button>
            </form>
            <?php endif; ?>
        </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <?php
        $cards = [
            ['Wafanyakazi', $run['employee_count'], 'blue'],
            ['Jumla ya Mapato', formatCurrency($run['total_gross']), 'gray'],
            ['Jumla ya Makato', formatCurrency($run['total_deductions']), 'red'],
            ['Jumla Halisi', formatCurrency($run['total_net']), 'green'],
        ];
        foreach ($cards as [$label, $val, $color]):
        ?>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400 mb-1"><?= $label ?></div>
            <div class="text-lg font-bold text-<?= $color ?>-600 dark:text-<?= $color ?>-400"><?= $val ?></div>
        </div>
        <?php endforeach; ?>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Mfanyakazi</th>
                        <th class="text-right px-4 py-3.5">Mapato Jumla</th>
                        <th class="text-right px-4 py-3.5">Makato</th>
                        <th class="text-right px-4 py-3.5">Mshahara Halisi</th>
                        <th class="px-4 py-3.5"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($items as $item): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5">
                            <div class="font-medium text-gray-900 dark:text-white"><?= e($item['first_name'] . ' ' . $item['last_name']) ?></div>
                            <div class="text-xs text-gray-400"><?= e($item['position']) ?></div>
                        </td>
                        <td class="px-4 py-3.5 text-right text-gray-700 dark:text-gray-300"><?= formatCurrency($item['gross_pay']) ?></td>
                        <td class="px-4 py-3.5 text-right text-red-600 dark:text-red-400"><?= formatCurrency($item['total_deductions']) ?></td>
                        <td class="px-4 py-3.5 text-right font-semibold text-gray-900 dark:text-white"><?= formatCurrency($item['net_pay']) ?></td>
                        <td class="px-4 py-3.5 text-right">
                            <a href="/payroll/payslip/<?= $item['id'] ?>" target="_blank" class="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline">Payslip</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
