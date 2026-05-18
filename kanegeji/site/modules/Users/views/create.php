<div class="max-w-lg mx-auto space-y-5">
    <div class="flex items-center gap-3">
        <a href="/users" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($pageTitle) ?></h1>
    </div>

    <form method="POST" action="<?= isset($editing) ? '/users/' . $user['id'] : '/users' ?>"
          class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <?= csrf_field() ?>

        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jina Kamili *</label>
            <input type="text" name="name" required value="<?= e($user['name'] ?? '') ?>"
                   class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        </div>

        <?php if (!isset($editing)): ?>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Barua pepe *</label>
            <input type="email" name="email" required value="<?= e($user['email'] ?? '') ?>"
                   class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        </div>
        <?php else: ?>
        <div>
            <label class="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1.5">Barua pepe</label>
            <p class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300"><?= e($user['email'] ?? '') ?></p>
        </div>
        <?php endif; ?>

        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Simu</label>
            <input type="tel" name="phone" value="<?= e($user['phone'] ?? '') ?>"
                   class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jukumu *</label>
            <select name="role_id" required class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <?php foreach ($roles as $r): ?>
                <option value="<?= $r['id'] ?>" <?= ($user['role_id'] ?? '') == $r['id'] ? 'selected' : '' ?>><?= e($r['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Lugha</label>
            <select name="lang" class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="sw" <?= ($user['lang'] ?? 'sw') === 'sw' ? 'selected' : '' ?>>Kiswahili</option>
                <option value="en" <?= ($user['lang'] ?? '') === 'en' ? 'selected' : '' ?>>English</option>
            </select>
        </div>

        <?php if (isset($editing)): ?>
        <label class="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" name="active" value="1" <?= !empty($user['active']) ? 'checked' : '' ?>
                   class="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500">
            <span class="text-sm text-gray-700 dark:text-gray-300">Akaunti hai</span>
        </label>
        <?php endif; ?>

        <?php if (!isset($editing)): ?>
        <div class="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-xs text-amber-700 dark:text-amber-300">
            Nywila ya muda itatengenezwa na kuonyeshwa baada ya kuhifadhi.
        </div>
        <?php endif; ?>

        <div class="flex items-center gap-3 pt-2">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-semibold rounded-xl hover:bg-brand-800 transition-colors">Hifadhi</button>
            <a href="/users" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Ghairi</a>
        </div>
    </form>
</div>
