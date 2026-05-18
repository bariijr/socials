<?php $statusColors = ['pending'=>'yellow','approved'=>'green','rejected'=>'red','cancelled'=>'gray','completed'=>'blue']; ?>
<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Uhifadhi wa Ukumbi</h1>
        <?php if (auth()->can('bookings_manage')): ?>
        <a href="/bookings/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Ombea Ukumbi
        </a>
        <?php endif; ?>
    </div>

    <div class="flex gap-2 flex-wrap">
        <?php foreach ([''=>'Yote','pending'=>'Inasubiri','approved'=>'Iliyoidhinishwa','rejected'=>'Iliyokataliwa','completed'=>'Iliyokamilika'] as $v => $l): ?>
        <a href="/bookings<?= $v ? '?status=' . $v : '' ?>" class="px-3 py-1.5 text-xs font-medium rounded-lg <?= $status === $v ? 'bg-brand-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700' ?>"><?= $l ?></a>
        <?php endforeach; ?>
    </div>

    <?php if (!empty($halls)): ?>
    <div class="grid grid-cols-1 sm:grid-cols-<?= min(count($halls), 3) ?> gap-4">
        <?php foreach ($halls as $hall): ?>
        <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-700">
            <div class="font-semibold text-indigo-900 dark:text-indigo-300 text-sm"><?= e($hall['name']) ?></div>
            <div class="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Uwezo: <?= $hall['capacity'] ?> watu · <?= formatCurrency($hall['hourly_rate']) ?>/saa</div>
        </div>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <?php if (empty($bookings)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400">Hakuna maombi ya uhifadhi bado.</div>
    <?php else: ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="hidden md:block overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Mhusika</th>
                        <th class="text-left px-5 py-3.5">Ukumbi</th>
                        <th class="text-left px-5 py-3.5">Tarehe</th>
                        <th class="text-right px-5 py-3.5">Jumla</th>
                        <th class="text-left px-5 py-3.5">Hali</th>
                        <th class="px-5 py-3.5"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($bookings as $b): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-4">
                            <div class="font-medium text-gray-900 dark:text-white"><?= e($b['booker_name']) ?></div>
                            <div class="text-xs text-gray-400 font-mono"><?= e($b['booking_number']) ?></div>
                        </td>
                        <td class="px-5 py-4 text-gray-600 dark:text-gray-400"><?= e($b['hall_name']) ?></td>
                        <td class="px-5 py-4 text-gray-600 dark:text-gray-400 text-xs"><?= formatDate($b['start_datetime'], 'd M Y') ?></td>
                        <td class="px-5 py-4 text-right font-medium text-gray-900 dark:text-white"><?= formatCurrency($b['total_amount']) ?></td>
                        <td class="px-5 py-4">
                            <?php $sc = $statusColors[$b['status']] ?? 'gray'; ?>
                            <span class="px-2.5 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($b['status']) ?></span>
                        </td>
                        <td class="px-5 py-4 text-right"><a href="/bookings/<?= $b['id'] ?>" class="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline">Angalia</a></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <div class="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($bookings as $b):
                $sc = $statusColors[$b['status']] ?? 'gray';
            ?>
            <a href="/bookings/<?= $b['id'] ?>" class="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="flex-1">
                    <div class="font-medium text-gray-900 dark:text-white text-sm"><?= e($b['booker_name']) ?></div>
                    <div class="text-xs text-gray-400"><?= e($b['hall_name']) ?> · <?= formatDate($b['start_datetime'], 'd M Y') ?></div>
                    <span class="mt-1 inline-block px-2 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 capitalize"><?= e($b['status']) ?></span>
                </div>
                <div class="text-right">
                    <div class="font-medium text-sm text-gray-900 dark:text-white"><?= formatCurrency($b['total_amount']) ?></div>
                    <svg class="w-4 h-4 text-gray-400 ml-auto mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </div>
            </a>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>
</div>
