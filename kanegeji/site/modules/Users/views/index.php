<div class="space-y-5">
    <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e(__('nav.users', 'Watumiaji')) ?></h1>
        <?php if (\App\Core\Auth::can('users.create')): ?>
        <a href="/users/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Ongeza Mtumiaji
        </a>
        <?php endif; ?>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <tr>
                    <th class="px-5 py-3.5 text-left font-medium">Jina</th>
                    <th class="px-5 py-3.5 text-left font-medium">Barua pepe</th>
                    <th class="px-5 py-3.5 text-left font-medium">Jukumu</th>
                    <th class="px-5 py-3.5 text-left font-medium">Hali</th>
                    <th class="px-5 py-3.5 text-left font-medium">Mwisho Kuingia</th>
                    <th class="px-5 py-3.5 text-right font-medium">Vitendo</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
                <?php foreach ($users as $u): ?>
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td class="px-5 py-3.5">
                        <div class="flex items-center gap-3">
                            <div class="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 text-xs font-bold flex-shrink-0">
                                <?= e(mb_substr($u['name'], 0, 1)) ?>
                            </div>
                            <span class="font-medium text-gray-900 dark:text-white"><?= e($u['name']) ?></span>
                        </div>
                    </td>
                    <td class="px-5 py-3.5 text-gray-500 dark:text-gray-400"><?= e($u['email']) ?></td>
                    <td class="px-5 py-3.5">
                        <span class="px-2 py-0.5 text-xs rounded-lg bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400">
                            <?= e($u['role_name']) ?>
                        </span>
                    </td>
                    <td class="px-5 py-3.5">
                        <span class="w-2 h-2 rounded-full inline-block mr-1.5 <?= $u['active'] ? 'bg-green-500' : 'bg-gray-300' ?>"></span>
                        <span class="text-xs text-gray-500 dark:text-gray-400"><?= $u['active'] ? 'Hai' : 'Amezuiwa' ?></span>
                    </td>
                    <td class="px-5 py-3.5 text-xs text-gray-400"><?= $u['last_login_at'] ? formatDate($u['last_login_at'], 'd M Y H:i') : 'Haijaingia' ?></td>
                    <td class="px-5 py-3.5 text-right">
                        <div class="flex items-center justify-end gap-3">
                            <?php if (\App\Core\Auth::can('users.edit')): ?>
                            <a href="/users/<?= $u['id'] ?>/edit" class="text-xs text-brand-600 dark:text-brand-400 hover:underline">Hariri</a>
                            <?php endif; ?>
                            <?php if (\App\Core\Auth::can('users.delete') && $u['id'] !== \App\Core\Auth::id()): ?>
                            <form method="POST" action="/users/<?= $u['id'] ?>/delete"
                                  onsubmit="return confirm('<?= e(__('common.confirm_delete', 'Je, una uhakika?')) ?>')">
                                <?= csrf_field() ?>
                                <button type="submit" class="text-xs text-red-500 hover:text-red-700">Futa</button>
                            </form>
                            <?php endif; ?>
                        </div>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
