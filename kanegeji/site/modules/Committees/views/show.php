<div class="space-y-5">
    <div class="flex items-center gap-3">
        <a href="/committees" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($committee['name']) ?></h1>
    </div>

    <?php if ($committee['description']): ?>
    <p class="text-sm text-gray-600 dark:text-gray-400"><?= e($committee['description']) ?></p>
    <?php endif; ?>

    <?php if ($committee['chair_first']): ?>
    <div class="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-4 text-sm text-brand-800 dark:text-brand-300">
        Mwenyekiti: <strong><?= e($committee['chair_first'] . ' ' . $committee['chair_last']) ?></strong>
    </div>
    <?php endif; ?>

    <!-- Members list -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">
                Wanachama (<?= count($members) ?>)
            </h3>
        </div>
        <?php if (empty($members)): ?>
        <div class="p-8 text-center text-gray-400 text-sm">Hakuna wanachama bado.</div>
        <?php else: ?>
        <div class="divide-y divide-gray-100 dark:divide-gray-700">
            <?php foreach ($members as $m): ?>
            <div class="flex items-center gap-3 px-5 py-3.5">
                <div class="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
                    <?= mb_substr($m['first_name'], 0, 1) . mb_substr($m['last_name'], 0, 1) ?>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 dark:text-white"><?= e($m['first_name'] . ' ' . $m['last_name']) ?></div>
                    <div class="text-xs text-gray-400"><?= $m['role'] ? e($m['role']) : 'Mwanachama' ?><?= $m['phone'] ? ' · ' . e($m['phone']) : '' ?></div>
                </div>
                <?php if (Auth::can('committees_manage')): ?>
                <form method="POST" action="/committees/members/<?= $m['cm_id'] ?>/remove" onsubmit="return confirm('Ondoa mwanachama huyu?')">
                    <?= csrf_field() ?>
                    <button class="text-red-400 hover:text-red-600 p-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </form>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>

    <!-- Add member -->
    <?php if (Auth::can('committees_manage') && !empty($available)): ?>
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h3 class="font-semibold text-gray-900 dark:text-white text-sm mb-4">Ongeza Mwanachama</h3>
        <form method="POST" action="/committees/<?= $committee['id'] ?>/members" class="flex flex-wrap gap-3 items-end">
            <?= csrf_field() ?>
            <div class="flex-1 min-w-[160px]">
                <label class="block text-xs text-gray-500 mb-1">Mwanachama</label>
                <select name="member_id" required class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="">-- Chagua --</option>
                    <?php foreach ($available as $a): ?>
                    <option value="<?= $a['id'] ?>"><?= e($a['first_name'] . ' ' . $a['last_name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="flex-1 min-w-[120px]">
                <label class="block text-xs text-gray-500 mb-1">Nafasi / Wajibu</label>
                <input type="text" name="role" placeholder="Katibu, Mweka Hazina..."
                       class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            </div>
            <div>
                <label class="block text-xs text-gray-500 mb-1">Alijiunga</label>
                <input type="date" name="joined_at"
                       class="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
            </div>
            <button type="submit" class="px-4 py-2 bg-brand-700 text-white text-sm rounded-lg hover:bg-brand-800">Ongeza</button>
        </form>
    </div>
    <?php endif; ?>

    <?php if (Auth::can('committees_manage')): ?>
    <div class="flex gap-3">
        <form method="POST" action="/committees/<?= $committee['id'] ?>/toggle">
            <?= csrf_field() ?>
            <button class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700">
                <?= $committee['active'] ? 'Lemaza' : 'Washa' ?>
            </button>
        </form>
        <form method="POST" action="/committees/<?= $committee['id'] ?>/delete" onsubmit="return confirm('Futa kamati hii?')">
            <?= csrf_field() ?>
            <button class="px-4 py-2 bg-red-600 text-white text-sm rounded-xl hover:bg-red-700">Futa Kamati</button>
        </form>
    </div>
    <?php endif; ?>
</div>
