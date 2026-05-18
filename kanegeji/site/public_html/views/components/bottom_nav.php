<?php use App\Core\Auth; ?>
<!-- Mobile bottom navigation -->
<nav class="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-around items-center h-16 px-2 safe-area-pb">
    <?php
    $tabs = [
        ['href' => '/dashboard',               'label' => __('nav.dashboard', 'Nyumbani'),  'icon' => 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z', 'perm' => null],
        ['href' => '/members',                 'label' => __('nav.members', 'Wanachama'),   'icon' => 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', 'perm' => 'members.view'],
        ['href' => '/accounting/transactions', 'label' => __('nav.transactions', 'Fedha'),  'icon' => 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z', 'perm' => 'accounting.view'],
        ['href' => '/events',                  'label' => __('nav.events', 'Matukio'),      'icon' => 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', 'perm' => 'events_view'],
        ['href' => '/settings',                'label' => __('nav.settings', 'Zaidi'),      'icon' => 'M4 6h16M4 12h16M4 18h16', 'perm' => null],
    ];
    foreach ($tabs as $tab):
        if ($tab['perm'] && !Auth::can($tab['perm'])) continue;
        $active = str_starts_with($_SERVER['REQUEST_URI'] ?? '/', $tab['href']);
    ?>
    <a href="<?= $tab['href'] ?>"
       class="flex flex-col items-center justify-center flex-1 py-1 min-w-0 transition-colors
              <?= $active ? 'text-brand-700 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400' ?>">
        <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="<?= $tab['icon'] ?>"/>
        </svg>
        <span class="text-xs font-medium truncate"><?= e($tab['label']) ?></span>
    </a>
    <?php endforeach; ?>
</nav>
