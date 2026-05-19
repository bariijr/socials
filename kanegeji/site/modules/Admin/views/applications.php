<div class="space-y-5">
    <div class="flex items-center gap-3">
        <a href="/admin" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Maombi ya Uanachama</h1>
    </div>

    <div class="flex gap-2">
        <?php foreach (['pending'=>'Yanayosubiri','approved'=>'Yaliyoidhinishwa','rejected'=>'Yaliyokataliwa'] as $s => $label): ?>
        <a href="?status=<?= $s ?>" class="px-4 py-2 text-sm rounded-xl font-medium <?= $status === $s ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200' ?>"><?= $label ?></a>
        <?php endforeach; ?>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna maombi yenye hali hii.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Jina</th>
                        <th class="text-left px-5 py-3.5">Parokia</th>
                        <th class="text-left px-5 py-3.5">Simu</th>
                        <th class="text-left px-5 py-3.5">Jumuiya</th>
                        <th class="text-left px-5 py-3.5">Tarehe</th>
                        <?php if ($status === 'pending'): ?>
                        <th class="px-5 py-3.5"></th>
                        <?php endif; ?>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $r): ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5">
                            <div class="font-medium text-gray-900 dark:text-white"><?= e($r['first_name'] . ' ' . $r['last_name']) ?></div>
                            <?php if ($r['email']): ?><div class="text-xs text-gray-400"><?= e($r['email']) ?></div><?php endif; ?>
                        </td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($r['parish_name'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($r['phone'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($r['community_name'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-gray-500 dark:text-gray-400"><?= formatDate($r['created_at']) ?></td>
                        <?php if ($status === 'pending'): ?>
                        <td class="px-5 py-3.5 text-right">
                            <div class="flex items-center justify-end gap-2">
                                <form method="POST" action="/admin/applications/<?= $r['id'] ?>/approve">
                                    <?= csrf_field() ?>
                                    <button class="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700">Idhinisha</button>
                                </form>
                                <form method="POST" action="/admin/applications/<?= $r['id'] ?>/reject">
                                    <?= csrf_field() ?>
                                    <input type="hidden" name="reason" value="Haikukidhi vigezo.">
                                    <button class="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100">Kataa</button>
                                </form>
                            </div>
                        </td>
                        <?php endif; ?>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php if ($total > $perPage): ?>
        <div class="flex justify-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <?php for ($pg = 1; $pg <= ceil($total/$perPage); $pg++): ?>
            <a href="?status=<?= $status ?>&page=<?= $pg ?>" class="px-3 py-1.5 text-sm rounded-lg <?= $pg == $page ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' ?>"><?= $pg ?></a>
            <?php endfor; ?>
        </div>
        <?php endif; ?>
        <?php endif; ?>
    </div>
</div>
