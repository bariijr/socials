<h2 class="text-xl font-bold text-white mb-2">Nimesahau Nywila</h2>
<p class="text-white/60 text-sm mb-6">Ingiza barua pepe yako na tutakutumia kiungo cha kubadilisha nywila.</p>

<form method="POST" action="/forgot-password" class="space-y-5">
    <?= csrf_field() ?>
    <div>
        <label for="email" class="block text-sm font-medium text-white/80 mb-1.5">Barua pepe</label>
        <input type="email" id="email" name="email" required
               class="block w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
    </div>
    <button type="submit" class="w-full rounded-xl bg-white text-brand-900 font-semibold py-3 text-sm hover:bg-white/90 transition-all">
        Tuma Kiungo
    </button>
</form>
<div class="mt-4 text-center">
    <a href="/login" class="text-sm text-white/60 hover:text-white">← Rudi kuingia</a>
</div>
