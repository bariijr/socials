<!DOCTYPE html>
<html lang="<?= \App\Core\Lang::locale() ?>" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e(__('app.name', 'Parish ERP')) ?> — <?= e($pageTitle ?? 'Login') ?></title>
    <meta name="robots" content="noindex, nofollow">
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
    <link rel="icon" href="<?= asset('img/favicon.ico') ?>" type="image/x-icon">
</head>
<body class="h-full bg-gradient-to-br from-brand-900 via-purple-900 to-indigo-900">
<div class="min-h-full flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <div class="flex justify-center">
            <div class="w-16 h-16 bg-white/10 backdrop-blur rounded-full flex items-center justify-center">
                <svg class="w-10 h-10 text-gold" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
            </div>
        </div>
        <h2 class="mt-4 text-center text-2xl font-bold text-white">
            <?= e(__('app.name', 'Parish ERP')) ?>
        </h2>
        <p class="mt-1 text-center text-sm text-white/60">
            <?= e(__('app.tagline', 'Parish Management System')) ?>
        </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div class="bg-white/10 backdrop-blur-md shadow-2xl rounded-2xl px-8 py-10 border border-white/20">
            <?php if ($error = flash('error')): ?>
            <div class="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-400/40 text-red-200 text-sm">
                <?= e($error) ?>
            </div>
            <?php endif; ?>
            <?php if ($success = flash('success')): ?>
            <div class="mb-4 p-3 rounded-lg bg-green-500/20 border border-green-400/40 text-green-200 text-sm">
                <?= e($success) ?>
            </div>
            <?php endif; ?>
            <?= $content ?>
        </div>
    </div>
</div>
</body>
</html>
