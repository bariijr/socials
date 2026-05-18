<?php
$types = ['mass'=>'Misa','meeting'=>'Mkutano','fundraiser'=>'Mchango','concert'=>'Muziki','wedding'=>'Harusi','burial'=>'Mazishi','other'=>'Nyingine'];
$statusColors = ['draft'=>'yellow','published'=>'green','cancelled'=>'red','completed'=>'gray'];
?>
<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Matukio</h1>
        <div class="flex gap-2">
            <a href="/events/verify" class="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-xl hover:bg-gray-200">Kagua Tikiti</a>
            <?php if (auth()->can('events_manage')): ?>
            <a href="/events/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                Ongeza Tukio
            </a>
            <?php endif; ?>
        </div>
    </div>

    <div class="flex gap-2 flex-wrap">
        <?php foreach ([''=>'Yote','published'=>'Iliyochapishwa','draft'=>'Rasimu','completed'=>'Iliyokamilika','cancelled'=>'Iliyofutwa'] as $v => $l): ?>
        <a href="/events<?= $v ? '?status=' . $v : '' ?>" class="px-3 py-1.5 text-xs font-medium rounded-lg <?= $status === $v ? 'bg-brand-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700' ?>"><?= $l ?></a>
        <?php endforeach; ?>
    </div>

    <?php if (empty($events)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400">Hakuna matukio bado.</div>
    <?php else: ?>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <?php foreach ($events as $event): ?>
        <?php $sc = $statusColors[$event['status']] ?? 'gray'; ?>
        <a href="/events/<?= $event['id'] ?>" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:shadow-md transition-shadow block">
            <div class="flex items-start justify-between mb-3">
                <span class="px-2 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($event['status']) ?></span>
                <span class="text-xs text-gray-400"><?= e($types[$event['event_type']] ?? $event['event_type']) ?></span>
            </div>
            <div class="font-semibold text-gray-900 dark:text-white mb-1"><?= e($event['title']) ?></div>
            <?php if ($event['location']): ?>
            <div class="text-xs text-gray-400 mb-2"><?= e($event['location']) ?></div>
            <?php endif; ?>
            <div class="flex items-center gap-2 text-sm text-brand-700 dark:text-brand-400 font-medium">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <?= formatDate($event['start_datetime'], 'd M Y H:i') ?>
            </div>
            <?php if (!$event['is_free']): ?>
            <div class="mt-2 text-xs text-green-600 dark:text-green-400"><?= formatCurrency($event['ticket_price']) ?> / tikiti</div>
            <?php else: ?>
            <div class="mt-2 text-xs text-gray-400">Bure</div>
            <?php endif; ?>
        </a>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
</div>
