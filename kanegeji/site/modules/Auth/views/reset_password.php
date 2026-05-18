<h2 class="text-xl font-bold text-white mb-2">Weka Nywila Mpya</h2>
<form method="POST" action="/reset-password" class="space-y-5">
    <?= csrf_field() ?>
    <input type="hidden" name="token" value="<?= e($token) ?>">
    <div>
        <label class="block text-sm font-medium text-white/80 mb-1.5">Nywila Mpya (angalau herufi 8)</label>
        <input type="password" name="password" required minlength="8"
               class="block w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
    </div>
    <div>
        <label class="block text-sm font-medium text-white/80 mb-1.5">Thibitisha Nywila</label>
        <input type="password" name="password_confirmation" required minlength="8"
               class="block w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
    </div>
    <button type="submit" class="w-full rounded-xl bg-white text-brand-900 font-semibold py-3 text-sm hover:bg-white/90 transition-all">
        Weka Nywila Mpya
    </button>
</form>
