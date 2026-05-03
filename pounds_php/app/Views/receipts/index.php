<?php
$title = 'Receipts — Pounds MFI';
$page  = 'receipts';
?>
<?php ob_start(); ?>

<div x-data="receiptsPage()" x-init="init()">
    <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-3">
            <select x-model="statusFilter" @change="loadReceipts()" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
            </select>
        </div>
        <button @click="showUpload = true" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            Upload Receipt
        </button>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Receipt #</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Submitted By</th>
                        <th class="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Payment Date</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Method</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <template x-for="r in receipts" :key="r.id">
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 font-medium text-blue-600" x-text="r.receiptNumber ?? '—'"></td>
                            <td class="px-4 py-3 text-gray-600" x-text="r.submittedBy"></td>
                            <td class="px-4 py-3 text-right font-medium" x-text="'TZS ' + Number(r.amount).toLocaleString()"></td>
                            <td class="px-4 py-3 text-gray-500" x-text="r.paymentDate"></td>
                            <td class="px-4 py-3 text-gray-500 capitalize" x-text="(r.paymentMethod ?? '').replace('_', ' ')"></td>
                            <td class="px-4 py-3"><span class="text-xs px-2 py-1 rounded-full font-medium" :class="statusClass(r.status)" x-text="r.status"></span></td>
                            <td class="px-4 py-3">
                                <div class="flex gap-1" x-show="r.status === 'pending'">
                                    <button @click="verifyReceipt(r.id)" class="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2 py-1 rounded">Verify</button>
                                    <button @click="rejectReceipt(r.id)" class="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2 py-1 rounded">Reject</button>
                                </div>
                            </td>
                        </tr>
                    </template>
                    <tr x-show="!loading && receipts.length === 0">
                        <td colspan="7" class="px-4 py-10 text-center text-gray-400 text-sm">No receipts found</td>
                    </tr>
                    <tr x-show="loading">
                        <td colspan="7" class="px-4 py-10 text-center"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500" x-show="receipts.length > 0">
            <span x-text="receipts.length + ' records'"></span>
            <div class="flex gap-2">
                <button @click="page > 1 && (page--, loadReceipts())" :disabled="page === 1" class="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Previous</button>
                <button @click="page++; loadReceipts()" class="px-3 py-1 border rounded hover:bg-gray-50">Next</button>
            </div>
        </div>
    </div>

    <!-- Upload Modal -->
    <div x-show="showUpload" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" @click.self="showUpload = false">
        <div class="bg-white rounded-2xl w-full max-w-md shadow-xl" @click.stop>
            <div class="flex items-center justify-between p-5 border-b border-gray-200">
                <h2 class="text-base font-semibold text-gray-900">Upload Payment Receipt</h2>
                <button @click="showUpload = false" class="text-gray-400 hover:text-gray-600"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <form @submit.prevent="uploadReceipt()" class="p-5 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Loan ID (optional)</label>
                    <input type="text" x-model="newReceipt.loanId" placeholder="Loan UUID" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Receipt Number</label>
                    <input type="text" x-model="newReceipt.receiptNumber" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Amount (TZS)</label>
                        <input type="number" x-model="newReceipt.amount" min="1" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                        <input type="date" x-model="newReceipt.paymentDate" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <select x-model="newReceipt.paymentMethod" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="cash">Cash</option>
                        <option value="mobile_money">Mobile Money</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cheque">Cheque</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Receipt File</label>
                    <input type="file" x-ref="receiptFile" accept="image/*,.pdf" required class="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none">
                </div>
                <div x-show="uploadError" class="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" x-text="uploadError"></div>
                <div class="flex gap-3 pt-1">
                    <button type="button" @click="showUpload = false" class="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button type="submit" :disabled="uploading" class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium py-2 rounded-lg" x-text="uploading ? 'Uploading...' : 'Upload'"></button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
function receiptsPage() {
    return {
        receipts: [], page: 1, statusFilter: '', loading: true,
        showUpload: false, uploading: false, uploadError: '',
        newReceipt: { loanId:'', receiptNumber:'', amount:'', paymentDate: new Date().toISOString().split('T')[0], paymentMethod:'cash' },

        async init() {
            const token = localStorage.getItem('access_token');
            if (!token) return;
            await this.loadReceipts();
        },

        async loadReceipts() {
            this.loading = true;
            const token = localStorage.getItem('access_token');
            const params = new URLSearchParams({ page: this.page });
            if (this.statusFilter) params.set('status', this.statusFilter);
            try { const res = await fetch('/api/receipts?' + params, { headers: { Authorization: 'Bearer ' + token } }); if (res.ok) this.receipts = await res.json(); } catch {} finally { this.loading = false; }
        },

        async uploadReceipt() {
            this.uploading = true; this.uploadError = '';
            const token = localStorage.getItem('access_token');
            const form = new FormData();
            form.append('receipt', this.$refs.receiptFile.files[0]);
            Object.entries(this.newReceipt).forEach(([k, v]) => v && form.append(k, v));
            try {
                const res = await fetch('/api/receipts', { method:'POST', headers:{ Authorization:'Bearer '+token }, body:form });
                const data = await res.json();
                if (!res.ok) { this.uploadError = data.error || 'Upload failed'; return; }
                this.showUpload = false; await this.loadReceipts();
            } catch { this.uploadError = 'Network error'; } finally { this.uploading = false; }
        },

        async verifyReceipt(id) { if (!confirm('Verify this receipt?')) return; const t=localStorage.getItem('access_token'); await fetch('/api/receipts/'+id+'/verify',{method:'POST',headers:{Authorization:'Bearer '+t}}); await this.loadReceipts(); },
        async rejectReceipt(id) { const r=prompt('Rejection reason:'); if(!r) return; const t=localStorage.getItem('access_token'); await fetch('/api/receipts/'+id+'/reject',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({reason:r})}); await this.loadReceipts(); },

        statusClass(s) { return { pending:'bg-amber-100 text-amber-700', verified:'bg-green-100 text-green-700', rejected:'bg-red-100 text-red-700' }[s]??'bg-gray-100 text-gray-600'; }
    };
}
</script>

<?php $slot = ob_get_clean(); require __DIR__ . '/../layouts/app.php'; ?>
