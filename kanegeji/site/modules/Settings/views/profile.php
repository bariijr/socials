<div class="max-w-2xl mx-auto space-y-5">
    <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e(__('settings.title', 'Mipangilio')) ?></h1>

    <!-- Tabs -->
    <div class="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <a href="/settings" class="px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-b-2 border-transparent">Parokia</a>
        <a href="/settings/profile" class="px-4 py-2.5 text-sm font-medium border-b-2 border-brand-600 text-brand-700 dark:text-brand-400 dark:border-brand-400">Wasifu Wangu</a>
    </div>

    <form method="POST" action="/settings/profile"
          class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <?= csrf_field() ?>

        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jina Kamili</label>
            <input type="text" name="name" required value="<?= e($user['name'] ?? '') ?>"
                   class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Lugha</label>
            <select name="lang" class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="sw" <?= ($user['lang'] ?? '') === 'sw' ? 'selected' : '' ?>>Kiswahili</option>
                <option value="en" <?= ($user['lang'] ?? '') === 'en' ? 'selected' : '' ?>>English</option>
            </select>
        </div>

        <hr class="border-gray-100 dark:border-gray-700">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300"><?= e(__('settings.change_password', 'Badilisha Nywila')) ?></h3>
        <p class="text-xs text-gray-400">Acha tupu kama hutabadilisha nywila.</p>

        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('settings.current_password', 'Nywila ya Sasa')) ?></label>
            <input type="password" name="current_password" autocomplete="current-password"
                   class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('settings.new_password', 'Nywila Mpya')) ?></label>
                <input type="password" name="new_password" autocomplete="new-password" minlength="8"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('settings.confirm_password', 'Thibitisha')) ?></label>
                <input type="password" name="confirm_password" autocomplete="new-password"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
        </div>

        <div>
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-semibold rounded-xl hover:bg-brand-800 transition-colors">
                Hifadhi
            </button>
        </div>
    </form>
</div>
