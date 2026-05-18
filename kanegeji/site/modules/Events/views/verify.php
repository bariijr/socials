<div class="space-y-5 max-w-md mx-auto">
    <div class="flex items-center gap-3">
        <a href="/events" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Kagua Tikiti</h1>
    </div>

    <form method="GET" action="/events/verify" class="flex gap-2">
        <input type="text" name="qr" value="<?= e($qr) ?>" placeholder="Ingiza nambari ya QR au tikiti..." required class="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
        <button type="submit" class="px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Kagua</button>
    </form>

    <?php if ($qr && $ticket === null): ?>
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl p-5 text-center">
        <div class="text-red-600 dark:text-red-400 font-semibold">Tikiti Haipatikani</div>
        <div class="text-sm text-red-500 dark:text-red-400 mt-1">QR code: <?= e($qr) ?></div>
    </div>
    <?php elseif ($ticket): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border <?= $ticket['is_used'] ? 'border-red-200 dark:border-red-700' : 'border-green-200 dark:border-green-700' ?> p-6 space-y-4">
        <div class="flex items-center gap-3">
            <?php if ($ticket['is_used']): ?>
            <div class="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg class="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </div>
            <div><div class="font-bold text-red-700 dark:text-red-400">TIKITI IMETUMIKA</div><div class="text-xs text-red-500">Ilitumika: <?= formatDate($ticket['used_at'], 'd M Y H:i') ?></div></div>
            <?php else: ?>
            <div class="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg class="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div><div class="font-bold text-green-700 dark:text-green-400">TIKITI NI HALALI</div><div class="text-xs text-green-500">Iko sawa — haijatumiwa</div></div>
            <?php endif; ?>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm pt-3 border-t border-gray-100 dark:border-gray-700">
            <div><div class="text-xs text-gray-400">Jina</div><div class="font-medium text-gray-900 dark:text-white mt-0.5"><?= e($ticket['holder_name']) ?></div></div>
            <div><div class="text-xs text-gray-400">Tukio</div><div class="font-medium text-gray-900 dark:text-white mt-0.5"><?= e($ticket['event_title']) ?></div></div>
            <div><div class="text-xs text-gray-400">Nambari ya Tikiti</div><div class="font-mono text-xs text-gray-600 dark:text-gray-400 mt-0.5"><?= e($ticket['ticket_number']) ?></div></div>
            <div><div class="text-xs text-gray-400">Aina</div><div class="text-gray-900 dark:text-white mt-0.5 capitalize"><?= e($ticket['ticket_type']) ?></div></div>
            <div><div class="text-xs text-gray-400">Bei Iliyolipwa</div><div class="text-gray-900 dark:text-white mt-0.5"><?= formatCurrency($ticket['price_paid']) ?></div></div>
            <div><div class="text-xs text-gray-400">Hali ya Malipo</div><div class="mt-0.5 <?= $ticket['is_paid'] ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400' ?> font-medium"><?= $ticket['is_paid'] ? 'Amelipa' : 'Hajalipa' ?></div></div>
        </div>

        <?php if (!$ticket['is_used'] && auth()->can('events_manage')): ?>
        <form method="POST" action="/events/ticket/mark-used" class="pt-2">
            <?= csrf_field() ?>
            <input type="hidden" name="qr" value="<?= e($ticket['qr_code']) ?>">
            <button type="submit" class="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors">Thibitisha Kuingia (Mark as Used)</button>
        </form>
        <?php endif; ?>
    </div>
    <?php endif; ?>
</div>
