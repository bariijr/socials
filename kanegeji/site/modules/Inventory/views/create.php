<div class="space-y-5 max-w-2xl">
    <div class="flex items-center gap-3">
        <a href="/inventory" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Ongeza Mali Mpya</h1>
    </div>

    <form method="POST" action="/inventory" class="space-y-5">
        <?= csrf_field() ?>
        <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <h2 class="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Taarifa za Mali</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jina la Mali *</label><input type="text" name="name" required class="<?= $tf ?>"></div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aina / Kategoria</label>
                    <select name="category_id" class="<?= $tf ?>"><option value="">-- Chagua --</option><?php foreach ($categories as $cat): ?><option value="<?= $cat['id'] ?>"><?= e($cat['name']) ?></option><?php endforeach; ?></select>
                </div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Nambari ya Serial</label><input type="text" name="serial_number" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Mahali Ilipo</label><input type="text" name="location" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Hali</label><select name="condition_status" class="<?= $tf ?>"><option value="excellent">Nzuri Sana</option><option value="good" selected>Nzuri</option><option value="fair">Wastani</option><option value="poor">Mbaya</option></select></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tarehe ya Kununua</label><input type="date" name="purchase_date" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Bei ya Kununua (TZS)</label><input type="number" name="purchase_price" min="0" step="0.01" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Thamani ya Sasa (TZS)</label><input type="number" name="current_value" min="0" step="0.01" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Muuzaji</label><input type="text" name="supplier" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Dhamana Inaisha</label><input type="date" name="warranty_expiry" class="<?= $tf ?>"></div>
                <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maelezo</label><textarea name="description" rows="2" class="<?= $tf ?> resize-none"></textarea></div>
                <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maelezo ya Ziada</label><textarea name="notes" rows="2" class="<?= $tf ?> resize-none"></textarea></div>
            </div>
        </div>

        <div class="flex gap-3">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Sajili Mali</button>
            <a href="/inventory" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600">Ghairi</a>
        </div>
    </form>
</div>
