<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Matangazo ya Parokia</h1>
        <?php if (auth()->can('announcements_manage')): ?>
        <a href="/announcements/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Tangazo Jipya
        </a>
        <?php endif; ?>
    </div>

    <div class="flex gap-2">
        <?php foreach (['' => 'Yote', 'general' => 'Jumla', 'liturgical' => 'Liturujia', 'event' => 'Tukio', 'urgent' => 'Haraka'] as $t => $label): ?>
        <a href="?type=<?= $t ?>" class="px-3 py-1.5 text-sm rounded-xl <?= $type === $t ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200' ?>"><?= $label ?></a>
        <?php endforeach; ?>
    </div>

    <?php if (empty($rows)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400 text-sm">Hakuna matangazo.</div>
    <?php else: ?>
    <div class="space-y-3">
        <?php
        $typeColors = ['general'=>'blue','liturgical'=>'purple','event'=>'green','urgent'=>'red'];
        $typeLabels = ['general'=>'Jumla','liturgical'=>'Liturujia','event'=>'Tukio','urgent'=>'Haraka'];
        foreach ($rows as $r):
            $sc = $typeColors[$r['type']] ?? 'gray';
        ?>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm <?= !$r['active'] ? 'opacity-50' : '' ?>">
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="px-2 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400">
                            <?= e($typeLabels[$r['type']] ?? $r['type']) ?>
                        </span>
                        <?php if (!$r['active']): ?><span class="text-xs text-gray-400">(Imezimwa)</span><?php endif; ?>
                    </div>
                    <h3 class="font-semibold text-gray-900 dark:text-white"><?= e($r['title']) ?></h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-line"><?= e(mb_substr($r['content'], 0, 200)) ?><?= mb_strlen($r['content']) > 200 ? '…' : '' ?></p>
                    <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span><?= timeAgo($r['created_at']) ?></span>
                        <?php if ($r['author']): ?><span>na <?= e($r['author']) ?></span><?php endif; ?>
                        <?php if ($r['expires_at']): ?><span>Muda mwisho: <?= formatDate($r['expires_at']) ?></span><?php endif; ?>
                    </div>
                </div>
                <?php if (auth()->can('announcements_manage')): ?>
                <div class="flex gap-2 flex-shrink-0">
                    <form method="POST" action="/announcements/<?= $r['id'] ?>/toggle"><?= csrf_field() ?><button class="text-xs px-2 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200"><?= $r['active'] ? 'Zima' : 'Washa' ?></button></form>
                    <form method="POST" action="/announcements/<?= $r['id'] ?>/delete" onsubmit="return confirm('Futa tangazo?')"><?= csrf_field() ?><button class="text-xs px-2 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100">Futa</button></form>
                </div>
                <?php endif; ?>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
    <?php if ($total > $perPage): ?>
    <div class="flex justify-center gap-2">
        <?php for ($pg = 1; $pg <= ceil($total/$perPage); $pg++): ?>
        <a href="?page=<?= $pg ?><?= $type ? '&type='.$type : '' ?>" class="px-3 py-1.5 text-sm rounded-lg <?= $pg == $page ? 'bg-brand-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700' ?>"><?= $pg ?></a>
        <?php endfor; ?>
    </div>
    <?php endif; ?>
    <?php endif; ?>
</div>
