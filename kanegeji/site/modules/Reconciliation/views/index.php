<?php
$months = [];
for ($i = 11; $i >= 0; $i--) {
    $key          = date('Y-m', strtotime("-{$i} months"));
    $months[$key] = date('M Y', strtotime("-{$i} months"));
}
$total      = (int) ($summary['total']      ?? 0);
$unmatched  = (int) ($summary['unmatched']  ?? 0);
$matched    = (int) ($summary['matched']    ?? 0);
$reconciled = (int) ($summary['reconciled'] ?? 0);
$pctDone    = $total > 0 ? round(($matched + $reconciled) / $total * 100) : 0;

$bankNet    = (float) ($summary['total_credits'] ?? 0) - (float) ($summary['total_debits'] ?? 0);
$sysNet     = (float) ($systemTotals['system_income'] ?? 0) - (float) ($systemTotals['system_expense'] ?? 0);
$difference = $bankNet - $sysNet;
?>
<div class="space-y-5" x-data="txPicker()">

    <!-- ── Header ─────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">Uoanishaji wa Benki</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">Linganisha taarifa ya benki na miamala ya mfumo</p>
        </div>
        <div class="flex gap-2 flex-wrap">
            <!-- Month picker -->
            <form method="GET">
                <select name="month" onchange="this.form.submit()"
                    class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <?php foreach ($months as $val => $label): ?>
                    <option value="<?= $val ?>" <?= $val === $month ? 'selected' : '' ?>><?= $label ?></option>
                    <?php endforeach; ?>
                </select>
            </form>

            <!-- Auto-match -->
            <?php if (\App\Core\Auth::can('accounting.create') && $unmatched > 0): ?>
            <form method="POST" action="/reconciliation/auto-match">
                <?= csrf_field() ?>
                <input type="hidden" name="month" value="<?= e($month) ?>">
                <button class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    Oana Kiotomatiki
                </button>
            </form>
            <?php endif; ?>

            <!-- Finalise / reconcile all matched -->
            <?php if (\App\Core\Auth::can('accounting.approve') && $matched > 0): ?>
            <form method="POST" action="/reconciliation/reconcile">
                <?= csrf_field() ?>
                <input type="hidden" name="month" value="<?= e($month) ?>">
                <button class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    Thibitisha (<?= $matched ?>)
                </button>
            </form>
            <?php endif; ?>
        </div>
    </div>

    <!-- ── Summary cards ──────────────────────────────────────────── -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400 mb-1">Vifungu Vyote</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white"><?= $total ?></div>
            <div class="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div class="h-full rounded-full bg-brand-500 transition-all" style="width:<?= $pctDone ?>%"></div>
            </div>
            <div class="text-xs text-gray-400 mt-1"><?= $pctDone ?>% imeshughulikiwa</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400 mb-1">Havijaoana</div>
            <div class="text-2xl font-bold text-red-600 dark:text-red-400"><?= $unmatched ?></div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Zinahitaji mwangano</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400 mb-1">Jumla Mapato (Benki)</div>
            <div class="text-lg font-bold text-green-600 dark:text-green-400"><?= formatCurrency((float)($summary['total_credits'] ?? 0)) ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400 mb-1">Jumla Matumizi (Benki)</div>
            <div class="text-lg font-bold text-red-600 dark:text-red-400"><?= formatCurrency((float)($summary['total_debits'] ?? 0)) ?></div>
        </div>
    </div>

    <!-- ── Reconciliation difference panel ────────────────────────── -->
    <?php if ($total > 0): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <h2 class="font-semibold text-sm text-gray-700 dark:text-gray-200 mb-3">Tofauti: Benki vs Mfumo (<?= e($months[$month] ?? $month) ?>)</h2>
        <div class="grid grid-cols-3 gap-4 text-sm">
            <div>
                <div class="text-xs text-gray-400 mb-0.5">Mtandao wa Benki</div>
                <div class="font-bold <?= $bankNet >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>"><?= formatCurrency($bankNet) ?></div>
                <div class="text-xs text-gray-400 mt-1"><?= formatCurrency((float)($summary['total_credits'] ?? 0)) ?> mapato − <?= formatCurrency((float)($summary['total_debits'] ?? 0)) ?> matumizi</div>
            </div>
            <div>
                <div class="text-xs text-gray-400 mb-0.5">Mtandao wa Mfumo</div>
                <div class="font-bold <?= $sysNet >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>"><?= formatCurrency($sysNet) ?></div>
                <div class="text-xs text-gray-400 mt-1"><?= formatCurrency((float)($systemTotals['system_income'] ?? 0)) ?> mapato − <?= formatCurrency((float)($systemTotals['system_expense'] ?? 0)) ?> matumizi</div>
            </div>
            <div>
                <div class="text-xs text-gray-400 mb-0.5">Tofauti</div>
                <div class="font-bold text-xl <?= abs($difference) < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400' ?>">
                    <?= abs($difference) < 0.01 ? '✓ Inalingana' : formatCurrency(abs($difference)) ?>
                </div>
                <?php if (abs($difference) >= 0.01): ?>
                <div class="text-xs text-gray-400 mt-1"><?= $difference > 0 ? 'Benki ni zaidi' : 'Mfumo ni zaidi' ?></div>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <!-- ── Import form ─────────────────────────────────────────────── -->
    <?php if (\App\Core\Auth::can('accounting.create')): ?>
    <details class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <summary class="px-5 py-4 cursor-pointer font-semibold text-gray-900 dark:text-white text-sm select-none flex items-center gap-2">
            <svg class="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            Ingiza Taarifa ya Benki (CSV)
        </summary>
        <form method="POST" action="/reconciliation/import" enctype="multipart/form-data" class="px-5 pb-5 pt-2 space-y-3">
            <?= csrf_field() ?>
            <p class="text-xs text-gray-400">
                Muundo wa CSV: <code class="bg-gray-100 dark:bg-gray-700 rounded px-1">tarehe,maelezo,mapato,matumizi</code> — kila mstari moja.<br>
                Mfano: <code class="bg-gray-100 dark:bg-gray-700 rounded px-1">2026-01-05,Zaka ya Jumuiya A,500000,0</code>
            </p>
            <!-- File upload -->
            <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-300">Pakia faili la CSV (hiari)</label>
                <input type="file" name="statement_file" accept=".csv,.txt"
                    class="mt-1 block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-50 file:text-brand-700 dark:file:bg-brand-900/30 dark:file:text-brand-300 hover:file:bg-brand-100">
            </div>
            <!-- Text paste -->
            <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-300">Au bandika hapa chini</label>
                <textarea name="statement_text" rows="5"
                    placeholder="2026-01-05,Zaka ya Jumuiya A,500000,0&#10;2026-01-07,Malipo ya Umeme,0,150000&#10;2026-01-10,Sadaka ya Jumapili,320000,0"
                    class="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"></textarea>
            </div>
            <button type="submit" class="px-5 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">
                Ingiza
            </button>
        </form>
    </details>
    <?php endif; ?>

    <!-- ── Items table ─────────────────────────────────────────────── -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($items)): ?>
        <div class="p-12 text-center text-gray-400">
            <svg class="w-10 h-10 mx-auto mb-3 text-gray-200 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <p class="text-sm">Hakuna vifungu vya <?= e($months[$month] ?? $month) ?>.</p>
            <p class="text-xs mt-1">Ingiza taarifa ya benki hapo juu.</p>
        </div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <tr>
                        <th class="text-left px-4 py-3">Tarehe</th>
                        <th class="text-left px-4 py-3">Maelezo (Benki)</th>
                        <th class="text-right px-4 py-3">Kiasi</th>
                        <th class="text-left px-4 py-3">Muamala Unaofanana</th>
                        <th class="text-center px-4 py-3">Hali</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50">
                <?php foreach ($items as $item):
                    $badge = match($item['status']) {
                        'reconciled' => 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400',
                        'matched'    => 'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-400',
                        default      => 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                    };
                    $labelMap = ['unmatched' => 'Haijaoana', 'matched' => 'Imeoana', 'reconciled' => 'Imethibitishwa'];
                ?>
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                    <!-- Date -->
                    <td class="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400 text-xs">
                        <?= formatDate($item['statement_date']) ?>
                    </td>
                    <!-- Description -->
                    <td class="px-4 py-3 max-w-xs">
                        <span class="truncate block text-gray-900 dark:text-white"><?= e($item['description']) ?></span>
                        <span class="text-xs text-gray-400"><?= $item['type'] === 'credit' ? 'Mapato' : 'Matumizi' ?></span>
                    </td>
                    <!-- Amount -->
                    <td class="px-4 py-3 text-right font-semibold whitespace-nowrap <?= $item['type'] === 'credit' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' ?>">
                        <?= $item['type'] === 'credit' ? '+' : '−' ?><?= formatCurrency((float) $item['amount']) ?>
                    </td>
                    <!-- Matched transaction -->
                    <td class="px-4 py-3">
                        <?php if ($item['status'] !== 'unmatched' && $item['tx_ref']): ?>
                            <div class="text-xs">
                                <span class="font-medium text-gray-800 dark:text-gray-200"><?= e($item['tx_ref']) ?></span>
                                <?php if ($item['tx_desc']): ?>
                                <span class="text-gray-400"> — <?= e(mb_substr($item['tx_desc'], 0, 60)) ?></span>
                                <?php endif; ?>
                            </div>
                            <div class="text-xs text-gray-400 mt-0.5">
                                <?= formatDate($item['tx_date']) ?>
                                <?php if ($item['tx_category']): ?> · <?= e($item['tx_category']) ?><?php endif; ?>
                                · <?= formatCurrency((float) $item['tx_amount']) ?>
                            </div>
                        <?php elseif ($item['status'] === 'unmatched' && \App\Core\Auth::can('accounting.create')): ?>
                            <!-- Picker trigger -->
                            <button type="button"
                                @click="open(<?= $item['id'] ?>, <?= $item['amount'] ?>, '<?= e($item['statement_date']) ?>', '<?= e($item['type']) ?>')"
                                class="text-xs px-3 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors font-medium">
                                Pata Muamala…
                            </button>
                        <?php else: ?>
                            <span class="text-xs text-gray-400">—</span>
                        <?php endif; ?>
                    </td>
                    <!-- Status badge -->
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-medium <?= $badge ?>">
                            <?= $labelMap[$item['status']] ?? $item['status'] ?>
                        </span>
                    </td>
                    <!-- Actions -->
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                        <?php if ($item['status'] === 'matched' && \App\Core\Auth::can('accounting.create')): ?>
                        <form method="POST" action="/reconciliation/match" class="inline">
                            <?= csrf_field() ?>
                            <input type="hidden" name="item_id" value="<?= $item['id'] ?>">
                            <input type="hidden" name="transaction_id" value="0">
                            <button class="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                Ondoa
                            </button>
                        </form>
                        <?php elseif ($item['status'] === 'unmatched' && \App\Core\Auth::can('accounting.delete')): ?>
                        <form method="POST" action="/reconciliation/delete" class="inline"
                              onsubmit="return confirm('Futa kifungu hiki?')">
                            <?= csrf_field() ?>
                            <input type="hidden" name="item_id" value="<?= $item['id'] ?>">
                            <button class="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                Futa
                            </button>
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

    <!-- ── Transaction picker modal ───────────────────────────────── -->
    <div x-show="isOpen" x-cloak
         class="fixed inset-0 z-50 flex items-center justify-center p-4"
         @keydown.escape.window="close()">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="close()"></div>

        <!-- Panel -->
        <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <!-- Modal header -->
            <div class="flex items-start justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white">Chagua Muamala</h3>
                    <p class="text-xs text-gray-400 mt-0.5" x-text="itemLabel"></p>
                </div>
                <button @click="close()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>

            <!-- Search box -->
            <div class="px-5 pt-3 pb-2">
                <input type="text" x-model="searchQuery" @input.debounce.300ms="fetchCandidates()"
                    placeholder="Tafuta kwa maelezo au kiasi…"
                    class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>

            <!-- Candidates list -->
            <div class="overflow-y-auto flex-1 px-5 pb-3">
                <div x-show="loading" class="py-6 text-center text-sm text-gray-400">
                    <svg class="animate-spin w-5 h-5 mx-auto mb-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Inatafuta…
                </div>
                <div x-show="!loading && candidates.length === 0" class="py-6 text-center text-sm text-gray-400">
                    Hakuna miamala inayofanana ilipatikana.
                </div>
                <template x-for="tx in candidates" :key="tx.id">
                    <div @click="selectTx(tx)"
                         :class="selectedId === tx.id
                             ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                             : 'border-gray-100 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600'"
                         class="mt-2 first:mt-0 border-2 rounded-xl p-3 cursor-pointer transition-colors">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <div class="text-sm font-medium text-gray-900 dark:text-white" x-text="tx.reference_no"></div>
                                <div class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5" x-text="tx.description || '—'"></div>
                                <div class="flex gap-2 mt-1">
                                    <span class="text-xs text-gray-400" x-text="tx.transaction_date"></span>
                                    <span class="text-xs text-gray-400" x-text="tx.category_name ? '· ' + tx.category_name : ''"></span>
                                    <span class="px-1.5 py-0.5 rounded text-xs"
                                          :class="tx.status === 'approved'
                                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'"
                                          x-text="tx.status === 'approved' ? 'Imeidhinishwa' : 'Inasubiri'"></span>
                                </div>
                            </div>
                            <div class="text-right shrink-0">
                                <div class="font-bold text-sm"
                                     :class="tx.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                                     x-text="'TZS ' + Number(tx.amount).toLocaleString('en-US', {minimumFractionDigits:2})"></div>
                                <div x-show="selectedId === tx.id" class="text-xs text-brand-600 dark:text-brand-400 font-medium mt-0.5">✓ Imechaguliwa</div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

            <!-- Modal footer -->
            <div class="border-t border-gray-100 dark:border-gray-700 p-4 flex gap-3 justify-end">
                <button @click="close()" class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                    Ghairi
                </button>
                <form method="POST" action="/reconciliation/match">
                    <?= csrf_field() ?>
                    <input type="hidden" name="item_id"        :value="activeItemId">
                    <input type="hidden" name="transaction_id" :value="selectedId">
                    <button type="submit"
                            :disabled="!selectedId"
                            :class="selectedId
                                ? 'bg-brand-700 hover:bg-brand-800 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'"
                            class="px-5 py-2 text-sm font-medium rounded-xl transition-colors">
                        Thibitisha Mwangano
                    </button>
                </form>
            </div>
        </div>
    </div>

</div><!-- /x-data -->

<script>
function txPicker() {
    return {
        isOpen:       false,
        loading:      false,
        activeItemId: null,
        itemLabel:    '',
        candidates:   [],
        selectedId:   null,
        searchQuery:  '',
        _amount:      0,
        _date:        '',
        _type:        '',

        open(itemId, amount, date, type) {
            this.activeItemId = itemId;
            this.selectedId   = null;
            this.searchQuery  = '';
            this._amount      = amount;
            this._date        = date;
            this._type        = type;
            this.itemLabel    = (type === 'credit' ? 'Mapato' : 'Matumizi') +
                                ' · TZS ' + Number(amount).toLocaleString('en-US', {minimumFractionDigits: 2}) +
                                ' · ' + date;
            this.isOpen       = true;
            this.fetchCandidates();
        },

        close() {
            this.isOpen = false;
        },

        selectTx(tx) {
            this.selectedId = (this.selectedId === tx.id) ? null : tx.id;
        },

        fetchCandidates() {
            this.loading    = true;
            this.candidates = [];
            const params = new URLSearchParams({
                amount: this._amount,
                date:   this._date,
                type:   this._type,
                q:      this.searchQuery,
            });
            fetch('/reconciliation/search-transactions?' + params.toString())
                .then(r => r.json())
                .then(data => { this.candidates = data; this.loading = false; })
                .catch(() => { this.loading = false; });
        },
    };
}
</script>
