<div class="space-y-5 max-w-2xl">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <a href="/families" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($family['family_name']) ?></h1>
        </div>
        <?php if (auth()->can('members.edit')): ?>
        <a href="/families/<?= $family['id'] ?>/edit" class="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Hariri</a>
        <?php endif; ?>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 text-sm">
        <div class="grid grid-cols-2 gap-4">
            <div><div class="text-xs text-gray-400">Jumuiya</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($community['name'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Wanachama</div><div class="font-bold text-gray-900 dark:text-white mt-0.5"><?= count($members) ?></div></div>
            <?php if ($family['address']): ?><div class="col-span-2"><div class="text-xs text-gray-400">Anwani</div><div class="text-gray-900 dark:text-white mt-0.5"><?= nl2br(e($family['address'])) ?></div></div><?php endif; ?>
        </div>
    </div>

    <?php if (!empty($members)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700"><h2 class="font-semibold text-gray-900 dark:text-white">Wanachama wa Familia (<?= count($members) ?>)</h2></div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($members as $m): ?>
            <a href="/members/<?= $m['id'] ?>" class="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-400 font-semibold text-xs flex-shrink-0">
                    <?= mb_substr($m['first_name'], 0, 1) . mb_substr($m['last_name'], 0, 1) ?>
                </div>
                <div class="flex-1">
                    <div class="text-sm font-medium text-gray-900 dark:text-white"><?= e($m['first_name'] . ' ' . $m['last_name']) ?></div>
                    <div class="text-xs text-gray-400"><?= e($m['community_name'] ?? '') ?><?= $m['phone'] ? ' · ' . e($m['phone']) : '' ?></div>
                </div>
                <?php $sc = ['active'=>'green','inactive'=>'yellow','deceased'=>'gray','transferred'=>'blue'][$m['status']] ?? 'gray'; ?>
                <span class="text-xs px-2 py-0.5 rounded-full bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($m['status']) ?></span>
            </a>
            <?php endforeach; ?>
        </div>
    </div>
    <?php else: ?>
    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
        <div class="text-gray-400 text-sm">Hakuna wanachama walioongezwa bado.</div>
        <?php if (auth()->can('members.create')): ?>
        <a href="/members/create" class="mt-3 inline-block text-sm text-brand-600 dark:text-brand-400 font-medium hover:underline">Ongeza mwanachama →</a>
        <?php endif; ?>
    </div>
    <?php endif; ?>
</div>
