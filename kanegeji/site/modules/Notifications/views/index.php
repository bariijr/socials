<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Matangazo (Broadcasts)</h1>
        <?php if (auth()->can('notifications_send')): ?>
        <a href="/notifications/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Tuma Ujumbe
        </a>
        <?php endif; ?>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400 text-sm">Hakuna matangazo yaliyotumwa bado.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Kichwa</th>
                        <th class="text-left px-5 py-3.5">Njia</th>
                        <th class="text-left px-5 py-3.5">Walengwa</th>
                        <th class="text-right px-5 py-3.5">Walipokelewa</th>
                        <th class="text-left px-5 py-3.5">Hali</th>
                        <th class="text-left px-5 py-3.5">Ilitumwa Na</th>
                        <th class="text-left px-5 py-3.5">Tarehe</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $r):
                        $sc = ['sent'=>'green','draft'=>'yellow','failed'=>'red'][$r['status']] ?? 'gray';
                        $channelLabel = ['sms'=>'SMS','whatsapp'=>'WhatsApp','email'=>'Barua Pepe','all'=>'Zote'][$r['channel']] ?? $r['channel'];
                        $audienceLabel = ['all'=>'Wote','jumuiya'=>'Jumuiya','role'=>'Jukumu','custom'=>'Maalum'][$r['audience']] ?? $r['audience'];
                    ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5">
                            <div class="font-medium text-gray-900 dark:text-white"><?= e($r['title']) ?></div>
                            <div class="text-xs text-gray-400 mt-0.5 truncate max-w-xs"><?= e(mb_substr($r['message'], 0, 80)) ?><?= mb_strlen($r['message']) > 80 ? '…' : '' ?></div>
                        </td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($channelLabel) ?></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($audienceLabel) ?><?= $r['audience_ref'] ? " ({$r['audience_ref']})" : '' ?></td>
                        <td class="px-5 py-3.5 text-right font-semibold text-gray-900 dark:text-white"><?= number_format($r['sent_count']) ?></td>
                        <td class="px-5 py-3.5"><span class="px-2 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400 capitalize"><?= e($r['status']) ?></span></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($r['sent_by_name'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 text-gray-500 dark:text-gray-400 whitespace-nowrap"><?= $r['sent_at'] ? formatDate($r['sent_at']) : formatDate($r['created_at']) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php if ($total > $perPage): ?>
        <div class="flex justify-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <?php for ($p = 1; $p <= ceil($total/$perPage); $p++): ?>
            <a href="?page=<?= $p ?>" class="px-3 py-1.5 text-sm rounded-lg <?= $p == $page ? 'bg-brand-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' ?>"><?= $p ?></a>
            <?php endfor; ?>
        </div>
        <?php endif; ?>
        <?php endif; ?>
    </div>
</div>
