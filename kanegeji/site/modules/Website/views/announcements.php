<?php
$typeColors = ['general'=>'blue','liturgical'=>'purple','event'=>'green','urgent'=>'red'];
$typeLabels = ['general'=>'Jumla','liturgical'=>'Liturujia','event'=>'Tukio','urgent'=>'Haraka'];
?>
<div class="max-w-3xl mx-auto px-4 sm:px-6 py-12">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2"><?= e($parish['name'] ?? 'Parokia') ?></h1>
    <p class="text-gray-500 dark:text-gray-400 mb-8">Matangazo na Habari za Parokia</p>

    <?php if (empty($rows)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-10 text-center text-gray-400">Hakuna matangazo kwa sasa.</div>
    <?php else: ?>
    <div class="space-y-4">
        <?php foreach ($rows as $r):
            $sc = $typeColors[$r['type']] ?? 'gray';
        ?>
        <article class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <div class="flex items-center gap-2 mb-3">
                <span class="px-2 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400"><?= e($typeLabels[$r['type']] ?? $r['type']) ?></span>
                <span class="text-xs text-gray-400"><?= date('d M Y', strtotime($r['created_at'])) ?></span>
                <?php if ($r['type'] === 'urgent'): ?><span class="animate-pulse text-xs text-red-600 font-semibold">● HARAKA</span><?php endif; ?>
            </div>
            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-2"><?= e($r['title']) ?></h2>
            <p class="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-line leading-relaxed"><?= nl2br(e($r['content'])) ?></p>
        </article>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
    <div class="text-center mt-8"><a href="/" class="text-sm text-brand-600 dark:text-brand-400 hover:underline">← Rudi Nyumbani</a></div>
</div>
