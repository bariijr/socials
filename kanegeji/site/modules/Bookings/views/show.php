<?php $statusColors = ['pending'=>'yellow','approved'=>'green','rejected'=>'red','cancelled'=>'gray','completed'=>'blue']; ?>
<div class="space-y-5 max-w-2xl">
    <div class="flex items-center gap-3">
        <a href="/bookings" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
        <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($booking['booking_number']) ?></h1>
            <div class="text-xs text-gray-400">Ukumbi: <?= e($hall['name'] ?? '-') ?></div>
        </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <?php $sc = $statusColors[$booking['status']] ?? 'gray'; ?>
        <div class="flex items-center justify-between">
            <span class="px-3 py-1 rounded-full text-sm font-medium bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($booking['status']) ?></span>
            <span class="text-xs text-gray-400"><?= formatDate($booking['created_at']) ?></span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><div class="text-xs text-gray-400">Mhusika</div><div class="font-medium text-gray-900 dark:text-white mt-0.5"><?= e($booking['booker_name']) ?></div></div>
            <div><div class="text-xs text-gray-400">Simu</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($booking['booker_phone']) ?></div></div>
            <div><div class="text-xs text-gray-400">Barua Pepe</div><div class="text-gray-900 dark:text-white mt-0.5 truncate"><?= e($booking['booker_email'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Madhumuni</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($booking['purpose']) ?></div></div>
            <div><div class="text-xs text-gray-400">Aina ya Tukio</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($booking['event_type'] ?? '-') ?></div></div>
            <div><div class="text-xs text-gray-400">Wageni Watarajiwa</div><div class="text-gray-900 dark:text-white mt-0.5"><?= $booking['expected_guests'] ?? '-' ?></div></div>
            <div><div class="text-xs text-gray-400">Inaanza</div><div class="text-gray-900 dark:text-white mt-0.5"><?= formatDate($booking['start_datetime'], 'd M Y H:i') ?></div></div>
            <div><div class="text-xs text-gray-400">Inaisha</div><div class="text-gray-900 dark:text-white mt-0.5"><?= formatDate($booking['end_datetime'], 'd M Y H:i') ?></div></div>
        </div>

        <div class="pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-3 gap-4 text-sm">
            <div><div class="text-xs text-gray-400">Jumla ya Malipo</div><div class="font-bold text-gray-900 dark:text-white mt-0.5"><?= formatCurrency($booking['total_amount']) ?></div></div>
            <div><div class="text-xs text-gray-400">Amana Iliyolipwa</div><div class="font-bold text-green-600 dark:text-green-400 mt-0.5"><?= formatCurrency($booking['deposit_paid']) ?></div></div>
            <div><div class="text-xs text-gray-400">Baki</div><div class="font-bold <?= $booking['balance_due'] > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400' ?> mt-0.5"><?= formatCurrency($booking['balance_due']) ?></div></div>
        </div>

        <?php if ($booking['rejection_reason']): ?>
        <div class="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-sm text-red-600 dark:text-red-400">
            Sababu ya kukataliwa: <?= e($booking['rejection_reason']) ?>
        </div>
        <?php endif; ?>
    </div>

    <?php if ($booking['status'] === 'pending' && auth()->can('bookings_approve')): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <h2 class="font-semibold text-gray-900 dark:text-white">Hatua za Idhini</h2>
        <div class="flex gap-3">
            <form method="POST" action="/bookings/<?= $booking['id'] ?>/approve" onsubmit="return confirm('Idhinisha ombi hili?')">
                <?= csrf_field() ?>
                <button type="submit" class="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700">Idhinisha</button>
            </form>
            <form method="POST" action="/bookings/<?= $booking['id'] ?>/reject" x-data="{open: false}">
                <?= csrf_field() ?>
                <button type="button" @click="open = !open" class="px-5 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl hover:bg-red-100">Kataa</button>
                <div x-show="open" class="mt-3 space-y-2">
                    <textarea name="rejection_reason" rows="2" placeholder="Sababu ya kukataliwa..." required class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"></textarea>
                    <button type="submit" class="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700">Thibitisha Kukataliwa</button>
                </div>
            </form>
        </div>
    </div>
    <?php endif; ?>

    <?php if ($booking['status'] === 'approved' && $booking['balance_due'] > 0 && auth()->can('bookings_manage')): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 class="font-semibold text-gray-900 dark:text-white mb-4">Sasisha Malipo</h2>
        <form method="POST" action="/bookings/<?= $booking['id'] ?>/payment" class="flex gap-3 items-end">
            <?= csrf_field() ?>
            <div class="flex-1"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jumla Iliyolipwa mpaka sasa (TZS)</label><input type="number" name="deposit_paid" value="<?= $booking['deposit_paid'] ?>" min="0" max="<?= $booking['total_amount'] ?>" step="0.01" class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"></div>
            <button type="submit" class="px-5 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Hifadhi</button>
        </form>
    </div>
    <?php endif; ?>
</div>
