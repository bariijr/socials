<div class="space-y-5 max-w-3xl">
    <div class="flex items-center gap-3">
        <a href="/payroll/employees/<?= $emp['id'] ?>" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </a>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">Hariri — <?= e($emp['first_name'] . ' ' . $emp['last_name']) ?></h1>
    </div>

    <form method="POST" action="/payroll/employees/<?= $emp['id'] ?>" class="space-y-6">
        <?= csrf_field() ?>
        <input type="hidden" name="_method" value="PUT">

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <h2 class="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Taarifa Binafsi</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <?php $tf = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500'; ?>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jina la Kwanza *</label><input type="text" name="first_name" value="<?= e($emp['first_name']) ?>" required class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Jina la Familia *</label><input type="text" name="last_name" value="<?= e($emp['last_name']) ?>" required class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Simu</label><input type="tel" name="phone" value="<?= e($emp['phone'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Barua Pepe</label><input type="email" name="email" value="<?= e($emp['email'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Nafasi *</label><input type="text" name="position" value="<?= e($emp['position']) ?>" required class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Idara</label><input type="text" name="department" value="<?= e($emp['department'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Hali</label>
                    <select name="status" class="<?= $tf ?>">
                        <?php foreach (['active'=>'Anafanya kazi','inactive'=>'Hana kazi','terminated'=>'Ameacha'] as $v => $l): ?>
                        <option value="<?= $v ?>" <?= $emp['status'] === $v ? 'selected' : '' ?>><?= $l ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Tarehe ya Kumaliza</label><input type="date" name="employment_end" value="<?= e($emp['employment_end'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Benki</label><input type="text" name="bank_name" value="<?= e($emp['bank_name'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Nambari ya Akaunti</label><input type="text" name="bank_account" value="<?= e($emp['bank_account'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Nambari ya NSSF</label><input type="text" name="nssf_number" value="<?= e($emp['nssf_number'] ?? '') ?>" class="<?= $tf ?>"></div>
                <div><label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Nambari ya TIN</label><input type="text" name="tin_number" value="<?= e($emp['tin_number'] ?? '') ?>" class="<?= $tf ?>"></div>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <h2 class="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide">Sasisha Mshahara (itaunda rekodi mpya)</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <?php $fields = ['basic_salary'=>'Mshahara Msingi','housing_allowance'=>'Posho Nyumba','transport_allowance'=>'Posho Usafiri','other_allowances'=>'Posho Nyingine','nssf_employee'=>'NSSF (Mfanyakazi)','nssf_employer'=>'NSSF (Mwajiri)','paye'=>'PAYE','other_deductions'=>'Makato Mengine']; ?>
                <?php foreach ($fields as $name => $label): ?>
                <div>
                    <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5"><?= $label ?></label>
                    <input type="number" name="<?= $name ?>" value="<?= $salary[$name] ?? 0 ?>" min="0" step="0.01" class="<?= $tf ?>">
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Maelezo ya Ziada</label>
            <textarea name="notes" rows="3" class="<?= $tf ?> resize-none"><?= e($emp['notes'] ?? '') ?></textarea>
        </div>

        <div class="flex gap-3">
            <button type="submit" class="px-6 py-2.5 bg-brand-700 text-white text-sm font-medium rounded-xl hover:bg-brand-800 transition-colors">Hifadhi Mabadiliko</button>
            <a href="/payroll/employees/<?= $emp['id'] ?>" class="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Ghairi</a>
        </div>
    </form>
</div>
