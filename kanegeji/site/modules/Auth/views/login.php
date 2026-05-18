<h2 class="text-xl font-bold text-white mb-6"><?= e(__('auth.login', 'Ingia')) ?></h2>

<form method="POST" action="/login" class="space-y-5">
    <?= csrf_field() ?>

    <div>
        <label for="email" class="block text-sm font-medium text-white/80 mb-1.5">
            <?= e(__('auth.email', 'Barua pepe')) ?>
        </label>
        <input type="email" id="email" name="email" required autocomplete="email"
               value="<?= e($_POST['email'] ?? '') ?>"
               class="block w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 text-sm
                      focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent">
    </div>

    <div>
        <label for="password" class="block text-sm font-medium text-white/80 mb-1.5">
            <?= e(__('auth.password', 'Nywila')) ?>
        </label>
        <div class="relative" x-data="{ show: false }">
            <input :type="show ? 'text' : 'password'" id="password" name="password" required autocomplete="current-password"
                   class="block w-full rounded-xl border border-white/20 bg-white/10 text-white placeholder-white/40 px-4 py-3 pr-12 text-sm
                          focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent">
            <button type="button" @click="show = !show"
                    class="absolute inset-y-0 right-0 flex items-center px-4 text-white/50 hover:text-white">
                <svg x-show="!show" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <svg x-show="show" x-cloak class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
            </button>
        </div>
    </div>

    <div class="flex items-center justify-between">
        <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="remember" class="rounded border-white/30 bg-white/10 text-brand-500">
            <span class="text-sm text-white/70"><?= e(__('auth.remember_me', 'Nikumbuke')) ?></span>
        </label>
        <a href="/forgot-password" class="text-sm text-white/70 hover:text-white transition-colors">
            <?= e(__('auth.forgot_password', 'Nimesahau nywila')) ?>
        </a>
    </div>

    <button type="submit"
            class="w-full flex justify-center items-center gap-2 rounded-xl bg-white text-brand-900 font-semibold py-3 px-4
                   hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-900
                   transition-all duration-200 text-sm">
        <?= e(__('auth.login', 'Ingia')) ?>
    </button>
</form>

<!-- Language switcher -->
<div class="mt-6 flex justify-center gap-4">
    <a href="?lang=sw" class="text-xs text-white/50 hover:text-white transition-colors <?= \App\Core\Lang::locale() === 'sw' ? 'text-white font-semibold' : '' ?>">Kiswahili</a>
    <span class="text-white/20">|</span>
    <a href="?lang=en" class="text-xs text-white/50 hover:text-white transition-colors <?= \App\Core\Lang::locale() === 'en' ? 'text-white font-semibold' : '' ?>">English</a>
</div>
