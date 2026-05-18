<?php
$icons = [
    'pdf'  => ['bg'=>'red-100','text'=>'red-700','icon'=>'📄'],
    'doc'  => ['bg'=>'blue-100','text'=>'blue-700','icon'=>'📝'],
    'docx' => ['bg'=>'blue-100','text'=>'blue-700','icon'=>'📝'],
    'xls'  => ['bg'=>'green-100','text'=>'green-700','icon'=>'📊'],
    'xlsx' => ['bg'=>'green-100','text'=>'green-700','icon'=>'📊'],
    'jpg'  => ['bg'=>'yellow-100','text'=>'yellow-700','icon'=>'🖼'],
    'jpeg' => ['bg'=>'yellow-100','text'=>'yellow-700','icon'=>'🖼'],
    'png'  => ['bg'=>'yellow-100','text'=>'yellow-700','icon'=>'🖼'],
];
?>
<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Hifadhi ya Hati</h1>
        <?php if (auth()->can('documents_manage')): ?>
        <a href="/documents/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Pakia Hati
        </a>
        <?php endif; ?>
    </div>

    <form method="GET" class="flex flex-wrap gap-2">
        <input type="text" name="q" value="<?= e($_GET['q'] ?? '') ?>" placeholder="Tafuta hati..." class="flex-1 min-w-48 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
        <select name="category_id" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2.5 text-gray-700 dark:text-gray-300">
            <option value="">Aina Zote</option>
            <?php foreach ($categories as $cat): ?>
            <option value="<?= $cat['id'] ?>" <?= ($_GET['category_id'] ?? '') == $cat['id'] ? 'selected' : '' ?>><?= e($cat['name']) ?></option>
            <?php endforeach; ?>
        </select>
        <button type="submit" class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200">Tafuta</button>
    </form>

    <?php if (empty($rows)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400">
        Hakuna hati zilizopakiwa bado.
    </div>
    <?php else: ?>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <?php foreach ($rows as $doc):
            $ext  = strtolower($doc['file_type'] ?? 'doc');
            $icon = $icons[$ext] ?? ['bg'=>'gray-100','text'=>'gray-700','icon'=>'📁'];
        ?>
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex flex-col gap-3">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-xl bg-<?= $icon['bg'] ?> flex items-center justify-center text-lg flex-shrink-0"><?= $icon['icon'] ?></div>
                <div class="flex-1 min-w-0">
                    <div class="font-medium text-gray-900 dark:text-white text-sm truncate"><?= e($doc['title']) ?></div>
                    <div class="text-xs text-gray-400 mt-0.5"><?= e($doc['category_name'] ?? 'Nyingine') ?> · <?= strtoupper($ext) ?></div>
                </div>
            </div>
            <?php if ($doc['description']): ?>
            <div class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2"><?= e($doc['description']) ?></div>
            <?php endif; ?>
            <div class="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400">
                <span><?= timeAgo($doc['created_at']) ?></span>
                <div class="flex gap-3">
                    <a href="/documents/<?= $doc['id'] ?>" class="text-brand-600 dark:text-brand-400 font-medium hover:underline">Angalia</a>
                    <a href="/documents/<?= $doc['id'] ?>/download" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium hover:underline">Pakua</a>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <?php if ($total > $perPage): ?>
    <div class="flex justify-center gap-2">
        <?php for ($p = 1; $p <= ceil($total/$perPage); $p++): ?>
        <a href="?<?= http_build_query(array_merge($_GET, ['page' => $p])) ?>" class="px-3 py-1.5 text-sm rounded-lg <?= $p == $page ? 'bg-brand-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700' ?>"><?= $p ?></a>
        <?php endfor; ?>
    </div>
    <?php endif; ?>
</div>
