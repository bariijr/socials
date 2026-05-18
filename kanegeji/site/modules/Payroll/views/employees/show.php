<div class="space-y-5 max-w-3xl">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <a href="/payroll/employees" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            </a>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($emp['first_name'] . ' ' . $emp['last_name']) ?></h1>
        </div>
        <?php if (auth()->can('payroll_manage')): ?>
        <a href="/payroll/employees/<?= $emp['id'] ?>/edit" class="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Hariri</a>
        <?php endif; ?>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div class="flex items-start gap-4">
            <div class="w-16 h-16 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-400 font-bold text-2xl flex-shrink-0">
                <?= mb_substr($emp['first_name'], 0, 1) . mb_substr($emp['last_name'], 0, 1) ?>
            </div>
            <div class="flex-1">
                <div class="text-lg font-bold text-gray-900 dark:text-white"><?= e($emp['first_name'] . ' ' . $emp['last_name']) ?></div>
                <div class="text-sm text-gray-500 dark:text-gray-400"><?= e($emp['position']) ?><?= $emp['department'] ? ' · ' . e($emp['department']) : '' ?></div>
                <div class="mt-2 flex flex-wrap gap-2">
                    <span class="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-lg"><?= e($emp['employee_number']) ?></span>
                    <?php $sc = ['active'=>'green','inactive'=>'yellow','terminated'=>'red'][$emp['status']] ?? 'gray' ?>
                    <span class="text-xs px-2 py-1 rounded-lg bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($emp['status']) ?></span>
                </div>
            </div>
        </div>

        <div class="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4 pt-5 border-t border-gray-100 dark:border-gray-700 text-sm">
            <div><div class="text-xs text-gray-400">Simu</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($emp['phone'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Barua Pepe</div><div class="text-gray-900 dark:text-white mt-0.5 truncate"><?= e($emp['email'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Jinsia</div><div class="text-gray-900 dark:text-white mt-0.5 capitalize"><?= e($emp['gender']) ?></div></div>
            <div><div class="text-xs text-gray-400">Aina ya Ajira</div><div class="text-gray-900 dark:text-white mt-0.5 capitalize"><?= e(str_replace('_', ' ', $emp['employment_type'])) ?></div></div>
            <div><div class="text-xs text-gray-400">Alianza</div><div class="text-gray-900 dark:text-white mt-0.5"><?= formatDate($emp['employment_start']) ?></div></div>
            <div><div class="text-xs text-gray-400">NSSF</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($emp['nssf_number'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">TIN</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($emp['tin_number'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Benki</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($emp['bank_name'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Akaunti</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($emp['bank_account'] ?? '-') ?></div></div>
        </div>
    </div>

    <?php if ($salary): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 class="font-semibold text-gray-900 dark:text-white mb-4">Muundo wa Mshahara wa Sasa</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <?php $fields = ['basic_salary'=>'Mshahara Msingi','housing_allowance'=>'Posho Nyumba','transport_allowance'=>'Posho Usafiri','other_allowances'=>'Posho Nyingine','nssf_employee'=>'NSSF (Mfanyakazi)','nssf_employer'=>'NSSF (Mwajiri)','paye'=>'PAYE','other_deductions'=>'Makato Mengine']; ?>
            <?php foreach ($fields as $key => $label): ?>
            <div><div class="text-xs text-gray-400"><?= $label ?></div><div class="font-medium text-gray-900 dark:text-white mt-0.5"><?= formatCurrency($salary[$key]) ?></div></div>
            <?php endforeach; ?>
        </div>
        <?php
            $gross = $salary['basic_salary'] + $salary['housing_allowance'] + $salary['transport_allowance'] + $salary['other_allowances'];
            $deduct = $salary['nssf_employee'] + $salary['paye'] + $salary['other_deductions'];
            $net = $gross - $deduct;
        ?>
        <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-6 text-sm">
            <div><div class="text-xs text-gray-400">Jumla ya Mapato</div><div class="font-bold text-gray-900 dark:text-white"><?= formatCurrency($gross) ?></div></div>
            <div><div class="text-xs text-gray-400">Jumla ya Makato</div><div class="font-bold text-red-600 dark:text-red-400"><?= formatCurrency($deduct) ?></div></div>
            <div><div class="text-xs text-gray-400">Mshahara Halisi</div><div class="font-bold text-green-600 dark:text-green-400"><?= formatCurrency($net) ?></div></div>
        </div>
    </div>
    <?php endif; ?>

    <?php if (!empty($runs)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 class="font-semibold text-gray-900 dark:text-white">Historia ya Malipo</h2>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($runs as $run): ?>
            <div class="flex items-center justify-between px-5 py-3.5 text-sm">
                <div>
                    <div class="font-medium text-gray-900 dark:text-white">
                        <?php $months = ['','Januari','Februari','Machi','Aprili','Mei','Juni','Julai','Agosti','Septemba','Oktoba','Novemba','Desemba']; ?>
                        <?= $months[$run['period_month']] ?> <?= $run['period_year'] ?>
                    </div>
                    <div class="text-xs text-gray-400"><?= e($run['run_number']) ?></div>
                </div>
                <div class="text-right">
                    <div class="font-medium text-gray-900 dark:text-white"><?= formatCurrency($run['net_pay']) ?></div>
                    <a href="/payroll/payslip/<?= $run['id'] ?>" class="text-xs text-brand-600 dark:text-brand-400 hover:underline">Pakua payslip</a>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>
</div>
