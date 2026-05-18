<div class="space-y-5">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e(__('members.title', 'Wanachama')) ?></h1>
            <p class="text-sm text-gray-500 dark:text-gray-400">Jumla: <?= number_format($paginator['total']) ?></p>
        </div>
        <?php if (\App\Core\Auth::can('members.create')): ?>
        <a href="/members/create"
           class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            <?= e(__('members.add_member', 'Ongeza Mwanachama')) ?>
        </a>
        <?php endif; ?>
    </div>

    <!-- Filters -->
    <form method="GET" action="/members" class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="sm:col-span-2">
                <input type="text" name="q" value="<?= e($q) ?>"
                       placeholder="<?= e(__('members.search', 'Tafuta...')) ?>"
                       class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            </div>
            <select name="community_id" class="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">Jumuiya zote</option>
                <?php foreach ($communities as $c): ?>
                <option value="<?= $c['id'] ?>" <?= ($filters['community_id'] ?? '') == $c['id'] ? 'selected' : '' ?>>
                    <?= e($c['name']) ?>
                </option>
                <?php endforeach; ?>
            </select>
            <select name="status" class="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">Hali zote</option>
                <option value="active"      <?= ($filters['status'] ?? '') === 'active'      ? 'selected' : '' ?>>Hai</option>
                <option value="inactive"    <?= ($filters['status'] ?? '') === 'inactive'    ? 'selected' : '' ?>>Asiye Hai</option>
                <option value="deceased"    <?= ($filters['status'] ?? '') === 'deceased'    ? 'selected' : '' ?>>Amekufa</option>
                <option value="transferred" <?= ($filters['status'] ?? '') === 'transferred' ? 'selected' : '' ?>>Amehamishwa</option>
            </select>
        </div>
        <div class="flex gap-2 mt-3">
            <button type="submit" class="px-4 py-2 bg-brand-700 text-white text-sm rounded-xl hover:bg-brand-800 transition-colors">
                <?= e(__('common.search', 'Tafuta')) ?>
            </button>
            <a href="/members" class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Futa Vichujio
            </a>
        </div>
    </form>

    <!-- Table -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($paginator['data'])): ?>
        <div class="px-5 py-16 text-center">
            <svg class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <p class="text-gray-500 dark:text-gray-400 text-sm"><?= e(__('common.no_results', 'Hakuna matokeo.')) ?></p>
        </div>
        <?php else: ?>
        <!-- Desktop table -->
        <div class="hidden sm:block overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    <tr>
                        <th class="px-5 py-3.5 text-left font-medium">Jina</th>
                        <th class="px-5 py-3.5 text-left font-medium">Nambari</th>
                        <th class="px-5 py-3.5 text-left font-medium">Jumuiya</th>
                        <th class="px-5 py-3.5 text-left font-medium">Simu</th>
                        <th class="px-5 py-3.5 text-left font-medium">Hali</th>
                        <th class="px-5 py-3.5 text-right font-medium">Vitendo</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
                    <?php foreach ($paginator['data'] as $m): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td class="px-5 py-3.5">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 text-xs font-bold flex-shrink-0">
                                    <?= e(mb_substr($m['first_name'], 0, 1) . mb_substr($m['last_name'], 0, 1)) ?>
                                </div>
                                <div>
                                    <p class="font-medium text-gray-900 dark:text-white">
                                        <?= e($m['first_name'] . ' ' . ($m['middle_name'] ? $m['middle_name'][0] . '. ' : '') . $m['last_name']) ?>
                                    </p>
                                    <p class="text-xs text-gray-400"><?= e($m['gender'] === 'male' ? 'Kiume' : 'Kike') ?></p>
                                </div>
                            </div>
                        </td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-300 font-mono text-xs"><?= e($m['member_number'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-300"><?= e($m['community_name'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-300"><?= e($m['phone'] ?? '-') ?></td>
                        <td class="px-5 py-3.5">
                            <span class="inline-block px-2 py-0.5 text-xs rounded-lg font-medium
                                         <?= match($m['status']) {
                                             'active'      => 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                                             'deceased'    => 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                                             'transferred' => 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                                             default       => 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                                         } ?>">
                                <?= e(ucfirst($m['status'])) ?>
                            </span>
                        </td>
                        <td class="px-5 py-3.5">
                            <div class="flex items-center justify-end gap-2">
                                <a href="/members/<?= $m['id'] ?>" class="text-brand-600 dark:text-brand-400 hover:underline text-xs font-medium">Angalia</a>
                                <?php if (\App\Core\Auth::can('members.edit')): ?>
                                <a href="/members/<?= $m['id'] ?>/edit" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-xs">Hariri</a>
                                <?php endif; ?>
                            </div>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <!-- Mobile card list -->
        <div class="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($paginator['data'] as $m): ?>
            <a href="/members/<?= $m['id'] ?>" class="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <div class="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold flex-shrink-0">
                    <?= e(mb_substr($m['first_name'], 0, 1) . mb_substr($m['last_name'], 0, 1)) ?>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-gray-900 dark:text-white text-sm">
                        <?= e($m['first_name'] . ' ' . $m['last_name']) ?>
                    </p>
                    <p class="text-xs text-gray-400"><?= e($m['community_name'] ?? '-') ?> &bull; <?= e($m['phone'] ?? '-') ?></p>
                </div>
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
            </a>
            <?php endforeach; ?>
        </div>

        <!-- Pagination -->
        <?php if ($paginator['last_page'] > 1): ?>
        <div class="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <p class="text-sm text-gray-500 dark:text-gray-400">
                <?= $paginator['from'] ?>–<?= $paginator['to'] ?> / <?= number_format($paginator['total']) ?>
            </p>
            <div class="flex gap-2">
                <?php if ($paginator['current_page'] > 1): ?>
                <a href="<?= pagePath($paginator['current_page'] - 1) ?>"
                   class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    ← <?= e(__('common.previous', 'Iliyotangulia')) ?>
                </a>
                <?php endif; ?>
                <?php if ($paginator['current_page'] < $paginator['last_page']): ?>
                <a href="<?= pagePath($paginator['current_page'] + 1) ?>"
                   class="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <?= e(__('common.next', 'Inayofuata')) ?> →
                </a>
                <?php endif; ?>
            </div>
        </div>
        <?php endif; ?>
        <?php endif; ?>
    </div>
</div>
