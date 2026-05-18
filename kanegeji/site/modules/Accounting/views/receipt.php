<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Risiti — <?= e($receipt['receipt_no']) ?></title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
    @media print { .no-print { display: none; } body { background: white; } }
</style>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center py-8 px-4">
<div class="w-full max-w-sm">
    <!-- Print button -->
    <div class="no-print mb-4 text-center">
        <button onclick="window.print()" class="px-4 py-2 bg-purple-700 text-white text-sm rounded-xl mr-2">Chapisha</button>
        <a href="/accounting/transactions/<?= $receipt['transaction_id'] ?>" class="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-xl">← Rudi</a>
    </div>

    <!-- Receipt -->
    <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
        <!-- Header -->
        <div class="bg-purple-800 text-white text-center py-6 px-5">
            <h1 class="text-lg font-bold"><?= e($receipt['parish_name'] ?? '') ?></h1>
            <p class="text-sm text-purple-200 mt-0.5"><?= e($receipt['parish_address'] ?? '') ?></p>
        </div>

        <!-- Title -->
        <div class="text-center py-4 border-b border-dashed border-gray-200">
            <p class="text-xs text-gray-400 uppercase tracking-widest">RISITI YA MALIPO</p>
            <p class="text-2xl font-black text-purple-800 mt-1"><?= e($receipt['receipt_no']) ?></p>
        </div>

        <!-- Amount -->
        <div class="text-center py-5 bg-green-50 border-b border-gray-100">
            <p class="text-xs text-gray-400 mb-1">Kiasi Kilicholipwa</p>
            <p class="text-3xl font-black text-green-700"><?= formatCurrency($receipt['amount']) ?></p>
        </div>

        <!-- Details -->
        <div class="px-6 py-5 space-y-3">
            <?php
            $fields = [
                'Imetolewa kwa'  => $receipt['issued_to'] ?? '-',
                'Aina'           => $receipt['category_name'] ?? '-',
                'Tarehe'         => formatDate($receipt['transaction_date']),
                'Imetolewa tarehe' => formatDate($receipt['issued_at']),
                'Mkusanyaji'     => $receipt['cashier'] ?? '-',
            ];
            foreach ($fields as $label => $value):
            ?>
            <div class="flex justify-between items-start">
                <span class="text-xs text-gray-400"><?= e($label) ?></span>
                <span class="text-sm font-medium text-gray-800 text-right max-w-[60%]"><?= e($value) ?></span>
            </div>
            <?php endforeach; ?>
        </div>

        <!-- QR code placeholder -->
        <div class="px-6 pb-6 text-center border-t border-dashed border-gray-200 pt-4">
            <p class="text-xs text-gray-400 mb-2">Thibitisha kwenye: <?= e(config('app.url')) ?>/verify/<?= e($receipt['qr_code']) ?></p>
            <p class="font-mono text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 inline-block"><?= e($receipt['qr_code']) ?></p>
        </div>
    </div>
</div>
</body>
</html>
