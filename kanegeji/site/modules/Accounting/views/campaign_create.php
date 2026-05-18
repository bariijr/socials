<div class="max-w-xl mx-auto space-y-5">
    <div class="flex items-center gap-3">
        <a href="/campaigns" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($pageTitle) ?></h1>
    </div>
    <form method="POST" action="/campaigns" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <?= csrf_field() ?>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jina la Kampeni *</label>
            <input type="text" name="title" required value="<?= e($campaign['title'] ?? '') ?>"
                   class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Maelezo</label>
            <textarea name="description" rows="3"
                      class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"><?= e($campaign['description'] ?? '') ?></textarea>
        </div>
        <div class="grid grid-cols-3 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Lengo (TZS)</label>
                <input type="number" name="target_amount" min="0" step="1000" value="<?= e($campaign['target_amount'] ?? '') ?>"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tarehe Kuanza</label>
                <input type="date" name="start_date" value="<?= e($campaign['start_date'] ?? date('Y-m-d')) ?>"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tarehe Kuisha</label>
                <input type="date" name="end_date" value="<?= e($campaign['end_date'] ?? '') ?>"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
        </div>
        <label class="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" name="visible_public" value="1"
                   class="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500">
            <span class="text-sm text-gray-700 dark:text-gray-300">Ionyeshe kwenye tovuti ya umma</span>
        </label>
        <div class="flex items-center gap-3 pt-2">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-semibold rounded-xl hover:bg-brand-800 transition-colors">Hifadhi</button>
            <a href="/campaigns" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Ghairi</a>
        </div>
    </form>
</div>
