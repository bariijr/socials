<?php
$typeLabels = ['baptism'=>'Ubatizo','confirmation'=>'Kipaimara','first_communion'=>'Komunyo ya Kwanza','marriage'=>'Ndoa','holy_orders'=>'Upadre','anointing'=>'Upako'];
$typeColors = ['baptism'=>'blue','confirmation'=>'purple','first_communion'=>'green','marriage'=>'pink','holy_orders'=>'yellow','anointing'=>'orange'];
?>
<div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Sakramenti</h1>
        <?php if (auth()->can('members.create')): ?>
        <a href="/sacraments/create" class="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Ongeza Rekodi
        </a>
        <?php endif; ?>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <?php
        $counts = array_column($typeCounts, 'cnt', 'type');
        foreach ($typeLabels as $t => $l):
            $sc = $typeColors[$t];
        ?>
        <a href="?type=<?= $t ?>" class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-3 text-center shadow-sm hover:shadow-md transition-shadow <?= ($_GET['type'] ?? '') === $t ? 'ring-2 ring-brand-500' : '' ?>">
            <div class="text-2xl font-bold text-<?= $sc ?>-600 dark:text-<?= $sc ?>-400"><?= $counts[$t] ?? 0 ?></div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5"><?= $l ?></div>
        </a>
        <?php endforeach; ?>
    </div>

    <form method="GET" class="flex flex-wrap gap-2">
        <input type="text" name="q" value="<?= e($filters['q'] ?? '') ?>" placeholder="Tafuta jina, nambari..." class="flex-1 min-w-40 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
        <select name="type" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2.5 text-gray-700 dark:text-gray-300">
            <option value="">Aina Zote</option>
            <?php foreach ($typeLabels as $t => $l): ?>
            <option value="<?= $t ?>" <?= ($filters['type'] ?? '') === $t ? 'selected' : '' ?>><?= $l ?></option>
            <?php endforeach; ?>
        </select>
        <input type="number" name="year" value="<?= e($filters['year'] ?? '') ?>" placeholder="Mwaka" class="w-28 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
        <button type="submit" class="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200">Tafuta</button>
        <?php if (!empty($filters['type']) || !empty($filters['q']) || !empty($filters['year'])): ?>
        <a href="/sacraments" class="px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-500 text-sm rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50">Futa chujio</a>
        <?php endif; ?>
    </form>

    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <?php if (empty($rows)): ?>
        <div class="p-12 text-center text-gray-400">Hakuna rekodi za sakramenti.</div>
        <?php else: ?>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    <tr>
                        <th class="text-left px-5 py-3.5">Mwanachama</th>
                        <th class="text-left px-5 py-3.5">Aina</th>
                        <th class="text-left px-5 py-3.5">Tarehe</th>
                        <th class="text-left px-5 py-3.5">Aliyehudumia</th>
                        <th class="text-left px-5 py-3.5">Nambari ya Cheti</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    <?php foreach ($rows as $s): $sc = $typeColors[$s['type']] ?? 'gray'; ?>
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td class="px-5 py-3.5">
                            <a href="/members/<?= $s['member_id'] ?>" class="font-medium text-brand-600 dark:text-brand-400 hover:underline"><?= e($s['first_name'] . ' ' . $s['last_name']) ?></a>
                            <div class="text-xs text-gray-400"><?= e($s['member_number']) ?></div>
                        </td>
                        <td class="px-5 py-3.5">
                            <span class="px-2 py-0.5 rounded-full text-xs bg-<?= $sc ?>-100 text-<?= $sc ?>-700 dark:bg-<?= $sc ?>-900/30 dark:text-<?= $sc ?>-400"><?= e($typeLabels[$s['type']] ?? $s['type']) ?></span>
                        </td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= $s['date_received'] ? formatDate($s['date_received']) : '-' ?></td>
                        <td class="px-5 py-3.5 text-gray-600 dark:text-gray-400"><?= e($s['officiant'] ?? '-') ?></td>
                        <td class="px-5 py-3.5 font-mono text-xs text-gray-600 dark:text-gray-400"><?= e($s['certificate_no'] ?? '-') ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
    </div>

    <?php if ($total > $perPage): ?>
    <div class="flex justify-center gap-2">
        <?php for ($p = 1; $p <= ceil($total/$perPage); $p++): ?>
        <a href="?<?= http_build_query(array_merge($_GET, ['page' => $p])) ?>" class="px-3 py-1.5 text-sm rounded-lg <?= $p == $page ? 'bg-brand-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700' ?>"><?= $p ?></a>
        <?php endfor; ?>
    </div>
    <?php endif; ?>
</div>
