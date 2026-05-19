<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Sala na Maudhui ya Kikatoliki</h1>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-2">
        <?php foreach ($types as $t => $label): ?>
        <a href="?type=<?= $t ?>&lang=<?= $lang ?>" class="px-3 py-1.5 text-sm rounded-xl <?= $type === $t ? 'bg-brand-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50' ?>"><?= $label ?></a>
        <?php endforeach; ?>
        <div class="ml-auto">
            <a href="?type=<?= $type ?>&lang=sw" class="px-3 py-1.5 text-sm rounded-xl <?= $lang === 'sw' ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700' ?>">SW</a>
            <a href="?type=<?= $type ?>&lang=en" class="px-3 py-1.5 text-sm rounded-xl ml-1 <?= $lang === 'en' ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700' ?>">EN</a>
        </div>
    </div>

    <?php if (empty($prayers)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400 text-sm">Hakuna maudhui yaliyopatikana.</div>
    <?php else: ?>
    <div class="space-y-4" x-data="{ open: null }">
        <?php foreach ($prayers as $i => $p): ?>
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <button @click="open = open === <?= $i ?> ? null : <?= $i ?>"
                class="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                        </svg>
                    </div>
                    <span class="font-semibold text-gray-900 dark:text-white text-sm"><?= e($p['title']) ?></span>
                </div>
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform" :class="open === <?= $i ?> ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </button>
            <div x-show="open === <?= $i ?>" x-cloak class="px-5 pb-5">
                <div class="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed font-serif">
                    <?= nl2br(e($p['content'])) ?>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
</div>
