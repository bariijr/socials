<div class="flex gap-5 h-[calc(100vh-8rem)]" x-data="{ newConv: !<?= $convId ? 'false' : 'false' ?> }">

    <!-- Sidebar: conversation list -->
    <div class="hidden lg:flex flex-col w-64 flex-shrink-0 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div class="px-4 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 class="font-semibold text-gray-900 dark:text-white text-sm">Mazungumzo</h2>
            <a href="/ai" class="w-7 h-7 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 hover:bg-brand-200 transition-colors" title="Mazungumzo Mapya">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            </a>
        </div>
        <div class="flex-1 overflow-y-auto py-2">
            <?php if (empty($conversations)): ?>
            <p class="px-4 py-6 text-xs text-gray-400 text-center">Hakuna mazungumzo bado. Anza mazungumzo mapya.</p>
            <?php else: ?>
            <?php foreach ($conversations as $conv): ?>
            <a href="/ai?conv=<?= $conv['id'] ?>"
                class="flex items-start gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 group <?= ($current && $current['id'] == $conv['id']) ? 'bg-brand-50 dark:bg-brand-900/20' : '' ?>">
                <svg class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate"><?= e($conv['title']) ?></p>
                    <p class="text-xs text-gray-400"><?= timeAgo($conv['created_at']) ?></p>
                </div>
                <form method="POST" action="/ai/conversations/<?= $conv['id'] ?>/delete" class="opacity-0 group-hover:opacity-100">
                    <?= csrf_field() ?>
                    <button type="submit" onclick="event.stopPropagation(); return confirm('Futa mazungumzo haya?')" class="text-gray-300 hover:text-red-500 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </form>
            </a>
            <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>

    <!-- Main chat area -->
    <div class="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <!-- Header -->
        <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <div class="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2"/></svg>
            </div>
            <div>
                <p class="text-sm font-semibold text-gray-900 dark:text-white"><?= $current ? e($current['title']) : 'Msaidizi wa AI wa Parokia' ?></p>
                <p class="text-xs text-gray-400">Niulize kuhusu fedha, wanachama, au takwimu za parokia</p>
            </div>
        </div>

        <!-- Messages -->
        <div class="flex-1 overflow-y-auto px-5 py-5 space-y-4" id="messages">
            <?php if (empty($messages) && !$current): ?>
            <!-- Welcome screen -->
            <div class="flex flex-col items-center justify-center h-full text-center py-12">
                <div class="w-16 h-16 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center mb-4">
                    <svg class="w-8 h-8 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2"/></svg>
                </div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">Karibu, Msaidizi wa AI</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-sm">Niulize maswali kuhusu takwimu za parokia yako — mapato, wanachama, jumuiya, na zaidi.</p>
                <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full">
                    <?php
                    $prompts = [
                        'Je, mapato ya mwezi huu ni kiasi gani?',
                        'Ni jumuiya gani ina wanachama wengi zaidi?',
                        'Nionyeshe muhtasari wa fedha za mwaka huu.',
                        'Ni miamala mingapi inayosubiri idhini?',
                    ];
                    foreach ($prompts as $pr): ?>
                    <button type="button"
                        onclick="document.getElementById('msgInput').value = <?= json_encode($pr) ?>; document.getElementById('chatForm').requestSubmit()"
                        class="text-left text-xs px-3 py-2.5 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors border border-gray-200 dark:border-gray-600">
                        <?= e($pr) ?>
                    </button>
                    <?php endforeach; ?>
                </div>
            </div>
            <?php else: ?>
            <?php foreach ($messages as $msg): ?>
            <div class="flex <?= $msg['role'] === 'user' ? 'justify-end' : 'justify-start' ?> gap-3">
                <?php if ($msg['role'] === 'assistant'): ?>
                <div class="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0 mt-1">
                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2"/></svg>
                </div>
                <?php endif; ?>
                <div class="max-w-[80%] rounded-2xl px-4 py-3 text-sm
                    <?= $msg['role'] === 'user'
                        ? 'bg-brand-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-tl-sm' ?>">
                    <?= nl2br(e($msg['content'])) ?>
                </div>
            </div>
            <?php endforeach; ?>
            <?php endif; ?>
        </div>

        <!-- Input -->
        <div class="px-5 py-4 border-t border-gray-100 dark:border-gray-700">
            <form method="POST" action="/ai/ask" id="chatForm" class="flex gap-3">
                <?= csrf_field() ?>
                <input type="hidden" name="conv_id" value="<?= $convId ?>">
                <input type="text" name="message" id="msgInput" required autocomplete="off"
                    placeholder="Andika swali lako hapa..."
                    class="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <button type="submit" class="px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors flex-shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                </button>
            </form>
        </div>
    </div>
</div>

<script>
document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
</script>
