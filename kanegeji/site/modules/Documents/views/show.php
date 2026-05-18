<div class="space-y-5 max-w-2xl">
    <div class="flex items-center gap-3">
        <a href="/documents" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($doc['title']) ?></h1>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <div class="grid grid-cols-2 gap-4 text-sm">
            <div><div class="text-xs text-gray-400">Aina ya Faili</div><div class="font-medium text-gray-900 dark:text-white mt-0.5 uppercase"><?= e($doc['file_type']) ?></div></div>
            <div><div class="text-xs text-gray-400">Ukubwa</div><div class="font-medium text-gray-900 dark:text-white mt-0.5"><?= number_format($doc['file_size'] / 1024, 1) ?> KB</div></div>
            <div><div class="text-xs text-gray-400">Jina la Faili</div><div class="font-medium text-gray-900 dark:text-white mt-0.5 truncate"><?= e($doc['file_name']) ?></div></div>
            <div><div class="text-xs text-gray-400">Ilipakiwa</div><div class="font-medium text-gray-900 dark:text-white mt-0.5"><?= formatDate($doc['created_at']) ?></div></div>
        </div>
        <?php if ($doc['description']): ?>
        <div class="pt-3 border-t border-gray-100 dark:border-gray-700">
            <div class="text-xs text-gray-400 mb-1">Maelezo</div>
            <div class="text-sm text-gray-700 dark:text-gray-300"><?= nl2br(e($doc['description'])) ?></div>
        </div>
        <?php endif; ?>

        <div class="flex gap-3 pt-2">
            <a href="/documents/<?= $doc['id'] ?>/download" class="px-5 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 inline-flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Pakua Hati
            </a>
            <?php if (auth()->can('documents_manage')): ?>
            <form method="POST" action="/documents/<?= $doc['id'] ?>/delete" onsubmit="return confirm('Futa hati hii?')">
                <?= csrf_field() ?>
                <button type="submit" class="px-5 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30">Futa</button>
            </form>
            <?php endif; ?>
        </div>
    </div>
</div>
