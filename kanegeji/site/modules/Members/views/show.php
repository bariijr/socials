<div class="max-w-4xl mx-auto space-y-5">
    <!-- Back + actions -->
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
            <a href="/members" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                </svg>
            </a>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">
                <?= e($member['first_name'] . ' ' . ($member['middle_name'] ? $member['middle_name'] . ' ' : '') . $member['last_name']) ?>
            </h1>
        </div>
        <div class="flex items-center gap-2">
            <?php if (\App\Core\Auth::can('members.edit')): ?>
            <a href="/members/<?= $member['id'] ?>/edit"
               class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Hariri
            </a>
            <?php endif; ?>
            <a href="/members/<?= $member['id'] ?>/card"
               class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 rounded-xl hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors" target="_blank">
                Kadi ya Mwanachama
            </a>
        </div>
    </div>

    <!-- Profile card -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div class="flex flex-col sm:flex-row items-start gap-5">
            <!-- Avatar -->
            <div class="w-20 h-20 rounded-2xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 text-2xl font-bold flex-shrink-0">
                <?= e(mb_substr($member['first_name'], 0, 1) . mb_substr($member['last_name'], 0, 1)) ?>
            </div>
            <!-- Info -->
            <div class="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <?php
                $fields = [
                    'Nambari'    => $member['member_number'] ?? '-',
                    'Jinsia'     => $member['gender'] === 'male' ? 'Kiume' : 'Kike',
                    'Tarehe ya Kuzaliwa' => formatDate($member['date_of_birth']),
                    'Simu'       => $member['phone'] ?? '-',
                    'Barua pepe' => $member['email'] ?? '-',
                    'Jumuiya'    => $member['community_name'] ?? '-',
                    'Familia'    => $member['family_name'] ?? '-',
                    'Kazi'       => $member['occupation'] ?? '-',
                    'Makazi'     => $member['address'] ?? '-',
                    'Hali ya Ndoa' => ucfirst($member['marriage_status'] ?? '-'),
                    'Amebatizwa' => $member['baptised'] ? 'Ndiyo' : 'Hapana',
                    'Amethibitishwa' => $member['confirmed'] ? 'Ndiyo' : 'Hapana',
                ];
                foreach ($fields as $label => $value):
                ?>
                <div>
                    <p class="text-xs text-gray-400 mb-0.5"><?= e($label) ?></p>
                    <p class="text-sm font-medium text-gray-900 dark:text-white"><?= e($value) ?></p>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- Status badge -->
        <div class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <span class="inline-block px-3 py-1 text-xs rounded-xl font-medium
                         <?= match($member['status']) {
                             'active'      => 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                             'deceased'    => 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                             'transferred' => 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                             default       => 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                         } ?>">
                <?= e(ucfirst($member['status'])) ?>
            </span>
            <span class="text-xs text-gray-400">Alisajiliwa: <?= e(formatDate($member['created_at'])) ?></span>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Sacraments -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Sakramenti</h3>
            </div>
            <?php if (empty($sacraments)): ?>
            <p class="px-5 py-6 text-sm text-gray-400 text-center">Hakuna sakramenti zilizorekodiwa.</p>
            <?php else: ?>
            <div class="divide-y divide-gray-50 dark:divide-gray-700">
                <?php foreach ($sacraments as $s): ?>
                <div class="px-5 py-3.5 flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white capitalize"><?= e(str_replace('_', ' ', $s['type'])) ?></p>
                        <p class="text-xs text-gray-400"><?= e(formatDate($s['date_received'])) ?></p>
                    </div>
                    <?php if ($s['certificate_path']): ?>
                    <a href="<?= e($s['certificate_path']) ?>" target="_blank" class="text-xs text-brand-600 dark:text-brand-400 hover:underline">Cheti</a>
                    <?php endif; ?>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>

        <!-- Recent transactions -->
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Michango ya Hivi Karibuni</h3>
            </div>
            <?php if (empty($transactions)): ?>
            <p class="px-5 py-6 text-sm text-gray-400 text-center">Hakuna miamala iliyorekodiwa.</p>
            <?php else: ?>
            <div class="divide-y divide-gray-50 dark:divide-gray-700">
                <?php foreach ($transactions as $t): ?>
                <div class="px-5 py-3.5 flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white"><?= e($t['category_name'] ?? $t['description'] ?? '-') ?></p>
                        <p class="text-xs text-gray-400"><?= e(formatDate($t['transaction_date'])) ?></p>
                    </div>
                    <p class="text-sm font-semibold text-green-600 dark:text-green-400"><?= formatCurrency($t['amount']) ?></p>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div>
    </div>

    <?php if (\App\Core\Auth::can('members.delete')): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 p-5">
        <h3 class="font-semibold text-red-600 dark:text-red-400 text-sm mb-2">Eneo Hatari</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Kufuta mwanachama hakuwezi kutenduliwa.</p>
        <form method="POST" action="/members/<?= $member['id'] ?>/delete"
              onsubmit="return confirm('<?= e(__('common.confirm_delete', 'Je, una uhakika?')) ?>')">
            <?= csrf_field() ?>
            <button type="submit" class="px-4 py-2 bg-red-600 text-white text-sm rounded-xl hover:bg-red-700 transition-colors">
                Futa Mwanachama
            </button>
        </form>
    </div>
    <?php endif; ?>
</div>
