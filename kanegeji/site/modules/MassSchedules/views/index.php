<?php
$days  = ['Jumapili','Jumatatu','Jumanne','Jumatano','Alhamisi','Ijumaa','Jumamosi'];
$langs = ['sw' => 'Kiswahili', 'en' => 'Kiingereza', 'latin' => 'Kilatini', 'other' => 'Nyingine'];
$grouped = [];
foreach ($rows as $r) $grouped[(int)$r['day_of_week']][] = $r;
ksort($grouped);
?>
<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Ratiba ya Misa</h1>
    </div>

    <?php foreach ($grouped as $dow => $masses): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm"><?= e($days[$dow] ?? "Siku $dow") ?></h3>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($masses as $m): ?>
            <div class="flex items-center justify-between px-5 py-3.5 <?= !$m['active'] ? 'opacity-40' : '' ?>">
                <div class="flex items-center gap-4">
                    <div class="text-lg font-bold text-brand-600 dark:text-brand-400 w-16 flex-shrink-0"><?= date('H:i', strtotime($m['mass_time'])) ?></div>
                    <div>
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                            <?= e($m['location'] ?? 'Kanisa Kuu') ?>
                            <?php if ($m['is_special']): ?><span class="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">Maalum</span><?php endif; ?>
                        </div>
                        <div class="text-xs text-gray-400"><?= e($langs[$m['language']] ?? $m['language']) ?><?= $m['special_note'] ? ' — ' . e($m['special_note']) : '' ?></div>
                    </div>
                </div>
                <?php if (auth()->can('mass_manage')): ?>
                <div class="flex gap-2">
                    <form method="POST" action="/mass-schedules/<?= $m['id'] ?>/toggle"><?= csrf_field() ?>
                        <button class="text-xs px-2 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg"><?= $m['active'] ? 'Zima' : 'Washa' ?></button>
                    </form>
                    <form method="POST" action="/mass-schedules/<?= $m['id'] ?>/delete" onsubmit="return confirm('Futa ratiba?')"><?= csrf_field() ?>
                        <button class="text-xs px-2 py-1.5 bg-red-50 text-red-600 rounded-lg">Futa</button>
                    </form>
                </div>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endforeach; ?>

    <?php if (empty($rows)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400 text-sm">Hakuna ratiba. Ongeza misa hapa chini.</div>
    <?php endif; ?>

    <!-- Add new -->
    <?php if (auth()->can('mass_manage')): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h2 class="font-semibold text-gray-900 dark:text-white text-sm mb-4">Ongeza Ratiba ya Misa</h2>
        <form method="POST" action="/mass-schedules" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <?= csrf_field() ?>
            <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Siku</label>
                <select name="day_of_week" class="<?= $tf ?>">
                    <?php foreach ($days as $i => $d): ?>
                    <option value="<?= $i ?>"><?= $d ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Wakati</label>
                <input type="time" name="mass_time" required class="<?= $tf ?>">
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Mahali</label>
                <input type="text" name="location" placeholder="Kanisa Kuu" class="<?= $tf ?>">
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Lugha</label>
                <select name="language" class="<?= $tf ?>">
                    <?php foreach ($langs as $lk => $lv): ?>
                    <option value="<?= $lk ?>"><?= $lv ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="col-span-2 sm:col-span-2">
                <label class="block text-xs text-gray-500 mb-1">Maelezo ya Ziada</label>
                <input type="text" name="special_note" class="<?= $tf ?>">
            </div>
            <div class="flex items-end gap-2 col-span-2">
                <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" name="is_special" value="1" class="rounded"> Misa Maalum
                </label>
                <button type="submit" class="ml-auto px-5 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Ongeza</button>
            </div>
        </form>
    </div>
    <?php endif; ?>
</div>
