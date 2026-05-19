<!DOCTYPE html>
<html lang="sw" class="h-full">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Thibitisha Utambulisho — <?= e(__('app.name', 'Parish ERP')) ?></title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = {theme:{extend:{colors:{brand:{700:'#a21caf',800:'#86198f',900:'#701a75'}}}}}</script>
</head>
<body class="h-full bg-gray-100 flex items-center justify-center p-4">
<div class="w-full max-w-sm">
    <div class="text-center mb-8">
        <div class="w-14 h-14 rounded-2xl bg-brand-700 flex items-center justify-center mx-auto mb-3">
            <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
        </div>
        <h1 class="text-xl font-bold text-gray-900">Thibitisha Utambulisho</h1>
        <p class="text-sm text-gray-500 mt-1">Ingiza msimbo kutoka kwa app yako ya authenticator.</p>
    </div>

    <?php if (!empty($_SESSION['flash'])): ?>
    <div class="mb-4 px-4 py-3 rounded-xl text-sm
        <?= $_SESSION['flash']['type'] === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200' ?>">
        <?= e($_SESSION['flash']['message']) ?>
    </div>
    <?php unset($_SESSION['flash']); endif; ?>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
        <form method="POST" action="/login/totp" autocomplete="off">
            <?= csrf_field() ?>
            <div class="text-center">
                <input type="text" name="code" maxlength="8" required autofocus
                       inputmode="numeric" autocomplete="one-time-code"
                       placeholder="000 000"
                       class="w-full text-center text-3xl font-mono tracking-[0.5em] border-2 border-gray-200 rounded-xl py-4 px-4 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none">
                <p class="text-xs text-gray-400 mt-2">Msimbo unabadilika kila sekunde 30.</p>
            </div>

            <button type="submit"
                    class="w-full bg-brand-700 text-white py-3 rounded-xl font-semibold hover:bg-brand-800 transition-colors">
                Thibitisha
            </button>
        </form>

        <div class="text-center">
            <details class="text-left">
                <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Huna simu? Tumia msimbo wa dharura</summary>
                <form method="POST" action="/login/totp" class="mt-3">
                    <?= csrf_field() ?>
                    <input type="hidden" name="use_backup" value="1">
                    <input type="text" name="code" placeholder="Msimbo wa dharura (XXXXXXXX)" required
                           class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono mb-2">
                    <button type="submit" class="w-full border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
                        Tumia Msimbo wa Dharura
                    </button>
                </form>
            </details>
        </div>

        <a href="/logout" class="block text-center text-xs text-gray-400 hover:text-gray-600">Toka na uingie tena</a>
    </div>
</div>
</body>
</html>
