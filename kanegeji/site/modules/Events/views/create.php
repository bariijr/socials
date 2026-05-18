<div class="space-y-5 max-w-2xl" x-data="{ isFree: true }">
    <div class="flex items-center gap-3">
        <a href="/events" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Ongeza Tukio Jipya</h1>
    </div>

    <form method="POST" action="/events" class="space-y-5">
        <?= csrf_field() ?>
        <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Kichwa cha Tukio *</label>
                <input type="text" name="title" required class="<?= $tf ?>">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aina ya Tukio</label>
                    <select name="event_type" class="<?= $tf ?>">
                        <option value="other">Nyingine</option>
                        <option value="mass">Misa</option>
                        <option value="meeting">Mkutano</option>
                        <option value="fundraiser">Mchango</option>
                        <option value="concert">Muziki / Tamasha</option>
                        <option value="wedding">Harusi</option>
                        <option value="burial">Mazishi</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Hali</label>
                    <select name="status" class="<?= $tf ?>">
                        <option value="draft">Rasimu</option>
                        <option value="published">Chapisha</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tarehe na Saa ya Kuanza *</label>
                    <input type="datetime-local" name="start_datetime" required class="<?= $tf ?>">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tarehe na Saa ya Kumaliza</label>
                    <input type="datetime-local" name="end_datetime" class="<?= $tf ?>">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Mahali</label>
                    <input type="text" name="location" class="<?= $tf ?>">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Uwezo wa Juu (watu)</label>
                    <input type="number" name="max_capacity" min="1" class="<?= $tf ?>">
                </div>
            </div>
            <div class="flex items-center gap-3">
                <input type="checkbox" name="is_free" id="is_free" value="1" checked x-model="isFree" class="rounded border-gray-300">
                <label for="is_free" class="text-sm text-gray-700 dark:text-gray-300">Tukio hili ni bure</label>
            </div>
            <div x-show="!isFree" class="transition-all">
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Bei ya Tikiti (TZS)</label>
                <input type="number" name="ticket_price" min="0" step="0.01" class="<?= $tf ?> w-48">
            </div>
            <div class="flex items-center gap-3">
                <input type="checkbox" name="requires_registration" id="requires_reg" value="1" class="rounded border-gray-300">
                <label for="requires_reg" class="text-sm text-gray-700 dark:text-gray-300">Inahitaji usajili</label>
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maelezo</label>
                <textarea name="description" rows="3" class="<?= $tf ?> resize-none"></textarea>
            </div>
        </div>

        <div class="flex gap-3">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Unda Tukio</button>
            <a href="/events" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200">Ghairi</a>
        </div>
    </form>
</div>
