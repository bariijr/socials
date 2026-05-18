<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<title>QR Label — <?= e($asset['name']) ?></title>
<script src="https://cdn.tailwindcss.com"></script>
<style>@media print { .no-print { display: none; } }</style>
</head>
<body class="bg-gray-100 min-h-screen flex flex-col items-center justify-center py-8 gap-4">
<div class="no-print flex gap-3 mb-4">
    <button onclick="window.print()" class="px-4 py-2 bg-brand-700 text-white text-sm rounded-xl">Chapisha Label</button>
    <a href="/inventory/<?= $asset['id'] ?>" class="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-xl">← Rudi</a>
</div>

<div class="bg-white rounded-2xl shadow-xl p-6 w-64 text-center border border-gray-200">
    <div class="text-xs text-gray-400 mb-1">Parokia ya Kanegeji</div>
    <div class="font-bold text-gray-900 text-sm mb-3"><?= e($asset['name']) ?></div>
    <div class="flex justify-center mb-3">
        <?php
        $qrFile = BASE_PATH . '/storage/qr/assets/asset_' . $asset['id'] . '.png';
        if (file_exists($qrFile)):
        ?>
        <img src="data:image/png;base64,<?= base64_encode(file_get_contents($qrFile)) ?>" alt="QR" class="w-32 h-32">
        <?php else: ?>
        <div class="w-32 h-32 bg-gray-100 rounded-xl flex items-center justify-center text-xs text-gray-400">QR Haipatikani</div>
        <?php endif; ?>
    </div>
    <div class="font-mono text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5"><?= e($asset['asset_number']) ?></div>
    <?php if ($asset['location']): ?>
    <div class="text-xs text-gray-400 mt-1"><?= e($asset['location']) ?></div>
    <?php endif; ?>
</div>
</body>
</html>
