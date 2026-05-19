<?php
$monthNames = ['','Januari','Februari','Machi','Aprili','Mei','Juni','Julai','Agosti','Septemba','Oktoba','Novemba','Desemba'];
$prevM = $month === 1 ? ['m' => 12, 'y' => $year - 1] : ['m' => $month - 1, 'y' => $year];
$nextM = $month === 12 ? ['m' => 1, 'y' => $year + 1] : ['m' => $month + 1, 'y' => $year];
$seasonColors = ['purple' => 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', 'red' => 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', 'white' => 'bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300', 'gold' => 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', 'blue' => 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', 'green' => 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'];
?>
<div class="space-y-5">
    <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Kalenda ya Liturujia ya Kikatoliki</h1>
    </div>

    <!-- Month nav -->
    <div class="flex items-center justify-between bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 px-5 py-4 shadow-sm">
        <a href="?year=<?= $prevM['y'] ?>&month=<?= $prevM['m'] ?>" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </a>
        <h2 class="font-bold text-gray-900 dark:text-white"><?= $monthNames[$month] ?> <?= $year ?></h2>
        <a href="?year=<?= $nextM['y'] ?>&month=<?= $nextM['m'] ?>" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </a>
    </div>

    <!-- Feasts this month -->
    <?php if (empty($seasons)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-10 text-center text-gray-400 text-sm">
        Hakuna sikukuu za liturujia zinazojulikana kwa mwezi huu.
    </div>
    <?php else: ?>
    <div class="space-y-3">
        <?php foreach ($seasons as $feast):
            $sc = $seasonColors[$feast['color']] ?? $seasonColors['white'];
            $dt = new DateTime($feast['date']);
        ?>
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4">
            <div class="w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex flex-col items-center justify-center flex-shrink-0">
                <div class="text-xs text-brand-500 font-medium"><?= strtoupper($monthNames[$month]) ?></div>
                <div class="text-2xl font-bold text-brand-700 dark:text-brand-400"><?= $dt->format('j') ?></div>
            </div>
            <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-gray-900 dark:text-white"><?= e($feast['name']) ?></h3>
                <span class="inline-block mt-1 px-2 py-0.5 text-xs rounded-full <?= $sc ?>"><?= e($feast['season']) ?></span>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <!-- Legend -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Rangi za Liturujia</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <?php foreach (['purple' => 'Adventu / Kwaresima','red' => 'Pentekoste / Mateso','white' => 'Pasaka / Noeli','gold' => 'Sikukuu za Juu','blue' => 'Maria','green' => 'Kawaida'] as $color => $label): ?>
            <div class="flex items-center gap-2">
                <div class="w-4 h-4 rounded <?= ['purple'=>'bg-purple-500','red'=>'bg-red-500','white'=>'bg-gray-300','gold'=>'bg-amber-500','blue'=>'bg-blue-500','green'=>'bg-green-500'][$color] ?>"></div>
                <span class="text-gray-600 dark:text-gray-400"><?= $label ?></span>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>
