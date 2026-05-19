<?php
$days = ['Jumapili','Jumatatu','Jumanne','Jumatano','Alhamisi','Ijumaa','Jumamosi'];
$grouped = [];
foreach ($rows as $r) $grouped[(int)$r['day_of_week']][] = $r;
ksort($grouped);
?>
<div class="max-w-2xl mx-auto px-4 sm:px-6 py-12">
    <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Ratiba ya Misa</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-2 text-sm"><?= e($parish['name'] ?? 'Parokia') ?></p>
    </div>

    <?php foreach ($grouped as $dow => $masses): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm mb-4 overflow-hidden">
        <div class="px-5 py-3 bg-brand-700 <?= (int)date('w') === $dow ? '' : 'bg-opacity-80' ?>">
            <h3 class="font-bold text-white"><?= e($days[$dow] ?? "Siku $dow") ?><?= (int)date('w') === $dow ? ' · Leo' : '' ?></h3>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($masses as $m): ?>
            <div class="flex items-center gap-4 px-5 py-4">
                <div class="text-xl font-bold text-brand-700 dark:text-brand-400 w-16 flex-shrink-0"><?= date('H:i', strtotime($m['mass_time'])) ?></div>
                <div>
                    <div class="font-medium text-gray-900 dark:text-white"><?= e($m['location'] ?? 'Kanisa Kuu') ?></div>
                    <div class="text-sm text-gray-500 dark:text-gray-400"><?= ['sw'=>'Kiswahili','en'=>'English','latin'=>'Kilatini','other'=>'Nyingine'][$m['language']] ?? '' ?><?= $m['is_special'] ? ' · <span class="text-amber-600">Maalum</span>' : '' ?></div>
                    <?php if ($m['special_note']): ?><div class="text-xs text-gray-400 mt-0.5 italic"><?= e($m['special_note']) ?></div><?php endif; ?>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endforeach; ?>

    <?php if (empty($rows)): ?>
    <div class="text-center py-12 text-gray-400">Hakuna ratiba ya misa iliyoandikwa bado.</div>
    <?php endif; ?>

    <div class="text-center mt-6">
        <a href="/" class="text-sm text-brand-600 dark:text-brand-400 hover:underline">← Rudi Nyumbani</a>
    </div>
</div>
