<div class="max-w-2xl mx-auto space-y-5">
    <div class="flex items-center gap-3">
        <a href="/accounting/transactions" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($pageTitle) ?></h1>
    </div>

    <form method="POST"
          action="<?= isset($editing) ? '/accounting/transactions/' . $transaction['id'] : '/accounting/transactions' ?>"
          x-data="{ txType: '<?= e($transaction['type'] ?? 'income') ?>' }"
          class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-5">
        <?= csrf_field() ?>

        <!-- Type selector -->
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Aina ya Muamala *</label>
            <div class="flex gap-3">
                <?php foreach (['income' => 'Mapato', 'expense' => 'Matumizi'] as $v => $l): ?>
                <label class="flex-1 relative cursor-pointer">
                    <input type="radio" name="type" value="<?= $v ?>" x-model="txType"
                           class="sr-only" <?= ($transaction['type'] ?? 'income') === $v ? 'checked' : '' ?>>
                    <div :class="txType === '<?= $v ?>' ? '<?= $v === 'income' ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' ?>' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'"
                          class="border-2 rounded-xl px-4 py-3 text-center text-sm font-semibold transition-all">
                        <?= $l ?>
                    </div>
                </label>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Category -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Kategoria</label>
                <select name="category_id" class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">-- Chagua --</option>
                    <?php foreach ($categories as $c): ?>
                    <option value="<?= $c['id'] ?>" data-type="<?= $c['type'] ?>"
                            <?= ($transaction['category_id'] ?? '') == $c['id'] ? 'selected' : '' ?>>
                        <?= e($c['name']) ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <!-- Amount -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('accounting.amount', 'Kiasi')) ?> (TZS) *</label>
                <input type="number" name="amount" min="1" step="0.01" required
                       value="<?= e($transaction['amount'] ?? '') ?>"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>

            <!-- Date -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('accounting.date', 'Tarehe')) ?> *</label>
                <input type="date" name="transaction_date" required
                       value="<?= e($transaction['transaction_date'] ?? date('Y-m-d')) ?>"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>

            <!-- Payment method -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Njia ya Malipo</label>
                <select name="payment_method_id" class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">-- Chagua --</option>
                    <?php foreach ($payment_methods as $pm): ?>
                    <option value="<?= $pm['id'] ?>" <?= ($transaction['payment_method_id'] ?? '') == $pm['id'] ? 'selected' : '' ?>>
                        <?= e($pm['name']) ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <!-- Community -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Jumuiya</label>
                <select name="community_id" class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">-- Yote / Hakuna --</option>
                    <?php foreach ($communities as $c): ?>
                    <option value="<?= $c['id'] ?>" <?= ($transaction['community_id'] ?? '') == $c['id'] ? 'selected' : '' ?>>
                        <?= e($c['name']) ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <!-- Member -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Mwanachama (si lazima)</label>
                <select name="member_id" class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">-- Hakuna / Isiyojulikana --</option>
                    <?php foreach ($members as $m): ?>
                    <option value="<?= $m['id'] ?>" <?= ($transaction['member_id'] ?? '') == $m['id'] ? 'selected' : '' ?>>
                        <?= e($m['first_name'] . ' ' . $m['last_name']) ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>
        </div>

        <!-- Description -->
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Maelezo</label>
            <textarea name="description" rows="2"
                      class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"><?= e($transaction['description'] ?? '') ?></textarea>
        </div>

        <!-- Notes -->
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Maelezo ya Ziada</label>
            <textarea name="notes" rows="2"
                      class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"><?= e($transaction['notes'] ?? '') ?></textarea>
        </div>

        <div class="flex items-center gap-3">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-semibold rounded-xl hover:bg-brand-800 transition-colors">
                Hifadhi
            </button>
            <a href="/accounting/transactions" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Ghairi
            </a>
        </div>
    </form>
</div>
