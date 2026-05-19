<div class="space-y-6">
    <div class="flex items-center justify-between">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Usimamizi wa parokia zote</p>
        </div>
        <a href="/admin/parishes/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Parokia Mpya
        </a>
    </div>

    <!-- Global stats -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <?php
        $cards = [
            ['label'=>'Parokia','value'=>number_format($stats['total_parishes']??0),'color'=>'brand'],
            ['label'=>'Watumiaji','value'=>number_format($stats['total_users']??0),'color'=>'blue'],
            ['label'=>'Wanachama','value'=>number_format($stats['total_members']??0),'color'=>'green'],
            ['label'=>'Miamala','value'=>number_format($stats['total_transactions']??0),'color'=>'amber'],
        ];
        foreach ($cards as $card): ?>
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
            <div class="text-xs text-gray-400"><?= e($card['label']) ?></div>
            <div class="text-2xl font-bold text-<?= $card['color'] ?>-600 dark:text-<?= $card['color'] ?>-400 mt-1"><?= e($card['value']) ?></div>
        </div>
        <?php endforeach; ?>
    </div>

    <!-- Recent parishes -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Parokia za Hivi Karibuni</h3>
            <a href="/admin/parishes" class="text-xs text-brand-600 dark:text-brand-400 hover:underline">Angalia zote</a>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3">Parokia</th>
                        <th class="text-left px-5 py-3">Jimbo</th>
                        <th class="text-right px-5 py-3">Wanachama</th>
                        <th class="text-center px-5 py-3">Hali</th>
                        <th class="px-5 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($recentParishes as $p): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5 font-medium text-gray-900 dark:text-white"><?= e($p['name']) ?></td>
                        <td class="px-5 py-3.5 text-gray-500 dark:text-gray-400"><?= e($p['diocese'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-right"><?= number_format($p['member_count']) ?></td>
                        <td class="px-5 py-3.5 text-center">
                            <span class="px-2 py-0.5 rounded-full text-xs <?= $p['active'] ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500' ?>">
                                <?= $p['active'] ? 'Inafanya kazi' : 'Imesimamishwa' ?>
                            </span>
                        </td>
                        <td class="px-5 py-3.5 text-right">
                            <a href="/admin/parishes/<?= $p['id'] ?>" class="text-brand-600 dark:text-brand-400 text-xs font-medium hover:underline">Angalia</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- Quick links -->
    <div class="grid grid-cols-2 gap-4">
        <a href="/admin/applications" class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm hover:border-brand-300 transition-colors group">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                    <svg class="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                </div>
                <div>
                    <div class="font-semibold text-gray-900 dark:text-white text-sm">Maombi ya Uanachama</div>
                    <div class="text-xs text-gray-400 mt-0.5">Kagua na idhinisha maombi</div>
                </div>
            </div>
        </a>
        <a href="/audit" class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 shadow-sm hover:border-brand-300 transition-colors group">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                </div>
                <div>
                    <div class="font-semibold text-gray-900 dark:text-white text-sm">Ukaguzi wa Mfumo</div>
                    <div class="text-xs text-gray-400 mt-0.5">Angalia shughuli zote</div>
                </div>
            </div>
        </a>
    </div>
</div>
