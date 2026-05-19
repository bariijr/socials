<div class="max-w-lg mx-auto px-4 sm:px-6 py-12">
    <div class="text-center mb-8">
        <div class="w-14 h-14 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-4">
            <svg class="w-7 h-7 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Toa Sadaka / Mchango</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-2 text-sm">Mchango wako unasaidia kuendeleza kazi ya Bwana katika parokia yetu.</p>
    </div>

    <!-- Payment instructions -->
    <?php if ($parish): ?>
    <div class="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-700 rounded-2xl p-5 mb-6 text-sm">
        <h3 class="font-semibold text-brand-800 dark:text-brand-300 mb-2">Njia za Malipo</h3>
        <ul class="space-y-1.5 text-brand-700 dark:text-brand-400">
            <li>📱 <strong>M-Pesa / Tigo Pesa / Airtel Money:</strong> Tuma kwa namba <strong><?= e($parish['phone'] ?? '+255 XXX XXX XXX') ?></strong></li>
            <li>🏦 <strong>Benki:</strong> Wasiliana nasi kwa akaunti ya benki</li>
            <li>✉️ <strong>Baruapepe:</strong> <?= e($parish['email'] ?? '') ?></li>
        </ul>
        <p class="text-xs text-brand-600 dark:text-brand-500 mt-3">Baada ya kutuma, jaza fomu hii na namba ya uthibitisho.</p>
    </div>
    <?php endif; ?>

    <form method="POST" action="/give" enctype="multipart/form-data" class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-6 space-y-4">
        <?= csrf_field() ?>
        <!-- Honeypot anti-spam -->
        <input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off">

        <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>

        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Kampeni (hiari)</label>
            <select name="campaign_id" class="<?= $tf ?>">
                <option value="">Mchango wa Jumla</option>
                <?php foreach ($campaigns as $c): ?>
                <option value="<?= $c['id'] ?>" <?= ($_GET['campaign'] ?? '') == $c['id'] ? 'selected' : '' ?>><?= e($c['title']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>

        <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jina Lako</label><input type="text" name="donor_name" class="<?= $tf ?>" placeholder="Jina au 'Mchangiaji Asiyejulikana'"></div>

        <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Simu</label><input type="tel" name="donor_phone" class="<?= $tf ?>" placeholder="+255 7XX XXX XXX"></div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Barua Pepe</label><input type="email" name="donor_email" class="<?= $tf ?>"></div>
        </div>

        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Kiasi (TZS) *</label>
            <input type="number" name="amount" required min="100" step="100" class="<?= $tf ?>" placeholder="Ingiza kiasi ulichotuma">
        </div>

        <div class="grid grid-cols-2 gap-3">
            <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Njia ya Malipo</label>
                <select name="payment_method" class="<?= $tf ?>">
                    <option value="mpesa">M-Pesa</option>
                    <option value="tigopesa">Tigo Pesa</option>
                    <option value="airtel">Airtel Money</option>
                    <option value="bank">Benki</option>
                    <option value="cash">Taslimu</option>
                    <option value="other">Nyingine</option>
                </select>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Namba ya Uthibitisho</label><input type="text" name="reference_number" class="<?= $tf ?>" placeholder="mfano: TXN123456"></div>
        </div>

        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Picha ya Uthibitisho (hiari)</label>
            <input type="file" name="proof" accept=".jpg,.jpeg,.png,.pdf" class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100">
            <p class="text-xs text-gray-400 mt-1">JPG, PNG au PDF — max 5MB</p>
        </div>

        <button type="submit" class="w-full py-3 bg-brand-700 text-white font-semibold rounded-xl hover:bg-brand-800 transition-colors">
            Tuma Mchango
        </button>
        <p class="text-xs text-center text-gray-400">Mchango wako utakaguliwa na kuhifadhiwa. Asante kwa ukarimu wako.</p>
    </form>
</div>
