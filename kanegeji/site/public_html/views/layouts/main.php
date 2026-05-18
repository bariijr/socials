<!DOCTYPE html>
<html lang="<?= \App\Core\Lang::locale() ?>" class="h-full" x-data="{ sidebarOpen: false, darkMode: localStorage.getItem('darkMode')==='1' }" x-init="$watch('darkMode', v => localStorage.setItem('darkMode', v?'1':'0'))" :class="{ 'dark': darkMode }">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e($pageTitle ?? __('nav.dashboard', 'Dashboard')) ?> — <?= e(__('app.name', 'Parish ERP')) ?></title>
    <meta name="csrf-token" content="<?= csrf_token() ?>">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        brand: {
                            50:  '#fdf4ff', 100: '#fae8ff', 200: '#f5d0fe',
                            300: '#f0abfc', 400: '#e879f9', 500: '#d946ef',
                            600: '#c026d3', 700: '#a21caf', 800: '#86198f',
                            900: '#701a75', 950: '#4a044e',
                        },
                        gold: '#c7a400',
                    }
                }
            }
        }
    </script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <script src="https://unpkg.com/htmx.org@1.9.12"></script>
    <link rel="icon" href="<?= asset('img/favicon.ico') ?>" type="image/x-icon">
    <link rel="manifest" href="<?= url('manifest.json') ?>">
    <meta name="theme-color" content="#701a75">
    <style>
        [x-cloak] { display: none !important; }
        .sidebar-link.active { @apply bg-brand-700 text-white; }
    </style>
</head>
<body class="h-full bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans antialiased">

<?php require BASE_PATH . '/public_html/views/components/sidebar.php'; ?>

<!-- Mobile top bar -->
<div class="lg:hidden fixed top-0 left-0 right-0 z-30 bg-brand-800 dark:bg-gray-800 shadow-md flex items-center justify-between px-4 h-14">
    <button @click="sidebarOpen = !sidebarOpen" class="text-white p-1">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
    </button>
    <span class="text-white font-semibold text-lg"><?= e(__('app.name', 'Parish ERP')) ?></span>
    <div class="flex items-center gap-2">
        <button @click="darkMode = !darkMode" class="text-white/80 hover:text-white p-1">
            <svg x-show="!darkMode" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
            </svg>
            <svg x-show="darkMode" x-cloak class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
            </svg>
        </button>
    </div>
</div>

<!-- Main content area -->
<div class="lg:pl-64 flex flex-col min-h-screen">
    <main class="flex-1 pt-14 lg:pt-0">
        <!-- Flash messages -->
        <div class="px-4 sm:px-6 lg:px-8 pt-4">
            <?php require BASE_PATH . '/public_html/views/components/flash.php'; ?>
        </div>

        <!-- Page content -->
        <div class="px-4 sm:px-6 lg:px-8 py-4 pb-24 lg:pb-8">
            <?= $content ?>
        </div>
    </main>
</div>

<?php require BASE_PATH . '/public_html/views/components/bottom_nav.php'; ?>

</body>
</html>
