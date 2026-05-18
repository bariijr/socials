<div class="space-y-5 max-w-3xl">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <a href="/inventory" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($asset['name']) ?></h1>
        </div>
        <div class="flex gap-2">
            <a href="/inventory/<?= $asset['id'] ?>/qr" target="_blank" class="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-xl hover:bg-gray-200">QR Label</a>
            <?php if (auth()->can('inventory_manage')): ?>
            <a href="/inventory/<?= $asset['id'] ?>/edit" class="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Hariri</a>
            <?php endif; ?>
        </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><div class="text-xs text-gray-400">Nambari</div><div class="font-mono font-medium text-gray-900 dark:text-white mt-0.5"><?= e($asset['asset_number']) ?></div></div>
            <div><div class="text-xs text-gray-400">Aina</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($asset['category_name'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Mahali</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($asset['location'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Serial</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($asset['serial_number'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Bei ya Kununua</div><div class="text-gray-900 dark:text-white mt-0.5"><?= $asset['purchase_price'] ? formatCurrency($asset['purchase_price']) : '-' ?></div></div>
            <div><div class="text-xs text-gray-400">Thamani ya Sasa</div><div class="font-semibold text-brand-700 dark:text-brand-400 mt-0.5"><?= $asset['current_value'] ? formatCurrency($asset['current_value']) : '-' ?></div></div>
            <div><div class="text-xs text-gray-400">Tarehe ya Kununua</div><div class="text-gray-900 dark:text-white mt-0.5"><?= $asset['purchase_date'] ? formatDate($asset['purchase_date']) : '-' ?></div></div>
            <div><div class="text-xs text-gray-400">Hali</div>
                <?php $sc = ['excellent'=>'green','good'=>'blue','fair'=>'yellow','poor'=>'red','disposed'=>'gray'][$asset['condition_status']] ?? 'gray' ?>
                <span class="mt-0.5 inline-block px-2 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($asset['condition_status']) ?></span>
            </div>
            <div><div class="text-xs text-gray-400">Status</div>
                <?php $ss = ['active'=>'green','maintenance'=>'yellow','disposed'=>'red'][$asset['status']] ?? 'gray' ?>
                <span class="mt-0.5 inline-block px-2 py-0.5 rounded-full text-xs bg-<?= $ss ?>-100 text-<?= $ss ?>-700 dark:bg-<?= $ss ?>-900/30 dark:text-<?= $ss ?>-400 capitalize"><?= e($asset['status']) ?></span>
            </div>
            <?php if ($asset['warranty_expiry']): ?>
            <div><div class="text-xs text-gray-400">Dhamana Inaisha</div><div class="text-gray-900 dark:text-white mt-0.5"><?= formatDate($asset['warranty_expiry']) ?></div></div>
            <?php endif; ?>
            <?php if ($asset['supplier']): ?>
            <div><div class="text-xs text-gray-400">Muuzaji</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($asset['supplier']) ?></div></div>
            <?php endif; ?>
        </div>
        <?php if ($asset['notes']): ?>
        <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div class="text-xs text-gray-400 mb-1">Maelezo</div>
            <div class="text-sm text-gray-700 dark:text-gray-300"><?= nl2br(e($asset['notes'])) ?></div>
        </div>
        <?php endif; ?>
    </div>

    <?php if (auth()->can('inventory_manage')): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 class="font-semibold text-gray-900 dark:text-white mb-4">Ongeza Rekodi ya Matengenezo</h2>
        <form method="POST" action="/inventory/<?= $asset['id'] ?>/maintenance" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <?= csrf_field() ?>
            <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tarehe *</label><input type="date" name="maintenance_date" value="<?= date('Y-m-d') ?>" required class="<?= $tf ?>"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aina</label><select name="type" class="<?= $tf ?>"><option value="preventive">Kinga</option><option value="corrective">Kurekebisha</option><option value="inspection">Ukaguzi</option></select></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aliyefanya</label><input type="text" name="performed_by" class="<?= $tf ?>"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Gharama (TZS)</label><input type="number" name="cost" value="0" min="0" class="<?= $tf ?>"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Matengenezo Yanayofuata</label><input type="date" name="next_maintenance_date" class="<?= $tf ?>"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Hali Mpya (optional)</label><select name="new_condition" class="<?= $tf ?>"><option value="">-- Bila mabadiliko --</option><option value="excellent">Nzuri Sana</option><option value="good">Nzuri</option><option value="fair">Wastani</option><option value="poor">Mbaya</option></select></div>
            <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maelezo *</label><textarea name="description" rows="2" required class="<?= $tf ?> resize-none"></textarea></div>
            <div><button type="submit" class="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700">Hifadhi Rekodi</button></div>
        </form>
    </div>
    <?php endif; ?>

    <?php if (!empty($maintenance)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700"><h2 class="font-semibold text-gray-900 dark:text-white">Historia ya Matengenezo</h2></div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($maintenance as $log): ?>
            <div class="px-5 py-4 text-sm">
                <div class="flex items-start justify-between">
                    <div>
                        <div class="font-medium text-gray-900 dark:text-white capitalize"><?= e($log['type']) ?> — <?= formatDate($log['maintenance_date']) ?></div>
                        <div class="text-gray-500 dark:text-gray-400 mt-0.5"><?= e($log['description']) ?></div>
                        <?php if ($log['performed_by']): ?><div class="text-xs text-gray-400 mt-0.5">Alifanya: <?= e($log['performed_by']) ?></div><?php endif; ?>
                    </div>
                    <div class="text-right ml-4 flex-shrink-0">
                        <div class="font-medium text-gray-900 dark:text-white"><?= formatCurrency($log['cost']) ?></div>
                        <?php if ($log['next_maintenance_date']): ?><div class="text-xs text-gray-400">Ijayo: <?= formatDate($log['next_maintenance_date']) ?></div><?php endif; ?>
                    </div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>
</div>
