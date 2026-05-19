<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">Hifadhidata ya Maarifa ya AI</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Maudhui haya yatumika na Msaidizi wa AI kutoa majibu sahihi zaidi.</p>
        </div>
    </div>

    <!-- Upload form -->
    <?php if (auth()->can('knowledge_manage')): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 class="font-semibold text-gray-900 dark:text-white text-sm mb-4">Ongeza Maarifa Mapya</h2>
        <form method="POST" action="/ai-knowledge" enctype="multipart/form-data" class="space-y-4">
            <?= csrf_field() ?>
            <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>
            <div class="grid grid-cols-2 gap-4">
                <div class="col-span-2 sm:col-span-1"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Kichwa *</label><input type="text" name="title" required class="<?= $tf ?>"></div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aina</label>
                    <select name="type" class="<?= $tf ?>">
                        <option value="document">Hati / Waraka</option>
                        <option value="faq">Maswali na Majibu</option>
                        <option value="procedure">Taratibu</option>
                        <option value="policy">Sera</option>
                        <option value="other">Nyingine</option>
                    </select>
                </div>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Pakia Faili (TXT au PDF)</label><input type="file" name="document" accept=".txt,.pdf" class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maudhui (au nyongeza za faili)</label><textarea name="content" rows="5" class="<?= $tf ?> resize-none" placeholder="Weka maudhui moja kwa moja hapa..."></textarea></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Lebo (tags, tenganisha kwa koma)</label><input type="text" name="tags" class="<?= $tf ?>" placeholder="sala, taratibu, sera, ..."></div>
            <div class="flex justify-end">
                <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Hifadhi Maarifa</button>
            </div>
        </form>
    </div>
    <?php endif; ?>

    <!-- Knowledge list -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna maarifa. Ongeza waraka au maudhui ya kwanza.</div>
        <?php else: ?>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($rows as $r):
                $typeLabel = ['document'=>'Hati','faq'=>'FAQ','procedure'=>'Taratibu','policy'=>'Sera','other'=>'Nyingine'][$r['type']] ?? $r['type'];
            ?>
            <div class="flex items-start gap-4 px-5 py-4 <?= !$r['active'] ? 'opacity-50' : '' ?> hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div class="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                    <svg class="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <p class="font-semibold text-gray-900 dark:text-white text-sm"><?= e($r['title']) ?></p>
                        <span class="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs rounded-full"><?= $typeLabel ?></span>
                        <?php if (!$r['active']): ?><span class="text-xs text-gray-400">(Imezimwa)</span><?php endif; ?>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        <?= number_format($r['word_count']) ?> maneno ·
                        <?= e($r['author'] ?? '-') ?> ·
                        <?= timeAgo($r['created_at']) ?>
                        <?php if ($r['tags']): ?> · <span class="text-brand-600 dark:text-brand-400"><?= e($r['tags']) ?></span><?php endif; ?>
                    </p>
                    <p class="text-xs text-gray-400 mt-1 truncate"><?= e(mb_substr(strip_tags($r['content']), 0, 120)) ?>…</p>
                </div>
                <?php if (auth()->can('knowledge_manage')): ?>
                <div class="flex gap-2 flex-shrink-0">
                    <form method="POST" action="/ai-knowledge/<?= $r['id'] ?>/toggle"><?= csrf_field() ?><button class="text-xs px-2 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg"><?= $r['active'] ? 'Zima' : 'Washa' ?></button></form>
                    <form method="POST" action="/ai-knowledge/<?= $r['id'] ?>/delete" onsubmit="return confirm('Futa maarifa haya?')"><?= csrf_field() ?><button class="text-xs px-2 py-1.5 bg-red-50 text-red-600 rounded-lg">Futa</button></form>
                </div>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        </div>
        <?php if ($total > $perPage): ?>
        <div class="flex justify-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <?php for ($pg = 1; $pg <= ceil($total/$perPage); $pg++): ?>
            <a href="?page=<?= $pg ?>" class="px-3 py-1.5 text-sm rounded-lg <?= $pg == $page ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' ?>"><?= $pg ?></a>
            <?php endfor; ?>
        </div>
        <?php endif; ?>
        <?php endif; ?>
    </div>
</div>
