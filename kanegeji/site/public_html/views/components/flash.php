<?php
use App\Core\Session;
$types = [
    'success' => ['bg-green-50 dark:bg-green-900/30 border-green-400 text-green-800 dark:text-green-300', 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'],
    'error'   => ['bg-red-50 dark:bg-red-900/30 border-red-400 text-red-800 dark:text-red-300',          'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'],
    'warning' => ['bg-yellow-50 dark:bg-yellow-900/30 border-yellow-400 text-yellow-800 dark:text-yellow-300', 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'],
    'info'    => ['bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-800 dark:text-blue-300',     'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
];
foreach ($types as $type => [$classes, $path]):
    $msg = Session::getFlash($type);
    if (!$msg) continue;
?>
<div x-data="{ show: true }" x-show="show" x-transition
     class="mb-4 flex items-start gap-3 p-4 rounded-xl border <?= $classes ?>" role="alert">
    <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="<?= $path ?>"/>
    </svg>
    <p class="text-sm font-medium flex-1"><?= e($msg) ?></p>
    <button @click="show = false" class="flex-shrink-0 opacity-60 hover:opacity-100">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
    </button>
</div>
<?php endforeach; ?>
