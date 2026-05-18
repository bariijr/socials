<div class="space-y-5 max-w-2xl" x-data="{ hallId: '', halls: <?= json_encode(array_column($halls, null, 'id')) ?> }">
    <div class="flex items-center gap-3">
        <a href="/bookings" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Ombea Ukumbi</h1>
    </div>

    <form method="POST" action="/bookings" class="space-y-5">
        <?= csrf_field() ?>
        <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <h2 class="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Chagua Ukumbi na Muda</h2>
            <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Ukumbi *</label>
                <select name="hall_id" required x-model="hallId" class="<?= $tf ?>">
                    <option value="">-- Chagua Ukumbi --</option>
                    <?php foreach ($halls as $hall): ?>
                    <option value="<?= $hall['id'] ?>"><?= e($hall['name']) ?> (Uwezo: <?= $hall['capacity'] ?>)</option>
                    <?php endforeach; ?>
                </select>
                <div x-show="hallId && halls[hallId]" class="mt-2 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 rounded-lg">
                    <span x-text="halls[hallId] ? halls[hallId].name + ' · TZS ' + parseInt(halls[hallId].hourly_rate).toLocaleString() + '/saa · TZS ' + parseInt(halls[hallId].daily_rate).toLocaleString() + '/siku' : ''"></span>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tarehe na Saa ya Kuanza *</label><input type="datetime-local" name="start_datetime" required class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tarehe na Saa ya Kumaliza *</label><input type="datetime-local" name="end_datetime" required class="<?= $tf ?>"></div>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <h2 class="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Taarifa za Mhusika</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jina Kamili *</label><input type="text" name="booker_name" required class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Simu *</label><input type="tel" name="booker_phone" required class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Barua Pepe</label><input type="email" name="booker_email" class="<?= $tf ?>"></div>
                <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Madhumuni ya Matumizi *</label><input type="text" name="purpose" required class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aina ya Tukio</label><input type="text" name="event_type" placeholder="Harusi, Sherehe, Mkutano..." class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Idadi ya Wageni</label><input type="number" name="expected_guests" min="1" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Amana Iliyolipwa (TZS)</label><input type="number" name="deposit_paid" value="0" min="0" class="<?= $tf ?>"></div>
                <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maelezo ya Ziada</label><textarea name="notes" rows="2" class="<?= $tf ?> resize-none"></textarea></div>
            </div>
        </div>

        <div class="flex gap-3">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Wasilisha Ombi</button>
            <a href="/bookings" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200">Ghairi</a>
        </div>
    </form>
</div>
