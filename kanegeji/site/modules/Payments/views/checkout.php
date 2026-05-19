<div class="space-y-5 max-w-md mx-auto">
    <div class="flex items-center gap-3">
        <a href="<?= $purpose === 'pledge' ? '/pledges' : '/portal' ?>" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Lipa Sasa</h1>
    </div>

    <?php if ($campaign): ?>
    <div class="bg-brand-50 dark:bg-brand-900/20 rounded-2xl p-4 border border-brand-100 dark:border-brand-800">
        <p class="text-sm font-medium text-brand-800 dark:text-brand-300"><?= e($campaign['title']) ?></p>
        <p class="text-xs text-brand-600 dark:text-brand-400 mt-0.5">Kampeni ya mchango</p>
    </div>
    <?php endif; ?>

    <?php if ($pledge): ?>
    <div class="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 border border-amber-100 dark:border-amber-800">
        <p class="text-sm font-medium text-amber-800 dark:text-amber-300"><?= e($pledge['campaign_title']) ?></p>
        <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            Baki ya ahadi: <?= formatCurrency($pledge['amount_pledged'] - $pledge['amount_paid']) ?>
        </p>
    </div>
    <?php endif; ?>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <form method="POST" action="/pay/initiate" class="space-y-5" x-data="{ provider: 'mpesa' }">
            <?= csrf_field() ?>
            <input type="hidden" name="purpose"      value="<?= e($purpose) ?>">
            <input type="hidden" name="reference_id" value="<?= $referenceId ?>">

            <!-- Amount -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kiasi (TZS)</label>
                <input type="number" name="amount" value="<?= $amount > 0 ? $amount : '' ?>"
                       min="100" step="100" required
                       <?= $pledge ? 'readonly' : '' ?>
                       class="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
            </div>

            <!-- Mobile provider -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mtandao wa Simu</label>
                <div class="grid grid-cols-2 gap-2">
                    <?php foreach (['mpesa'=>'M-Pesa','tigopesa'=>'Tigo Pesa','airtelmoney'=>'Airtel Money','halopesa'=>'HaloPesa'] as $key => $label): ?>
                    <label class="flex items-center gap-2 p-3 border-2 rounded-xl cursor-pointer transition-colors"
                           :class="provider === '<?= $key ?>' ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-gray-600'">
                        <input type="radio" name="provider" value="<?= $key ?>" x-model="provider" class="sr-only">
                        <span class="text-sm font-medium text-gray-900 dark:text-white"><?= $label ?></span>
                    </label>
                    <?php endforeach; ?>
                </div>
                <input type="hidden" name="provider" :value="provider">
            </div>

            <!-- Phone -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Namba ya Simu</label>
                <input type="tel" name="phone"
                       value="<?= e($member['phone'] ?? '') ?>"
                       placeholder="07XXXXXXXX" required
                       class="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
                <p class="text-xs text-gray-400 mt-1">Utapokea ombi la uthibitisho kwenye simu hii.</p>
            </div>

            <button type="submit"
                    class="w-full bg-brand-700 text-white py-3 rounded-xl font-semibold hover:bg-brand-800 transition-colors">
                Lipa kwa <span x-text="provider.toUpperCase()">M-PESA</span>
            </button>
        </form>
    </div>

    <p class="text-xs text-center text-gray-400">
        Malipo yanashughulikiwa salama kupitia Selcom PESA.
        Kiasi kitaonekana kwenye rekodi za parokia baada ya kuthibitishwa.
    </p>
</div>
