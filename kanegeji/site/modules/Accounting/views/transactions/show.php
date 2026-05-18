<div class="max-w-2xl mx-auto space-y-5">
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
            <a href="/accounting/transactions" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                </svg>
            </a>
            <div>
                <h1 class="text-lg font-bold text-gray-900 dark:text-white font-mono"><?= e($transaction['reference_no']) ?></h1>
                <p class="text-sm text-gray-500 dark:text-gray-400"><?= e(formatDate($transaction['transaction_date'])) ?></p>
            </div>
        </div>
        <div class="flex items-center gap-2">
            <?php if ($receipt): ?>
            <a href="/accounting/receipts/<?= $receipt['id'] ?>" target="_blank"
               class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 rounded-xl hover:bg-brand-100 transition-colors">
                Angalia Risiti
            </a>
            <?php endif; ?>
            <?php if ($transaction['status'] === 'pending' && \App\Core\Auth::can('accounting.edit')): ?>
            <a href="/accounting/transactions/<?= $transaction['id'] ?>/edit"
               class="inline-flex items-center px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Hariri
            </a>
            <?php endif; ?>
        </div>
    </div>

    <!-- Details card -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <!-- Status + type badges -->
        <div class="flex items-center gap-2 mb-6">
            <span class="px-3 py-1 text-sm rounded-xl font-semibold
                         <?= $transaction['type'] === 'income' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' ?>">
                <?= $transaction['type'] === 'income' ? 'Mapato' : 'Matumizi' ?>
            </span>
            <span class="px-3 py-1 text-sm rounded-xl font-semibold
                         <?= match($transaction['status']) {
                             'approved' => 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                             'pending'  => 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                             default    => 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                         } ?>">
                <?= e(ucfirst($transaction['status'])) ?>
            </span>
        </div>

        <!-- Amount -->
        <div class="text-center mb-6">
            <p class="text-4xl font-bold <?= $transaction['type'] === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>">
                <?= formatCurrency($transaction['amount']) ?>
            </p>
        </div>

        <!-- Fields -->
        <dl class="grid grid-cols-2 gap-x-6 gap-y-4">
            <?php
            $fields = [
                'Kategoria'     => $transaction['category_name'] ?? '-',
                'Njia ya Malipo'=> $transaction['payment_method_name'] ?? '-',
                'Mwanachama'    => $transaction['first_name'] ? trim($transaction['first_name'] . ' ' . $transaction['last_name']) : '-',
                'Jumuiya'       => $transaction['community_name'] ?? '-',
                'Imeandikwa na' => $transaction['recorded_by_name'] ?? '-',
                'Imeidhinishwa na' => $transaction['approved_by_name'] ?? '-',
            ];
            foreach ($fields as $label => $value):
            ?>
            <div>
                <dt class="text-xs text-gray-400 mb-0.5"><?= e($label) ?></dt>
                <dd class="text-sm font-medium text-gray-900 dark:text-white"><?= e($value) ?></dd>
            </div>
            <?php endforeach; ?>
        </dl>

        <?php if ($transaction['description']): ?>
        <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p class="text-xs text-gray-400 mb-1">Maelezo</p>
            <p class="text-sm text-gray-700 dark:text-gray-300"><?= e($transaction['description']) ?></p>
        </div>
        <?php endif; ?>

        <?php if ($transaction['notes']): ?>
        <div class="mt-3">
            <p class="text-xs text-gray-400 mb-1">Maelezo ya Ziada</p>
            <p class="text-sm text-gray-500 dark:text-gray-400"><?= e($transaction['notes']) ?></p>
        </div>
        <?php endif; ?>
    </div>

    <!-- Approval actions -->
    <?php if ($transaction['status'] === 'pending' && \App\Core\Auth::can('accounting.approve')): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h3 class="font-semibold text-gray-900 dark:text-white text-sm mb-4">Hatua ya Idhini</h3>
        <div class="flex gap-3">
            <form method="POST" action="/accounting/transactions/<?= $transaction['id'] ?>/approve" class="flex-1">
                <?= csrf_field() ?>
                <input type="hidden" name="action" value="approve">
                <button type="submit" class="w-full py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors">
                    ✓ Idhinisha
                </button>
            </form>
            <form method="POST" action="/accounting/transactions/<?= $transaction['id'] ?>/approve" class="flex-1">
                <?= csrf_field() ?>
                <input type="hidden" name="action" value="reject">
                <button type="submit"
                        onclick="return confirm('Je, una uhakika wa kukataa muamala huu?')"
                        class="w-full py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors">
                    ✕ Kataa
                </button>
            </form>
        </div>
    </div>
    <?php endif; ?>

    <!-- Danger zone -->
    <?php if ($transaction['status'] === 'pending' && \App\Core\Auth::can('accounting.delete')): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 p-5">
        <form method="POST" action="/accounting/transactions/<?= $transaction['id'] ?>/delete"
              onsubmit="return confirm('<?= e(__('common.confirm_delete', 'Je, una uhakika?')) ?>')">
            <?= csrf_field() ?>
            <button type="submit" class="px-4 py-2 bg-red-600 text-white text-sm rounded-xl hover:bg-red-700 transition-colors">
                Futa Muamala
            </button>
        </form>
    </div>
    <?php endif; ?>
</div>
