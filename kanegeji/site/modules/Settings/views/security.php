<div class="space-y-6 max-w-lg">
    <div class="flex items-center gap-3">
        <a href="/settings/profile" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Usalama wa Akaunti</h1>
    </div>

    <!-- 2FA section -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
                <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Uthibitishaji wa Hatua Mbili (2FA)</h3>
                <p class="text-xs text-gray-400 mt-0.5">Linda akaunti yako na Google Authenticator au Authy.</p>
            </div>
            <span class="px-2 py-0.5 rounded-full text-xs font-medium <?= $totpEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' ?>">
                <?= $totpEnabled ? 'Imewashwa' : 'Imezimwa' ?>
            </span>
        </div>

        <div class="p-5">
        <?php if (!$totpEnabled): ?>
            <?php if ($pendingSecret): ?>
            <!-- Show QR code to scan -->
            <div class="text-center space-y-4">
                <p class="text-sm text-gray-600 dark:text-gray-400">Skani code hii kwa app yako ya authenticator kisha ingiza msimbo wa tarakimu 6.</p>
                <div class="inline-block bg-white p-3 rounded-xl border border-gray-200">
                    <img src="<?= e($qrCodeUrl) ?>" alt="QR Code" class="w-40 h-40">
                </div>
                <p class="text-xs text-gray-400 font-mono bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-lg break-all"><?= e($pendingSecret) ?></p>
                <form method="POST" action="/settings/security/totp/confirm" class="flex gap-2 max-w-xs mx-auto">
                    <?= csrf_field() ?>
                    <input type="text" name="code" maxlength="6" placeholder="000000" required autocomplete="one-time-code"
                           class="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-center tracking-widest font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500">
                    <button type="submit" class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Thibitisha</button>
                </form>
            </div>
            <?php else: ?>
            <form method="POST" action="/settings/security/totp/setup">
                <?= csrf_field() ?>
                <button type="submit" class="w-full bg-brand-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-800">
                    Washa Uthibitishaji wa Hatua Mbili
                </button>
            </form>
            <?php endif; ?>

        <?php else: ?>
            <!-- 2FA is enabled -->
            <div class="space-y-3">
                <p class="text-sm text-gray-600 dark:text-gray-400">
                    Uthibitishaji wa hatua mbili umewashwa. Unahitaji msimbo kutoka kwenye app yako kila unapoingia.
                </p>

                <?php if (!empty($backupCodes)): ?>
                <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-700">
                    <p class="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">Msimbo wa Dharura — Hifadhi mahali salama!</p>
                    <div class="grid grid-cols-2 gap-1">
                        <?php foreach ($backupCodes as $code): ?>
                        <code class="text-xs font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded border border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-300"><?= e($code) ?></code>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>

                <form method="POST" action="/settings/security/totp/disable" onsubmit="return confirm('Je, una uhakika wa kuzima 2FA?')">
                    <?= csrf_field() ?>
                    <input type="text" name="code" maxlength="6" placeholder="Ingiza msimbo wa sasa kuthibitisha" required
                           class="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm mb-3 text-center tracking-widest font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500">
                    <button type="submit" class="w-full border border-red-300 text-red-600 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20">
                        Zima Uthibitishaji wa Hatua Mbili
                    </button>
                </form>
            </div>
        <?php endif; ?>
        </div>
    </div>

    <!-- Web Push -->
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden" id="pushSection">
        <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Arifa za Kivinjari</h3>
            <p class="text-xs text-gray-400 mt-0.5">Pokea matangazo ya parokia moja kwa moja kwenye kivinjari chako.</p>
        </div>
        <div class="p-5">
            <div id="pushStatus" class="text-sm text-gray-600 dark:text-gray-400 mb-3">Inakagua hali...</div>
            <button id="pushBtn" onclick="handlePushToggle()"
                    class="w-full bg-brand-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-800 hidden">
                Washa Arifa
            </button>
        </div>
    </div>
</div>

<script>
const vapidPublicKey = '<?= env('VAPID_PUBLIC_KEY', '') ?>';

async function updatePushUI() {
    const status = document.getElementById('pushStatus');
    const btn    = document.getElementById('pushBtn');

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        status.textContent = 'Kivinjari chako hakisaidii arifa za push.';
        return;
    }

    const permission = Notification.permission;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (sub) {
        status.textContent = 'Arifa za kivinjari zimewashwa.';
        btn.textContent = 'Zima Arifa';
        btn.className = btn.className.replace('bg-brand-700 hover:bg-brand-800', 'border border-red-300 text-red-600 hover:bg-red-50');
        btn.classList.remove('hidden');
    } else {
        status.textContent = permission === 'denied'
            ? 'Arifa zimezuiwa na kivinjari. Ruhusa kwenye mipangilio ya kivinjari.'
            : 'Arifa za kivinjari zimezimwa.';
        if (permission !== 'denied') {
            btn.textContent = 'Washa Arifa';
            btn.classList.remove('hidden');
        }
    }
}

async function handlePushToggle() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (sub) {
        await sub.unsubscribe();
        await fetch('/settings/security/push/unsubscribe', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name=csrf-token]').content},
            body: JSON.stringify({endpoint: sub.endpoint}),
        });
    } else {
        const newSub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        await fetch('/settings/security/push/subscribe', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name=csrf-token]').content},
            body: JSON.stringify(newSub.toJSON()),
        });
    }
    updatePushUI();
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

updatePushUI();
</script>
