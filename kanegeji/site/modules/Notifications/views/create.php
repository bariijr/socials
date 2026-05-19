<div class="space-y-5 max-w-xl">
    <div class="flex items-center gap-3">
        <a href="/notifications" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Tuma Ujumbe wa Kikundi</h1>
    </div>

    <form method="POST" action="/notifications" x-data="{ audience: 'all' }"
        class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
        <?= csrf_field() ?>
        <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>

        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Kichwa cha Ujumbe *</label>
            <input type="text" name="title" required class="<?= $tf ?>">
        </div>

        <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Ujumbe *</label>
            <textarea name="message" rows="5" required class="<?= $tf ?> resize-none" maxlength="1000"></textarea>
            <p class="text-xs text-gray-400 mt-1">Unaweza kutumia: {jina} kwa jina la mpokeaji.</p>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Njia ya Kutuma</label>
                <select name="channel" class="<?= $tf ?>">
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Barua Pepe</option>
                    <option value="all">Zote (SMS+Email)</option>
                </select>
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Walengwa</label>
                <select name="audience" x-model="audience" class="<?= $tf ?>">
                    <option value="all">Wanachama Wote</option>
                    <option value="jumuiya">Jumuiya Maalum</option>
                    <option value="role">Jukumu (Watumiaji)</option>
                </select>
            </div>
        </div>

        <div x-show="audience === 'jumuiya'" x-cloak>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Chagua Jumuiya</label>
            <select name="audience_ref" class="<?= $tf ?>">
                <option value="">-- Chagua Jumuiya --</option>
                <?php foreach ($communities as $c): ?>
                <option value="<?= $c['id'] ?>"><?= e($c['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </div>

        <div x-show="audience === 'role'" x-cloak>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jukumu</label>
            <select name="audience_ref" class="<?= $tf ?>">
                <option value="priest">Kasisi</option>
                <option value="chairman">Mwenyekiti</option>
                <option value="secretary">Katibu</option>
                <option value="accountant">Mhasibu</option>
            </select>
        </div>

        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
            <p class="text-xs text-amber-700 dark:text-amber-300">Ujumbe huu utatumwa mara moja kwa wanachama wote wanaokidhi masharti. Hakikisha ujumbe ni sahihi kabla ya kutuma.</p>
        </div>

        <div class="flex gap-3 pt-2">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800">Tuma Sasa</button>
            <a href="/notifications" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200">Ghairi</a>
        </div>
    </form>
</div>
