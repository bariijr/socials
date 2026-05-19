<div class="space-y-5 max-w-xl">
    <div class="flex items-center gap-3">
        <a href="/announcements" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Tangazo Jipya</h1>
    </div>
    <form method="POST" action="/announcements" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <?= csrf_field() ?>
        <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>
        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aina ya Tangazo</label>
            <select name="type" class="<?= $tf ?>">
                <option value="general">Jumla</option>
                <option value="liturgical">Liturujia</option>
                <option value="event">Tukio</option>
                <option value="urgent">Haraka / Muhimu</option>
            </select>
        </div>
        <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Kichwa *</label><input type="text" name="title" required class="<?= $tf ?>"></div>
        <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maudhui *</label><textarea name="content" rows="6" required class="<?= $tf ?> resize-none"></textarea></div>
        <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Chapisha Tarehe</label><input type="datetime-local" name="published_at" class="<?= $tf ?>"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Muda wa Kumalizika</label><input type="datetime-local" name="expires_at" class="<?= $tf ?>"></div>
        </div>
        <div class="flex gap-3 pt-2">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Chapisha</button>
            <a href="/announcements" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200">Ghairi</a>
        </div>
    </form>
</div>
