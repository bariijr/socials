<div class="space-y-5 max-w-xl">
    <div class="flex items-center gap-3">
        <a href="/sacraments" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Rekodi ya Sakramenti</h1>
    </div>

    <form method="POST" action="/sacraments" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <?= csrf_field() ?>
        <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>

        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Mwanachama *</label>
            <?php if ($member): ?>
            <input type="hidden" name="member_id" value="<?= $member['id'] ?>">
            <div class="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900">
                <?= e($member['first_name'] . ' ' . $member['last_name']) ?> <span class="text-gray-400 text-xs ml-2"><?= e($member['member_number']) ?></span>
            </div>
            <?php else: ?>
            <input type="number" name="member_id" required placeholder="ID ya mwanachama" class="<?= $tf ?>">
            <?php endif; ?>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aina ya Sakramenti *</label>
            <select name="type" required class="<?= $tf ?>">
                <option value="">-- Chagua --</option>
                <option value="baptism">Ubatizo</option>
                <option value="confirmation">Kipaimara</option>
                <option value="first_communion">Komunyo ya Kwanza</option>
                <option value="marriage">Ndoa</option>
                <option value="holy_orders">Upadre</option>
                <option value="anointing">Upako wa Wagonjwa</option>
            </select>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tarehe Iliyopokelewa</label>
            <input type="date" name="date_received" class="<?= $tf ?>">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aliyehudumia (Kasisi)</label>
            <input type="text" name="officiant" class="<?= $tf ?>">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Mashahidi</label>
            <input type="text" name="witnesses" class="<?= $tf ?>">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Nambari ya Cheti</label>
            <input type="text" name="certificate_no" class="<?= $tf ?>">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maelezo ya Ziada</label>
            <textarea name="notes" rows="2" class="<?= $tf ?> resize-none"></textarea>
        </div>
        <div class="flex gap-3 pt-2">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Hifadhi Rekodi</button>
            <a href="<?= $member ? '/members/' . $member['id'] : '/sacraments' ?>" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200">Ghairi</a>
        </div>
    </form>
</div>
