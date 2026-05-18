<?php $parish = \App\Core\Database::selectOne("SELECT * FROM parishes WHERE id = 1"); ?>
<div class="text-center mb-6">
    <p class="text-white/60 text-sm">Uthibitisho wa Hati</p>
    <p class="text-white font-mono text-lg font-bold"><?= e($code) ?></p>
</div>
<?php if ($type === 'receipt' && $data): ?>
<div class="space-y-3">
    <div class="flex items-center gap-2 text-green-300 mb-4">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="font-semibold">Risiti halali</span>
    </div>
    <dl class="space-y-2 text-sm">
        <div class="flex justify-between">
            <dt class="text-white/60">Kiasi</dt>
            <dd class="text-white font-semibold"><?= e(formatCurrency($data['amount'])) ?></dd>
        </div>
        <div class="flex justify-between">
            <dt class="text-white/60">Aina</dt>
            <dd class="text-white"><?= e(ucfirst($data['type'])) ?></dd>
        </div>
        <div class="flex justify-between">
            <dt class="text-white/60">Tarehe</dt>
            <dd class="text-white"><?= e(formatDate($data['transaction_date'])) ?></dd>
        </div>
        <div class="flex justify-between">
            <dt class="text-white/60">Maelezo</dt>
            <dd class="text-white"><?= e($data['description'] ?? '-') ?></dd>
        </div>
    </dl>
</div>
<?php else: ?>
<div class="flex items-center gap-2 text-red-300">
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
    <span class="font-semibold">Hati haipo au haitambuliwi</span>
</div>
<?php endif; ?>
<div class="mt-6 text-center text-xs text-white/40">
    <?= e($parish['name'] ?? '') ?> &bull; <?= e(config('app.url')) ?>
</div>
