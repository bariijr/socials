<!DOCTYPE html>
<html lang="sw" x-data="{ darkMode: localStorage.getItem('darkMode')==='1', menuOpen: false }" :class="{ 'dark': darkMode }" x-init="$watch('darkMode', v => localStorage.setItem('darkMode', v?'1':'0'))">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e($pageTitle ?? 'Parokia') ?></title>
    <meta name="description" content="Karibuni kwenye tovuti ya parokia.">
    <meta name="theme-color" content="#701a75">
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: { extend: { colors: { brand: { 50:'#fdf4ff',100:'#fae8ff',200:'#f5d0fe',300:'#f0abfc',400:'#e879f9',500:'#d946ef',600:'#c026d3',700:'#a21caf',800:'#86198f',900:'#701a75' }, gold: '#c7a400' } } }
        }
    </script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <style>[x-cloak]{display:none!important}</style>
</head>
<body class="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans antialiased">

<!-- Navigation -->
<nav class="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 shadow-sm">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <a href="/" class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-brand-700 flex items-center justify-center">
                <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            </div>
            <span class="font-bold text-brand-900 dark:text-white text-sm sm:text-base">Parokia ya Kanegeji</span>
        </a>
        <div class="hidden md:flex items-center gap-6 text-sm font-medium">
            <a href="/" class="text-gray-600 dark:text-gray-300 hover:text-brand-700 dark:hover:text-brand-400">Nyumbani</a>
            <a href="/mass-schedule-public" class="text-gray-600 dark:text-gray-300 hover:text-brand-700 dark:hover:text-brand-400">Ratiba ya Misa</a>
            <a href="/announcements-public" class="text-gray-600 dark:text-gray-300 hover:text-brand-700 dark:hover:text-brand-400">Matangazo</a>
            <a href="/give" class="px-4 py-2 bg-brand-700 text-white rounded-xl hover:bg-brand-800 transition-colors">Toa Sadaka</a>
            <a href="/login" class="text-gray-600 dark:text-gray-300 hover:text-brand-700">Ingia</a>
        </div>
        <div class="flex items-center gap-2 md:hidden">
            <button @click="darkMode=!darkMode" class="p-2 text-gray-500">
                <svg x-show="!darkMode" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
                <svg x-show="darkMode" x-cloak class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            </button>
            <button @click="menuOpen=!menuOpen" class="p-2 text-gray-500">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
        </div>
    </div>
    <div x-show="menuOpen" x-cloak class="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 space-y-2 text-sm">
        <a href="/" class="block py-2 text-gray-700 dark:text-gray-300" @click="menuOpen=false">Nyumbani</a>
        <a href="/mass-schedule-public" class="block py-2 text-gray-700 dark:text-gray-300" @click="menuOpen=false">Ratiba ya Misa</a>
        <a href="/announcements-public" class="block py-2 text-gray-700 dark:text-gray-300" @click="menuOpen=false">Matangazo</a>
        <a href="/give" class="block py-2 text-brand-700 dark:text-brand-400 font-medium" @click="menuOpen=false">Toa Sadaka</a>
        <a href="/login" class="block py-2 text-gray-700 dark:text-gray-300" @click="menuOpen=false">Ingia (Staff)</a>
    </div>
</nav>

<?php if (isset($_SESSION['flash'])): $f = $_SESSION['flash']; unset($_SESSION['flash']); ?>
<div class="max-w-6xl mx-auto px-4 sm:px-6 mt-4">
    <div class="px-4 py-3 rounded-xl text-sm <?= $f['type'] === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200' ?>"><?= e($f['message']) ?></div>
</div>
<?php endif; ?>

<?= $content ?>

<!-- Footer -->
<footer class="mt-16 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        <p class="font-semibold text-gray-900 dark:text-white mb-1">Parokia ya Kanegeji</p>
        <p>Mwaka wa Bwana <?= date('Y') ?> · Kanisa Katoliki Tanzania</p>
        <div class="flex justify-center gap-4 mt-4">
            <a href="/login" class="hover:text-brand-700 dark:hover:text-brand-400">Staff Login</a>
            <a href="/register" class="hover:text-brand-700 dark:hover:text-brand-400">Ombi la Uanachama</a>
        </div>
    </div>
</footer>

<script>
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}
</script>
</body>
</html>
