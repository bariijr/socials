<div class="space-y-5 max-w-xl">
    <div class="flex items-center gap-3">
        <a href="/families/<?= $family['id'] ?>" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Hariri Familia</h1>
    </div>
    <form method="POST" action="/families/<?= $family['id'] ?>" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <?= csrf_field() ?>
        <input type="hidden" name="_method" value="PUT">
        <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>
        <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jina la Familia *</label><input type="text" name="family_name" value="<?= e($family['family_name']) ?>" required class="<?= $tf ?>"></div>
        <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jumuiya</label>
            <select name="community_id" class="<?= $tf ?>"><option value="">-- Bila jumuiya --</option><?php foreach ($communities as $c): ?><option value="<?= $c['id'] ?>" <?= $family['community_id'] == $c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?></select>
        </div>
        <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Anwani</label><textarea name="address" rows="2" class="<?= $tf ?> resize-none"><?= e($family['address'] ?? '') ?></textarea></div>
        <div class="flex gap-3 pt-2">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Hifadhi</button>
            <a href="/families/<?= $family['id'] ?>" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200">Ghairi</a>
        </div>
    </form>
</div>
