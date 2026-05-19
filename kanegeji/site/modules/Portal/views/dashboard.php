<div class="space-y-6">
    <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Karibu, <?= e($member ? $member['first_name'] : 'Mgeni') ?>!</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Portal ya Mwanachama</p>
    </div>

    <?php if (!$member): ?>
    <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 text-sm text-amber-700 dark:text-amber-300">
        Akaunti yako bado haijaunganishwa na kumbukumbu ya mwanachama. Wasiliana na ofisi ya parokia.
    </div>
    <?php else: ?>
    <!-- Member card -->
    <div class="bg-gradient-to-br from-brand-700 to-brand-900 rounded-2xl p-6 text-white shadow-lg">
        <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
                <?= mb_substr($member['first_name'], 0, 1) . mb_substr($member['last_name'], 0, 1) ?>
            </div>
            <div>
                <p class="text-lg font-bold"><?= e($member['first_name'] . ' ' . $member['last_name']) ?></p>
                <p class="text-brand-200 text-sm"><?= e($member['member_number'] ?? '') ?></p>
                <?php if ($member['baptised']): ?><span class="text-xs bg-white/20 px-2 py-0.5 rounded-full">Amebatizwa</span><?php endif; ?>
                <?php if ($member['confirmed']): ?><span class="text-xs bg-white/20 px-2 py-0.5 rounded-full ml-1">Kipaimara</span><?php endif; ?>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <!-- Quick links -->
    <div class="grid grid-cols-2 gap-3">
        <?php
        $links = [
            ['href'=>'/portal/contributions','icon'=>'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2','label'=>'Michango Yangu','color'=>'green'],
            ['href'=>'/portal/receipts','icon'=>'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z','label'=>'Risiti zangu','color'=>'blue'],
        ];
        foreach ($links as $l): ?>
        <a href="<?= $l['href'] ?>" class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div class="w-9 h-9 rounded-xl bg-<?= $l['color'] ?>-100 dark:bg-<?= $l['color'] ?>-900/30 flex items-center justify-center mb-3">
                <svg class="w-5 h-5 text-<?= $l['color'] ?>-600 dark:text-<?= $l['color'] ?>-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="<?= $l['icon'] ?>"/></svg>
            </div>
            <p class="text-sm font-semibold text-gray-900 dark:text-white"><?= $l['label'] ?></p>
        </a>
        <?php endforeach; ?>
    </div>

    <!-- Announcements -->
    <?php if (!empty($announcements)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Matangazo ya Hivi Karibuni</h3>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($announcements as $a): ?>
            <div class="px-5 py-3.5">
                <p class="text-sm font-medium text-gray-900 dark:text-white"><?= e($a['title']) ?></p>
                <p class="text-xs text-gray-400 mt-0.5"><?= timeAgo($a['created_at']) ?></p>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>

    <!-- Mass schedule today -->
    <?php
    $today = (int) date('w');
    $todayMasses = array_filter($massSchedules, fn($m) => (int)$m['day_of_week'] === $today && $m['active']);
    $days = ['Jumapili','Jumatatu','Jumanne','Jumatano','Alhamisi','Ijumaa','Jumamosi'];
    if (!empty($todayMasses)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Misa Leo — <?= $days[$today] ?></h3>
        </div>
        <?php foreach ($todayMasses as $m): ?>
        <div class="flex items-center gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
            <span class="text-lg font-bold text-brand-600 dark:text-brand-400 w-14"><?= date('H:i', strtotime($m['mass_time'])) ?></span>
            <span class="text-sm text-gray-700 dark:text-gray-300"><?= e($m['location'] ?? 'Kanisa Kuu') ?></span>
        </div>
        <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <!-- Recent pledges -->
    <?php if (!empty($pledges)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Ahadi Zangu</h3>
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach (array_slice($pledges, 0, 3) as $p):
                $pct = $p['amount_pledged'] > 0 ? min(100, round($p['amount_paid'] / $p['amount_pledged'] * 100)) : 0;
            ?>
            <div class="px-5 py-3.5">
                <div class="flex justify-between text-sm mb-1">
                    <span class="font-medium text-gray-900 dark:text-white"><?= e($p['campaign_title'] ?? 'Ahadi') ?></span>
                    <span class="text-gray-500"><?= $pct ?>%</span>
                </div>
                <div class="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                    <div class="h-1.5 bg-brand-600 rounded-full" style="width:<?= $pct ?>%"></div>
                </div>
                <div class="text-xs text-gray-400 mt-1"><?= formatCurrency($p['amount_paid']) ?> / <?= formatCurrency($p['amount_pledged']) ?></div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
    <?php endif; ?>
</div>
