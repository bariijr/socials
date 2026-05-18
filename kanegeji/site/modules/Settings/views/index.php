<div class="max-w-2xl mx-auto space-y-5">
    <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e(__('settings.title', 'Mipangilio')) ?></h1>

    <!-- Tabs -->
    <div class="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <a href="/settings" class="px-4 py-2.5 text-sm font-medium border-b-2 border-brand-600 text-brand-700 dark:text-brand-400 dark:border-brand-400">Parokia</a>
        <a href="/settings/profile" class="px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-b-2 border-transparent">Wasifu Wangu</a>
    </div>

    <form method="POST" action="/settings"
          class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <?= csrf_field() ?>
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 pb-2 border-b border-gray-100 dark:border-gray-700">Taarifa za Parokia</h2>

        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jina la Parokia</label>
            <input type="text" name="parish_name" value="<?= e($parish['name'] ?? '') ?>"
                   class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Simu</label>
                <input type="tel" name="parish_phone" value="<?= e($parish['phone'] ?? '') ?>"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Barua pepe</label>
                <input type="email" name="parish_email" value="<?= e($parish['email'] ?? '') ?>"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Anwani</label>
            <textarea name="parish_address" rows="2"
                      class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"><?= e($parish['address'] ?? '') ?></textarea>
        </div>

        <div class="pt-2">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-semibold rounded-xl hover:bg-brand-800 transition-colors">
                Hifadhi Mipangilio
            </button>
        </div>
    </form>
</div>
