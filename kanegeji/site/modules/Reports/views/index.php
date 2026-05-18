<div class="space-y-5">
    <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e(__('reports.title', 'Ripoti')) ?></h1>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <?php
        $reports = [
            ['href' => '/reports/income',   'icon' => '📈', 'title' => 'Ripoti ya Mapato',    'desc' => 'Mapato kwa kategoria, mwezi, na jumuiya'],
            ['href' => '/reports/expenses', 'icon' => '📉', 'title' => 'Ripoti ya Matumizi',  'desc' => 'Matumizi kwa kategoria na kipindi'],
            ['href' => '/reports/members',  'icon' => '👥', 'title' => 'Ripoti ya Wanachama', 'desc' => 'Takwimu za wanachama kwa jinsia na jumuiya'],
            ['href' => '/reports/jumuiya', 'icon' => '🏘️', 'title' => 'Ripoti ya Jumuiya',   'desc' => 'Ushindani na michango ya jumuiya'],
            ['href' => '/accounting/budgets', 'icon' => '💰', 'title' => 'Bajeti vs Halisi', 'desc' => 'Linganisha bajeti na matumizi halisi'],
            ['href' => '/accounting/reconciliation', 'icon' => '🏦', 'title' => 'Uoanishaji', 'desc' => 'Linganisha vitabu na benki'],
        ];
        foreach ($reports as $r):
        ?>
        <a href="<?= $r['href'] ?>"
           class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all block">
            <div class="text-3xl mb-3"><?= $r['icon'] ?></div>
            <h3 class="font-bold text-gray-900 dark:text-white mb-1"><?= e($r['title']) ?></h3>
            <p class="text-sm text-gray-500 dark:text-gray-400"><?= e($r['desc']) ?></p>
        </a>
        <?php endforeach; ?>
    </div>
</div>
