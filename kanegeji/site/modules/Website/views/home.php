<!-- Hero -->
<section class="bg-gradient-to-br from-brand-900 to-brand-700 text-white py-20 px-4">
    <div class="max-w-4xl mx-auto text-center">
        <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-6">
            <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <h1 class="text-3xl sm:text-5xl font-bold mb-4"><?= e($parish['name'] ?? 'Parokia ya Kanegeji') ?></h1>
        <p class="text-brand-200 text-lg mb-8">Karibuni kwa familia ya Mungu. Pamoja tunajenga Ufalme wake.</p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/give" class="px-6 py-3 bg-gold text-white font-semibold rounded-xl hover:bg-yellow-500 transition-colors">Toa Sadaka</a>
            <a href="/mass-schedule-public" class="px-6 py-3 bg-white/20 text-white font-semibold rounded-xl hover:bg-white/30 transition-colors">Ratiba ya Misa</a>
        </div>
    </div>
</section>

<div class="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-12">

    <!-- Quick links -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <?php
        $quickLinks = [
            ['href'=>'/mass-schedule-public','icon'=>'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z','label'=>'Ratiba ya Misa','color'=>'brand'],
            ['href'=>'/give','icon'=>'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z','label'=>'Toa Sadaka','color'=>'green'],
            ['href'=>'/announcements-public','icon'=>'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z','label'=>'Matangazo','color'=>'blue'],
            ['href'=>'/register','icon'=>'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z','label'=>'Jiunge Nasi','color'=>'purple'],
        ];
        foreach ($quickLinks as $ql): ?>
        <a href="<?= $ql['href'] ?>" class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 text-center shadow-sm hover:shadow-md hover:border-<?= $ql['color'] ?>-300 transition-all group">
            <div class="w-10 h-10 rounded-xl bg-<?= $ql['color'] ?>-100 dark:bg-<?= $ql['color'] ?>-900/30 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                <svg class="w-5 h-5 text-<?= $ql['color'] ?>-600 dark:text-<?= $ql['color'] ?>-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="<?= $ql['icon'] ?>"/></svg>
            </div>
            <p class="text-sm font-semibold text-gray-900 dark:text-white"><?= $ql['label'] ?></p>
        </a>
        <?php endforeach; ?>
    </div>

    <!-- Announcements -->
    <?php if (!empty($announcements)): ?>
    <section>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Matangazo ya Hivi Karibuni</h2>
            <a href="/announcements-public" class="text-sm text-brand-600 dark:text-brand-400 hover:underline">Angalia yote →</a>
        </div>
        <div class="space-y-3">
            <?php
            $typeColors = ['general'=>'blue','liturgical'=>'purple','event'=>'green','urgent'=>'red'];
            foreach ($announcements as $a):
                $sc = $typeColors[$a['type']] ?? 'gray';
            ?>
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                <div class="flex items-start gap-3">
                    <?php if ($a['type'] === 'urgent'): ?>
                    <div class="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0 animate-pulse"></div>
                    <?php endif; ?>
                    <div>
                        <h3 class="font-semibold text-gray-900 dark:text-white"><?= e($a['title']) ?></h3>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1"><?= e(mb_substr($a['content'], 0, 180)) ?><?= mb_strlen($a['content']) > 180 ? '…' : '' ?></p>
                        <p class="text-xs text-gray-400 mt-2"><?= date('d M Y', strtotime($a['created_at'])) ?></p>
                    </div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

    <!-- Mass schedule (today / upcoming) -->
    <?php if (!empty($massSchedules)): ?>
    <section>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Ratiba ya Misa</h2>
            <a href="/mass-schedule-public" class="text-sm text-brand-600 dark:text-brand-400 hover:underline">Kamili →</a>
        </div>
        <?php
        $days = ['Jumapili','Jumatatu','Jumanne','Jumatano','Alhamisi','Ijumaa','Jumamosi'];
        $todayDow = (int) date('w');
        $upcoming = array_filter($massSchedules, fn($m) => (int)$m['day_of_week'] === $todayDow || (int)$m['day_of_week'] === ($todayDow + 1) % 7);
        $upcoming = array_slice(array_values($upcoming ?: $massSchedules), 0, 5);
        ?>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($upcoming as $m): ?>
            <div class="flex items-center gap-4 px-5 py-3.5">
                <div class="text-lg font-bold text-brand-700 dark:text-brand-400 w-14 flex-shrink-0"><?= date('H:i', strtotime($m['mass_time'])) ?></div>
                <div>
                    <div class="text-sm font-medium text-gray-900 dark:text-white"><?= e($days[(int)$m['day_of_week']] ?? '') ?> · <?= e($m['location'] ?? 'Kanisa Kuu') ?></div>
                    <div class="text-xs text-gray-400"><?= ['sw'=>'Kiswahili','en'=>'English','latin'=>'Kilatini'][$m['language']] ?? '' ?></div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

    <!-- Active campaigns -->
    <?php if (!empty($campaigns)): ?>
    <section>
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Kampeni Zinazoendelea</h2>
            <a href="/give" class="text-sm text-brand-600 dark:text-brand-400 hover:underline">Changia →</a>
        </div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <?php foreach ($campaigns as $c):
                $pct = ($c['target_amount'] ?? 0) > 0 ? min(100, round($c['raised'] / $c['target_amount'] * 100)) : 0;
            ?>
            <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                <h3 class="font-semibold text-gray-900 dark:text-white mb-2"><?= e($c['title']) ?></h3>
                <?php if ($c['description']): ?><p class="text-xs text-gray-500 dark:text-gray-400 mb-3"><?= e(mb_substr($c['description'], 0, 80)) ?></p><?php endif; ?>
                <div class="space-y-1.5">
                    <div class="flex justify-between text-xs text-gray-500">
                        <span>TZS <?= number_format($c['raised']) ?> imekusanywa</span>
                        <span><?= $pct ?>%</span>
                    </div>
                    <div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full"><div class="h-2 bg-brand-600 rounded-full" style="width:<?= $pct ?>%"></div></div>
                    <?php if ($c['target_amount']): ?><div class="text-xs text-gray-400">Lengo: TZS <?= number_format($c['target_amount']) ?></div><?php endif; ?>
                </div>
                <a href="/give?campaign=<?= $c['id'] ?>" class="mt-3 inline-block text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">Changia →</a>
            </div>
            <?php endforeach; ?>
        </div>
    </section>
    <?php endif; ?>

</div>
