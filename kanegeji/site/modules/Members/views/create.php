<div class="max-w-3xl mx-auto space-y-5">
    <div class="flex items-center gap-3">
        <a href="/members" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white"><?= e($pageTitle) ?></h1>
    </div>

    <?php if (!empty($errors)): ?>
    <div class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-700 dark:text-red-300">
        <ul class="list-disc list-inside space-y-1">
            <?php foreach ($errors as $field => $msgs): foreach ($msgs as $msg): ?>
            <li><?= e($msg) ?></li>
            <?php endforeach; endforeach; ?>
        </ul>
    </div>
    <?php endif; ?>

    <form method="POST" action="<?= isset($editing) ? '/members/' . $member['id'] : '/members' ?>"
          enctype="multipart/form-data" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-6">
        <?= csrf_field() ?>

        <!-- Personal info -->
        <div>
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">Taarifa za Kibinafsi</h2>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.first_name', 'Jina la Kwanza')) ?> *</label>
                    <input type="text" name="first_name" required value="<?= e($member['first_name'] ?? '') ?>"
                           class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.middle_name', 'Jina la Kati')) ?></label>
                    <input type="text" name="middle_name" value="<?= e($member['middle_name'] ?? '') ?>"
                           class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.last_name', 'Jina la Ukoo')) ?> *</label>
                    <input type="text" name="last_name" required value="<?= e($member['last_name'] ?? '') ?>"
                           class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.gender', 'Jinsia')) ?> *</label>
                    <select name="gender" required class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option value="">Chagua...</option>
                        <option value="male"   <?= ($member['gender'] ?? '') === 'male'   ? 'selected' : '' ?>>Kiume</option>
                        <option value="female" <?= ($member['gender'] ?? '') === 'female' ? 'selected' : '' ?>>Kike</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.dob', 'Tarehe ya Kuzaliwa')) ?></label>
                    <input type="date" name="date_of_birth" value="<?= e($member['date_of_birth'] ?? '') ?>"
                           class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.marriage_status', 'Hali ya Ndoa')) ?></label>
                    <select name="marriage_status" class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <?php foreach (['single' => 'Mseja', 'married' => 'Mwenye Ndoa', 'widowed' => 'Mjane', 'divorced' => 'Talakiwa', 'religious' => 'Mtawa'] as $v => $l): ?>
                        <option value="<?= $v ?>" <?= ($member['marriage_status'] ?? 'single') === $v ? 'selected' : '' ?>><?= $l ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
        </div>

        <!-- Contact -->
        <div>
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">Mawasiliano</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.phone', 'Simu')) ?></label>
                    <input type="tel" name="phone" value="<?= e($member['phone'] ?? '') ?>"
                           class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.email', 'Barua pepe')) ?></label>
                    <input type="email" name="email" value="<?= e($member['email'] ?? '') ?>"
                           class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.occupation', 'Kazi')) ?></label>
                    <input type="text" name="occupation" value="<?= e($member['occupation'] ?? '') ?>"
                           class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.address', 'Makazi')) ?></label>
                    <input type="text" name="address" value="<?= e($member['address'] ?? '') ?>"
                           class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                </div>
            </div>
        </div>

        <!-- Parish info -->
        <div>
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">Taarifa za Parokia</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"><?= e(__('members.community', 'Jumuiya')) ?></label>
                    <select name="community_id" class="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option value="">-- Chagua Jumuiya --</option>
                        <?php foreach ($communities as $c): ?>
                        <option value="<?= $c['id'] ?>" <?= ($member['community_id'] ?? '') == $c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="flex items-center gap-6 pt-7">
                    <label class="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" name="baptised" value="1" <?= !empty($member['baptised']) ? 'checked' : '' ?>
                               class="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500">
                        <span class="text-sm text-gray-700 dark:text-gray-300">Amebatizwa</span>
                    </label>
                    <label class="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" name="confirmed" value="1" <?= !empty($member['confirmed']) ? 'checked' : '' ?>
                               class="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500">
                        <span class="text-sm text-gray-700 dark:text-gray-300">Amethibitishwa</span>
                    </label>
                </div>
            </div>
        </div>

        <!-- Photo upload -->
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Picha (si lazima)</label>
            <input type="file" name="photo" accept="image/*"
                   class="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100">
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3 pt-2">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-semibold rounded-xl hover:bg-brand-800 transition-colors">
                <?= e(__('members.save', 'Hifadhi')) ?>
            </button>
            <a href="/members" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                <?= e(__('common.cancel', 'Ghairi')) ?>
            </a>
        </div>
    </form>
</div>
