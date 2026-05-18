<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kadi ya Mwanachama — <?= e($member['first_name'] . ' ' . $member['last_name']) ?></title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
@media print { .no-print { display: none; } }
.card { width: 85.6mm; height: 53.98mm; }
</style>
</head>
<body class="bg-gray-100 min-h-screen flex flex-col items-center justify-center py-8 gap-4">
<div class="no-print flex gap-3 mb-2">
    <button onclick="window.print()" class="px-4 py-2 bg-purple-700 text-white text-sm rounded-xl">Chapisha Kadi</button>
    <a href="/members/<?= $member['id'] ?>" class="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-xl">← Rudi</a>
</div>

<!-- Front -->
<div class="card bg-gradient-to-br from-purple-900 to-indigo-900 rounded-xl shadow-xl p-4 flex flex-col justify-between" style="width:340px;height:215px">
    <div class="flex items-start justify-between">
        <div>
            <p class="text-white/60 text-xs">Parokia ya Kanegeji</p>
            <p class="text-gold font-bold text-sm mt-0.5"><?= e(__('app.name', 'Parish ERP')) ?></p>
        </div>
        <div class="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-lg">
            <?= e(mb_substr($member['first_name'], 0, 1) . mb_substr($member['last_name'], 0, 1)) ?>
        </div>
    </div>
    <div>
        <p class="text-white text-lg font-bold"><?= e($member['first_name'] . ' ' . ($member['middle_name'] ? $member['middle_name'] . ' ' : '') . $member['last_name']) ?></p>
        <p class="text-white/60 text-xs mt-0.5"><?= e($member['community_name'] ?? '') ?></p>
    </div>
    <div class="flex items-center justify-between">
        <div>
            <p class="text-white/60 text-xs">Nambari ya Mwanachama</p>
            <p class="text-white font-mono font-bold text-sm"><?= e($member['member_number'] ?? '-') ?></p>
        </div>
        <div class="text-right">
            <p class="text-white/60 text-xs">Hali</p>
            <p class="text-green-400 font-semibold text-xs capitalize"><?= e($member['status']) ?></p>
        </div>
    </div>
</div>

<!-- Back -->
<div class="card bg-white rounded-xl shadow-xl p-4 flex flex-col justify-between" style="width:340px;height:215px">
    <div>
        <p class="text-xs text-gray-400 mb-1">Kadi hii ni mali ya <?= e(__('app.name', 'Parish ERP')) ?>.</p>
        <p class="text-xs text-gray-400">Ikipatikana, tafadhali rudisha kwa ofisi ya parokia.</p>
    </div>
    <div class="text-center">
        <p class="text-xs text-gray-400 mb-1">Nambari ya QR:</p>
        <p class="font-mono text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5 inline-block"><?= e($member['qr_code'] ?? '-') ?></p>
    </div>
    <div class="flex justify-between text-xs text-gray-500">
        <span><?= e($member['phone'] ?? '') ?></span>
        <span>Imetolewa: <?= formatDate($member['created_at']) ?></span>
    </div>
</div>
</body>
</html>
