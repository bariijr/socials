<div class="max-w-md mx-auto space-y-5">
    <div class="text-center py-6">
        <?php if ($payment['status'] === 'completed'): ?>
        <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">Malipo Yamekamilika</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Asante kwa mchango wako.</p>

        <?php elseif ($payment['status'] === 'failed'): ?>
        <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">Malipo Hayakufanikiwa</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Tafadhali jaribu tena.</p>

        <?php else: ?>
        <div class="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-amber-600 dark:text-amber-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">Inasubiri Uthibitisho</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Thibitisha ombi kwenye simu yako kisha ukurasa huu utasasishwa.</p>
        <?php endif; ?>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        <div class="flex justify-between px-5 py-3.5 text-sm">
            <span class="text-gray-500">Kiasi</span>
            <span class="font-bold text-gray-900 dark:text-white"><?= formatCurrency($payment['amount']) ?></span>
        </div>
        <div class="flex justify-between px-5 py-3.5 text-sm">
            <span class="text-gray-500">Mtandao</span>
            <span class="font-medium text-gray-900 dark:text-white"><?= strtoupper(e($payment['provider'])) ?></span>
        </div>
        <div class="flex justify-between px-5 py-3.5 text-sm">
            <span class="text-gray-500">Simu</span>
            <span class="font-medium text-gray-900 dark:text-white"><?= e($payment['phone']) ?></span>
        </div>
        <div class="flex justify-between px-5 py-3.5 text-sm">
            <span class="text-gray-500">Nambari ya Kumbukumbu</span>
            <span class="font-mono text-xs text-gray-600 dark:text-gray-400"><?= e($payment['external_id']) ?></span>
        </div>
        <div class="flex justify-between px-5 py-3.5 text-sm">
            <span class="text-gray-500">Tarehe</span>
            <span class="text-gray-900 dark:text-white"><?= formatDate($payment['created_at']) ?></span>
        </div>
    </div>

    <div class="flex gap-3 flex-wrap">
        <?php if ($payment['status'] === 'pending'): ?>
        <button onclick="location.reload()"
                class="flex-1 bg-brand-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-800">
            Angalia Hali
        </button>
        <?php endif; ?>
        <?php if ($payment['status'] === 'completed'): ?>
        <a href="/pay/receipt/<?= e($payment['external_id']) ?>"
           class="flex-1 text-center bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700">
            Pakua Risiti
        </a>
        <?php endif; ?>
        <a href="/portal" class="flex-1 text-center border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">
            Rudi Nyumbani
        </a>
    </div>

    <?php if ($payment['status'] === 'pending'): ?>
    <script>
        // Auto-refresh every 8 seconds while pending
        setTimeout(() => location.reload(), 8000);
    </script>
    <?php endif; ?>
</div>
