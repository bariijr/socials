<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Kamati za Parokia</h1>
        <?php if (Auth::can('committees_manage')): ?>
        <a href="/committees/create"
           class="flex items-center gap-2 bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Ongeza Kamati
        </a>
        <?php endif; ?>
    </div>

    <?php
    $types = [
        'pastoral'   => ['label'=>'Baraza la Upastorani','color'=>'purple'],
        'liturgical' => ['label'=>'Liturujia','color'=>'red'],
        'finance'    => ['label'=>'Fedha','color'=>'green'],
        'outreach'   => ['label'=>'Huduma za Jamii','color'=>'blue'],
        'youth'      => ['label'=>'Vijana','color'=>'amber'],
        'women'      => ['label'=>'Wanawake','color'=>'pink'],
        'other'      => ['label'=>'Nyingine','color'=>'gray'],
    ];
    ?>

    <?php if (empty($committees)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400 text-sm">
        Hakuna kamati zilizoanzishwa bado.
    </div>
    <?php else: ?>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <?php foreach ($committees as $c):
            $t = $types[$c['type']] ?? $types['other'];
        ?>
        <a href="/committees/<?= $c['id'] ?>"
           class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow block">
            <div class="flex items-start justify-between mb-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-<?= $t['color'] ?>-100 text-<?= $t['color'] ?>-700 dark:bg-<?= $t['color'] ?>-900/30 dark:text-<?= $t['color'] ?>-400">
                    <?= $t['label'] ?>
                </span>
                <?php if (!$c['active']): ?>
                <span class="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Haifanyi kazi</span>
                <?php endif; ?>
            </div>
            <h3 class="font-bold text-gray-900 dark:text-white mb-1"><?= e($c['name']) ?></h3>
            <?php if ($c['first_name']): ?>
            <p class="text-xs text-gray-500 mb-2">Mwenyekiti: <?= e($c['first_name'] . ' ' . $c['last_name']) ?></p>
            <?php endif; ?>
            <div class="flex items-center gap-1 text-xs text-gray-400">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <?= number_format($c['member_count']) ?> wanachama
            </div>
        </a>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
</div>
