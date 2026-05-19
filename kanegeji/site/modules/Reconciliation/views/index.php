<?php
$months = [];
for ($i = 11; $i >= 0; $i--) {
    $key        = date('Y-m', strtotime("-{$i} months"));
    $months[$key] = date('M Y', strtotime("-{$i} months"));
}
?>
<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Uoanishaji wa Benki</h1>
        <div class="flex gap-2">
            <form method="GET" class="flex gap-2">
                <select name="month" onchange="this.form.submit()" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-700 dark:text-gray-300">
                    <?php foreach ($months as $val => $label): ?>
                    <option value="<?= $val ?>" <?= $val === $month ? 'selected' : '' ?>><?= $label ?></option>
                    <?php endforeach; ?>
                </select>
            </form>
            <?php if (auth()->can('accounting.approve') && ($summary['matched'] ?? 0) > 0): ?>
            <form method="POST" action="/reconciliation/reconcile">
                <?= csrf_field() ?>
                <input type="hidden" name="month" value="<?= e($month) ?>">
                <button class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700">Thibitisha Zote</button>
            </form>
            <?php endif; ?>
        </div>
    </div>

    <!-- Summary cards -->
    <?php if ($summary): ?>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Vifungu Vyote</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white mt-1"><?= $summary['total'] ?? 0 ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Havijaoana</div>
            <div class="text-2xl font-bold text-red-600 dark:text-red-400 mt-1"><?= $summary['unmatched'] ?? 0 ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Jumla Mapato</div>
            <div class="text-xl font-bold text-green-600 dark:text-green-400 mt-1"><?= formatCurrency($summary['total_credits'] ?? 0) ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Jumla Matumizi</div>
            <div class="text-xl font-bold text-red-600 dark:text-red-400 mt-1"><?= formatCurrency($summary['total_debits'] ?? 0) ?></div>
        </div>
    </div>
    <?php endif; ?>

    <!-- Import form -->
    <?php if (auth()->can('accounting.create')): ?>
    <details class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <summary class="px-5 py-4 cursor-pointer font-semibold text-gray-900 dark:text-white text-sm select-none">
            Ingiza Taarifa ya Benki (CSV)
        </summary>
        <form method="POST" action="/reconciliation/import" class="px-5 pb-5 pt-2 space-y-3">
            <?= csrf_field() ?>
            <p class="text-xs text-gray-400">Muundo: tarehe,maelezo,mapato,matumizi — kila mstari moja</p>
            <textarea name="statement_text" rows="6" placeholder="2026-01-05,Zaka ya Jumuiya A,500000,0&#10;2026-01-07,Malipo ya Umeme,0,150000"
                class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"></textarea>
            <button type="submit" class="px-5 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Ingiza</button>
        </form>
    </details>
    <?php endif; ?>

    <!-- Items table -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($items)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna vifungu vya <?= e($months[$month] ?? $month) ?>. Ingiza taarifa ya benki.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Tarehe</th>
                        <th class="text-left px-5 py-3.5">Maelezo</th>
                        <th class="text-right px-5 py-3.5">Kiasi</th>
                        <th class="text-left px-5 py-3.5">Aina</th>
                        <th class="text-left px-5 py-3.5">Muamala Unaofanana</th>
                        <th class="text-center px-5 py-3.5">Hali</th>
                        <th class="px-5 py-3.5"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($items as $item):
                        $sc = match($item['status']) {
                            'reconciled' => 'green',
                            'matched'    => 'blue',
                            default      => 'yellow',
                        };
                    ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400 whitespace-nowrap"><?= formatDate($item['statement_date']) ?></td>
                        <td class="px-5 py-3.5 text-gray-900 dark:text-white max-w-xs truncate"><?= e($item['description']) ?></td>
                        <td class="px-5 py-3.5 text-right font-semibold <?= $item['type'] === 'credit' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>">
                            <?= $item['type'] === 'credit' ? '+' : '-' ?><?= formatCurrency($item['amount']) ?>
                        </td>
                        <td class="px-5 py-3.5 text-gray-500 dark:text-gray-400 capitalize"><?= e($item['type'] === 'credit' ? 'Mapato' : 'Matumizi') ?></td>
                        <td class="px-5 py-3.5">
                            <?php if ($item['status'] === 'reconciled'): ?>
                                <span class="text-xs text-gray-400"><?= e($item['tx_desc'] ?? $item['reference_number'] ?? '-') ?></span>
                            <?php elseif ($item['status'] === 'matched'): ?>
                                <span class="text-xs text-blue-600 dark:text-blue-400"><?= e($item['reference_number'] ?? $item['tx_desc'] ?? '-') ?></span>
                            <?php else: ?>
                            <?php if (auth()->can('accounting.create')): ?>
                            <form method="POST" action="/reconciliation/match" class="flex gap-1 items-center">
                                <?= csrf_field() ?>
                                <input type="hidden" name="item_id" value="<?= $item['id'] ?>">
                                <input type="number" name="transaction_id" placeholder="ID ya muamala" min="1"
                                    class="w-32 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs px-2 py-1.5 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500">
                                <button class="px-2 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Oana</button>
                            </form>
                            <?php endif; ?>
                            <?php endif; ?>
                        </td>
                        <td class="px-5 py-3.5 text-center">
                            <span class="px-2 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize">
                                <?= e(['unmatched'=>'Haijaoana','matched'=>'Imeoana','reconciled'=>'Imethibitishwa'][$item['status']] ?? $item['status']) ?>
                            </span>
                        </td>
                        <td class="px-5 py-3.5">
                            <?php if (auth()->can('accounting.delete') && $item['status'] === 'unmatched'): ?>
                            <form method="POST" action="/reconciliation/delete" onsubmit="return confirm('Futa kifungu hiki?')">
                                <?= csrf_field() ?>
                                <input type="hidden" name="item_id" value="<?= $item['id'] ?>">
                                <button class="text-xs text-red-500 hover:text-red-700">Futa</button>
                            </form>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>
</div>
