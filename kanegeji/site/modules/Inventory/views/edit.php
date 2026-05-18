<div class="space-y-5 max-w-2xl">
    <div class="flex items-center gap-3">
        <a href="/inventory/<?= $asset['id'] ?>" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Hariri — <?= e($asset['name']) ?></h1>
    </div>

    <form method="POST" action="/inventory/<?= $asset['id'] ?>" class="space-y-5">
        <?= csrf_field() ?>
        <input type="hidden" name="_method" value="PUT">
        <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jina la Mali *</label><input type="text" name="name" value="<?= e($asset['name']) ?>" required class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Kategoria</label><select name="category_id" class="<?= $tf ?>"><option value="">--</option><?php foreach ($categories as $cat): ?><option value="<?= $cat['id'] ?>" <?= $asset['category_id'] == $cat['id'] ? 'selected' : '' ?>><?= e($cat['name']) ?></option><?php endforeach; ?></select></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Serial</label><input type="text" name="serial_number" value="<?= e($asset['serial_number'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Mahali</label><input type="text" name="location" value="<?= e($asset['location'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Hali</label><select name="condition_status" class="<?= $tf ?>"><?php foreach (['excellent'=>'Nzuri Sana','good'=>'Nzuri','fair'=>'Wastani','poor'=>'Mbaya','disposed'=>'Imetupwa'] as $v=>$l): ?><option value="<?= $v ?>" <?= $asset['condition_status']===$v?'selected':'' ?>><?= $l ?></option><?php endforeach; ?></select></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Status</label><select name="status" class="<?= $tf ?>"><?php foreach (['active'=>'Inafanya kazi','maintenance'=>'Matengenezo','disposed'=>'Imetupwa'] as $v=>$l): ?><option value="<?= $v ?>" <?= $asset['status']===$v?'selected':'' ?>><?= $l ?></option><?php endforeach; ?></select></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Bei ya Kununua</label><input type="number" name="purchase_price" value="<?= $asset['purchase_price'] ?? '' ?>" min="0" step="0.01" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Thamani ya Sasa</label><input type="number" name="current_value" value="<?= $asset['current_value'] ?? '' ?>" min="0" step="0.01" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Muuzaji</label><input type="text" name="supplier" value="<?= e($asset['supplier'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Dhamana Inaisha</label><input type="date" name="warranty_expiry" value="<?= e($asset['warranty_expiry'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maelezo</label><textarea name="notes" rows="3" class="<?= $tf ?> resize-none"><?= e($asset['notes'] ?? '') ?></textarea></div>
            </div>
        </div>

        <div class="flex gap-3">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Hifadhi</button>
            <a href="/inventory/<?= $asset['id'] ?>" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200">Ghairi</a>
        </div>
    </form>
</div>
