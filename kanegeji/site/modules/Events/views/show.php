<?php $types = ['mass'=>'Misa','meeting'=>'Mkutano','fundraiser'=>'Mchango','concert'=>'Muziki','wedding'=>'Harusi','burial'=>'Mazishi','other'=>'Nyingine']; ?>
<div class="space-y-5 max-w-3xl">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
            <a href="/events" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg></a>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($event['title']) ?></h1>
        </div>
        <?php if (auth()->can('events_manage')): ?>
        <a href="/events/<?= $event['id'] ?>/edit" class="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Hariri</a>
        <?php endif; ?>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><div class="text-xs text-gray-400">Aina</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($types[$event['event_type']] ?? $event['event_type']) ?></div></div>
            <div><div class="text-xs text-gray-400">Inaanza</div><div class="text-gray-900 dark:text-white mt-0.5"><?= formatDate($event['start_datetime'], 'd M Y H:i') ?></div></div>
            <?php if ($event['end_datetime']): ?><div><div class="text-xs text-gray-400">Inaisha</div><div class="text-gray-900 dark:text-white mt-0.5"><?= formatDate($event['end_datetime'], 'd M Y H:i') ?></div></div><?php endif; ?>
            <?php if ($event['location']): ?><div><div class="text-xs text-gray-400">Mahali</div><div class="text-gray-900 dark:text-white mt-0.5"><?= e($event['location']) ?></div></div><?php endif; ?>
            <?php if ($event['max_capacity']): ?><div><div class="text-xs text-gray-400">Uwezo</div><div class="text-gray-900 dark:text-white mt-0.5"><?= $event['max_capacity'] ?> watu</div></div><?php endif; ?>
            <div><div class="text-xs text-gray-400">Bei ya Tikiti</div><div class="font-medium text-gray-900 dark:text-white mt-0.5"><?= $event['is_free'] ? 'Bure' : formatCurrency($event['ticket_price']) ?></div></div>
        </div>
        <?php if ($event['description']): ?>
        <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300"><?= nl2br(e($event['description'])) ?></div>
        <?php endif; ?>
    </div>

    <div class="grid grid-cols-2 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Tikiti Zilizotolewa</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white mt-1"><?= $ticketCount['cnt'] ?? 0 ?></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div class="text-xs text-gray-400">Mapato ya Tikiti</div>
            <div class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1"><?= formatCurrency($ticketCount['revenue'] ?? 0) ?></div>
        </div>
    </div>

    <?php if (auth()->can('events_manage') && $event['status'] !== 'cancelled'): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 class="font-semibold text-gray-900 dark:text-white mb-4">Toa Tikiti</h2>
        <form method="POST" action="/events/<?= $event['id'] ?>/tickets" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <?= csrf_field() ?>
            <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>
            <div class="sm:col-span-2"><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jina la Mhusika *</label><input type="text" name="holder_name" required class="<?= $tf ?>"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Simu</label><input type="tel" name="holder_phone" class="<?= $tf ?>"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Aina ya Tikiti</label><select name="ticket_type" class="<?= $tf ?>"><option value="standard">Kawaida</option><option value="vip">VIP</option><option value="child">Mtoto</option></select></div>
            <?php if (!$event['is_free']): ?>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Bei Iliyolipwa</label><input type="number" name="price_paid" value="<?= $event['ticket_price'] ?>" min="0" class="<?= $tf ?>"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Njia ya Malipo</label><input type="text" name="payment_method" placeholder="M-Pesa, Cash..." class="<?= $tf ?>"></div>
            <div class="flex items-center gap-2"><input type="checkbox" name="is_paid" value="1" class="rounded border-gray-300"><label class="text-sm text-gray-700 dark:text-gray-300">Amelipa</label></div>
            <?php endif; ?>
            <div class="sm:col-span-2"><button type="submit" class="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700">Toa Tikiti</button></div>
        </form>
    </div>
    <?php endif; ?>

    <?php if (!empty($tickets)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700"><h2 class="font-semibold text-gray-900 dark:text-white">Tikiti za Hivi Karibuni</h2></div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($tickets as $t): ?>
            <div class="flex items-center justify-between px-5 py-3.5 text-sm">
                <div>
                    <div class="font-medium text-gray-900 dark:text-white"><?= e($t['holder_name']) ?></div>
                    <div class="text-xs text-gray-400 font-mono"><?= e($t['ticket_number']) ?></div>
                </div>
                <div class="text-right">
                    <?php $u = $t['is_used'] ? 'line-through text-gray-400' : 'text-green-600 dark:text-green-400'; ?>
                    <div class="font-medium <?= $u ?>"><?= formatCurrency($t['price_paid']) ?></div>
                    <div class="text-xs <?= $t['is_used'] ? 'text-gray-400' : 'text-green-500' ?>"><?= $t['is_used'] ? 'Imetumika' : ($t['is_paid'] ? 'Amelipa' : 'Hajalipa') ?></div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>
</div>
