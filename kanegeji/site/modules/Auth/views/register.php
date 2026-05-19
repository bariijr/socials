<h2 class="text-xl font-bold text-white mb-2">Ombi la Uanachama</h2>
<p class="text-white/60 text-sm mb-6">Jaza fomu hii kuomba uanachama wa parokia. Ombi lako litakaguliwa na kusimamizi.</p>

<form method="POST" action="/register" class="space-y-4">
    <?= csrf_field() ?>

    <div>
        <label class="block text-sm font-medium text-white/80 mb-1.5">Parokia *</label>
        <select name="parish_id" required class="block w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
            <option value="">-- Chagua Parokia --</option>
            <?php foreach ($parishes as $p): ?>
            <option value="<?= $p['id'] ?>"><?= e($p['name']) ?></option>
            <?php endforeach; ?>
        </select>
    </div>

    <div class="grid grid-cols-2 gap-3">
        <div>
            <label class="block text-sm font-medium text-white/80 mb-1.5">Jina la Kwanza *</label>
            <input type="text" name="first_name" required value="<?= e($_POST['first_name'] ?? '') ?>"
                class="block w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
        </div>
        <div>
            <label class="block text-sm font-medium text-white/80 mb-1.5">Jina la Ukoo *</label>
            <input type="text" name="last_name" required value="<?= e($_POST['last_name'] ?? '') ?>"
                class="block w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
        </div>
    </div>

    <div>
        <label class="block text-sm font-medium text-white/80 mb-1.5">Simu</label>
        <input type="tel" name="phone" value="<?= e($_POST['phone'] ?? '') ?>"
            class="block w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40" placeholder="+255 7XX XXX XXX">
    </div>

    <div>
        <label class="block text-sm font-medium text-white/80 mb-1.5">Barua Pepe</label>
        <input type="email" name="email" value="<?= e($_POST['email'] ?? '') ?>"
            class="block w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
    </div>

    <div class="grid grid-cols-2 gap-3">
        <div>
            <label class="block text-sm font-medium text-white/80 mb-1.5">Tarehe ya Kuzaliwa</label>
            <input type="date" name="date_of_birth" value="<?= e($_POST['date_of_birth'] ?? '') ?>"
                class="block w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
        </div>
        <div>
            <label class="block text-sm font-medium text-white/80 mb-1.5">Jinsia</label>
            <select name="gender" class="block w-full rounded-xl border border-white/20 bg-white/10 text-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
                <option value="">--</option>
                <option value="male" <?= ($_POST['gender'] ?? '') === 'male' ? 'selected' : '' ?>>Mwanaume</option>
                <option value="female" <?= ($_POST['gender'] ?? '') === 'female' ? 'selected' : '' ?>>Mwanamke</option>
            </select>
        </div>
    </div>

    <div>
        <label class="block text-sm font-medium text-white/80 mb-1.5">Jina la Jumuiya (kama unajua)</label>
        <input type="text" name="community_name" value="<?= e($_POST['community_name'] ?? '') ?>"
            class="block w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/40">
    </div>

    <button type="submit" class="w-full py-3 bg-gold text-white font-semibold rounded-xl hover:bg-gold/90 transition-colors text-sm">
        Tuma Ombi
    </button>

    <p class="text-center text-sm text-white/50">
        Una akaunti? <a href="/login" class="text-white hover:underline">Ingia</a>
    </p>
</form>
