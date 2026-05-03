<!DOCTYPE html>
<html lang="en" class="h-full bg-gray-50">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($title ?? 'Pounds MFI') ?></title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <?php if (!empty($chartjs)): ?>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <?php endif; ?>
    <style>[x-cloak]{display:none!important}</style>
</head>
<body class="h-full" x-data="appShell()" x-init="init()">

<!-- Loading overlay while auth check runs -->
<div x-show="!authChecked" class="fixed inset-0 bg-white flex items-center justify-center z-50">
    <div class="text-center">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p class="mt-3 text-sm text-gray-500">Loading...</p>
    </div>
</div>

<div x-cloak class="flex h-full">
    <!-- Sidebar -->
    <aside class="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div class="px-4 py-5 border-b border-gray-200">
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <span class="text-white text-sm font-bold">P</span>
                </div>
                <div>
                    <div class="text-sm font-bold text-gray-900">Pounds MFI</div>
                    <div class="text-xs text-gray-500 capitalize" x-text="(user?.role ?? '').replace('_', ' ')"></div>
                </div>
            </div>
        </div>

        <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
            <a href="/dashboard" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors <?= ($page ?? '') === 'dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700' ?>">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                Dashboard
            </a>
            <a href="/loans" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors <?= ($page ?? '') === 'loans' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700' ?>">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Loans
            </a>
            <a href="/kyc" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors <?= ($page ?? '') === 'kyc' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700' ?>">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                KYC
            </a>
            <a href="/receipts" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors <?= ($page ?? '') === 'receipts' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700' ?>">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                Receipts
            </a>
            <template x-if="user && ['admin','super_admin'].includes(user.role)">
                <a href="/users" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors <?= ($page ?? '') === 'users' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700' ?>">
                    <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                    Users
                </a>
            </template>
        </nav>

        <div class="p-3 border-t border-gray-200">
            <div class="flex items-center gap-2 px-3 py-2 mb-1">
                <div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0" x-text="user ? ((user.firstName?.[0]??'') + (user.lastName?.[0]??'')) : '?'"></div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 truncate" x-text="user ? user.firstName + ' ' + user.lastName : 'Loading...'"></div>
                    <div class="text-xs text-gray-500 truncate" x-text="user?.email ?? ''"></div>
                </div>
            </div>
            <button @click="logout()" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors">
                <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                Logout
            </button>
        </div>
    </aside>

    <!-- Main content -->
    <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Top bar -->
        <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <h1 class="text-base font-semibold text-gray-900"><?= htmlspecialchars($title ?? '') ?></h1>
            <div class="flex items-center gap-3">
                <button @click="loadNotifications()" class="relative p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                    <span x-show="unreadCount > 0" x-text="unreadCount > 9 ? '9+' : unreadCount" class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none"></span>
                </button>
            </div>
        </header>

        <!-- Page content -->
        <main class="flex-1 overflow-auto p-6">
            <?= $slot ?? '' ?>
        </main>
    </div>
</div>

<script>
function appShell() {
    return {
        user: null,
        authChecked: false,
        unreadCount: 0,

        async init() {
            const token = localStorage.getItem('access_token');
            const userId = localStorage.getItem('user_id');
            if (!token || !userId) {
                window.location.href = '/login';
                return;
            }

            try {
                const res = await fetch('/api/users/' + userId, {
                    headers: { Authorization: 'Bearer ' + token }
                });
                if (!res.ok) throw new Error('auth');
                this.user = await res.json();
                this.authChecked = true;
                this.loadNotifications();
            } catch {
                localStorage.clear();
                window.location.href = '/login';
            }
        },

        async loadNotifications() {
            const token = localStorage.getItem('access_token');
            if (!token) return;
            try {
                const res = await fetch('/api/notifications', {
                    headers: { Authorization: 'Bearer ' + token }
                });
                if (res.ok) {
                    const data = await res.json();
                    this.unreadCount = data.unread ?? 0;
                }
            } catch {}
        },

        async logout() {
            const token = localStorage.getItem('access_token');
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token }
                });
            } catch {}
            localStorage.clear();
            window.location.href = '/login';
        }
    };
}
</script>
</body>
</html>
