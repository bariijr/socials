<?php
use App\Core\Auth;
$user = Auth::user();
$role = Auth::role();
?>
<!-- Sidebar backdrop (mobile) -->
<div x-show="sidebarOpen" x-cloak @click="sidebarOpen = false"
     class="fixed inset-0 z-40 bg-black/60 lg:hidden" x-transition:enter="transition-opacity ease-in duration-200" x-transition:enter-start="opacity-0" x-transition:enter-end="opacity-100" x-transition:leave="transition-opacity ease-in duration-150" x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0">
</div>

<!-- Sidebar -->
<aside x-show="sidebarOpen || window.innerWidth >= 1024" x-cloak
       class="fixed inset-y-0 left-0 z-50 w-64 bg-brand-900 dark:bg-gray-900 flex flex-col shadow-xl transform transition-transform lg:translate-x-0"
       :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'">

    <!-- Logo -->
    <div class="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div class="w-9 h-9 rounded-lg bg-gold/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-gold" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
        </div>
        <div class="min-w-0">
            <p class="text-white font-bold text-sm leading-tight truncate"><?= e(__('app.name', 'Parish ERP')) ?></p>
            <p class="text-white/50 text-xs truncate"><?= e(__('app.tagline', 'ERP System')) ?></p>
        </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <?php
        $links = [
            ['href' => '/dashboard',                  'icon' => 'grid',      'label' => __('nav.dashboard', 'Dashboard'),      'perm' => null],
            ['href' => '/members',                    'icon' => 'users',     'label' => __('nav.members', 'Wanachama'),        'perm' => 'members.view'],
            ['href' => '/jumuiya',                    'icon' => 'community', 'label' => __('nav.jumuiya', 'Jumuiya'),          'perm' => 'jumuiya.view'],
            ['href' => '/accounting/transactions',    'icon' => 'cash',      'label' => __('nav.transactions', 'Fedha'),       'perm' => 'accounting.view'],
            ['href' => '/campaigns',                  'icon' => 'heart',     'label' => __('nav.campaigns', 'Kampeni'),        'perm' => 'accounting.view'],
            ['href' => '/payroll/runs',               'icon' => 'payroll',   'label' => __('nav.payroll', 'Mishahara'),        'perm' => 'payroll_view'],
            ['href' => '/inventory',                  'icon' => 'box',       'label' => __('nav.inventory', 'Mali / Vifaa'),   'perm' => 'inventory_view'],
            ['href' => '/documents',                  'icon' => 'folder',    'label' => __('nav.documents', 'Hati'),           'perm' => 'documents_view'],
            ['href' => '/events',                     'icon' => 'calendar',  'label' => __('nav.events', 'Matukio'),           'perm' => 'events_view'],
            ['href' => '/bookings',                   'icon' => 'building',  'label' => __('nav.bookings', 'Uhifadhi'),        'perm' => 'bookings_view'],
            ['href' => '/reports',                    'icon' => 'chart',     'label' => __('nav.reports', 'Ripoti'),           'perm' => 'reports.view'],
            ['href' => '/users',                      'icon' => 'shield',    'label' => __('nav.users', 'Watumiaji'),          'perm' => 'users.view'],
            ['href' => '/audit',                      'icon' => 'log',       'label' => __('nav.audit', 'Ukaguzi'),            'perm' => 'audit.view'],
            ['href' => '/settings',                   'icon' => 'cog',       'label' => __('nav.settings', 'Mipangilio'),      'perm' => null],
        ];
        $icons = [
            'grid'      => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>',
            'users'     => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>',
            'community' => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>',
            'cash'      => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>',
            'heart'     => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>',
            'payroll'   => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l2 2 4-4"/>',
            'box'       => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>',
            'folder'    => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>',
            'calendar'  => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>',
            'building'  => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>',
            'chart'     => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
            'shield'    => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>',
            'log'       => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>',
            'cog'       => '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
        ];
        foreach ($links as $link):
            if ($link['perm'] && !Auth::can($link['perm'])) continue;
            $isActive = str_starts_with($_SERVER['REQUEST_URI'] ?? '/', $link['href']);
        ?>
        <a href="<?= $link['href'] ?>"
           class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                  <?= $isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white' ?>">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <?= $icons[$link['icon']] ?? '' ?>
            </svg>
            <span><?= e($link['label']) ?></span>
        </a>
        <?php endforeach; ?>
    </nav>

    <!-- User footer -->
    <div class="px-4 py-4 border-t border-white/10">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                <?= e(mb_substr($user['name'] ?? 'U', 0, 1)) ?>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-white text-sm font-medium truncate"><?= e($user['name'] ?? '') ?></p>
                <p class="text-white/50 text-xs truncate"><?= e(ucfirst(str_replace('_', ' ', $role ?? ''))) ?></p>
            </div>
            <a href="/logout" class="text-white/50 hover:text-white transition-colors" title="<?= e(__('nav.logout', 'Logout')) ?>">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
            </a>
        </div>
    </div>
</aside>
