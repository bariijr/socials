<?php
$title = 'Loans — Pounds MFI';
$page  = 'loans';
?>
<?php ob_start(); ?>

<div x-data="loansPage()" x-init="init()">
    <!-- Header actions -->
    <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-3">
            <input x-model="search" @input.debounce.300ms="loadLoans()" type="search" placeholder="Search loan number..." class="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <select x-model="statusFilter" @change="loadLoans()" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="disbursed">Disbursed</option>
                <option value="overdue">Overdue</option>
                <option value="closed">Closed</option>
                <option value="rejected">Rejected</option>
            </select>
        </div>
        <button @click="openCreateModal()" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New Loan
        </button>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Loan #</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Borrower</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Package</th>
                        <th class="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                        <th class="text-right px-4 py-3 font-medium text-gray-600">Outstanding</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Due Date</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <template x-for="loan in loans" :key="loan.id">
                        <tr class="hover:bg-gray-50 cursor-pointer" @click="viewLoan(loan)">
                            <td class="px-4 py-3 font-medium text-blue-600" x-text="loan.loanNumber"></td>
                            <td class="px-4 py-3 text-gray-700" x-text="loan.firstName + ' ' + loan.lastName"></td>
                            <td class="px-4 py-3 text-gray-500" x-text="loan.packageName"></td>
                            <td class="px-4 py-3 text-right font-medium" x-text="fmt(loan.principalAmount)"></td>
                            <td class="px-4 py-3 text-right" :class="loan.outstandingBalance > 0 ? 'text-red-600 font-medium' : 'text-green-600'" x-text="fmt(loan.outstandingBalance)"></td>
                            <td class="px-4 py-3"><span class="text-xs px-2 py-1 rounded-full font-medium" :class="statusClass(loan.status)" x-text="loan.status"></span></td>
                            <td class="px-4 py-3 text-gray-500 text-xs" x-text="loan.dueDate ?? '—'"></td>
                            <td class="px-4 py-3" @click.stop>
                                <div class="flex items-center gap-1">
                                    <button x-show="loan.status === 'submitted'" @click.stop="approveLoan(loan.id)" class="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2 py-1 rounded">Approve</button>
                                    <button x-show="loan.status === 'approved'" @click.stop="disburseLoan(loan.id)" class="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 rounded">Disburse</button>
                                    <button x-show="['submitted','approved'].includes(loan.status)" @click.stop="rejectLoan(loan.id)" class="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2 py-1 rounded">Reject</button>
                                </div>
                            </td>
                        </tr>
                    </template>
                    <tr x-show="!loading && loans.length === 0">
                        <td colspan="8" class="px-4 py-10 text-center text-gray-400 text-sm">No loans found</td>
                    </tr>
                    <tr x-show="loading">
                        <td colspan="8" class="px-4 py-10 text-center"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500" x-show="total > 0">
            <span x-text="'Showing ' + loans.length + ' of ' + total"></span>
            <div class="flex gap-2">
                <button @click="page > 1 && (page--, loadLoans())" :disabled="page === 1" class="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Previous</button>
                <button @click="page < pages && (page++, loadLoans())" :disabled="page >= pages" class="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
        </div>
    </div>

    <!-- Loan Detail Modal -->
    <div x-show="selectedLoan" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" @click.self="selectedLoan = null">
        <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl" @click.stop>
            <div class="flex items-center justify-between p-5 border-b border-gray-200">
                <h2 class="text-base font-semibold text-gray-900" x-text="'Loan ' + selectedLoan?.loanNumber"></h2>
                <button @click="selectedLoan = null" class="text-gray-400 hover:text-gray-600"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div class="p-5 space-y-4">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div><span class="text-gray-500">Borrower:</span> <span class="font-medium" x-text="selectedLoan?.firstName + ' ' + selectedLoan?.lastName"></span></div>
                    <div><span class="text-gray-500">Status:</span> <span class="font-medium capitalize" x-text="selectedLoan?.status"></span></div>
                    <div><span class="text-gray-500">Principal:</span> <span class="font-medium" x-text="fmt(selectedLoan?.principalAmount)"></span></div>
                    <div><span class="text-gray-500">Outstanding:</span> <span class="font-medium text-red-600" x-text="fmt(selectedLoan?.outstandingBalance)"></span></div>
                    <div><span class="text-gray-500">Interest Rate:</span> <span class="font-medium" x-text="selectedLoan?.interestRate + '% / month'"></span></div>
                    <div><span class="text-gray-500">Duration:</span> <span class="font-medium" x-text="selectedLoan?.durationDays + ' days'"></span></div>
                    <div><span class="text-gray-500">Due Date:</span> <span class="font-medium" x-text="selectedLoan?.dueDate ?? '—'"></span></div>
                    <div><span class="text-gray-500">Total Repayable:</span> <span class="font-medium" x-text="fmt(selectedLoan?.totalRepayable)"></span></div>
                </div>
                <div x-show="selectedLoan?.purpose">
                    <div class="text-xs text-gray-500 mb-1">Purpose</div>
                    <div class="text-sm text-gray-700" x-text="selectedLoan?.purpose"></div>
                </div>
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <h3 class="text-sm font-semibold text-gray-700">Repayments</h3>
                        <button x-show="['disbursed','overdue'].includes(selectedLoan?.status)" @click="openRepaymentModal()" class="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2 py-1 rounded">Record Payment</button>
                    </div>
                    <div class="space-y-2">
                        <template x-for="r in selectedLoan?.repayments ?? []" :key="r.id">
                            <div class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                                <span class="text-gray-600" x-text="r.paymentDate"></span>
                                <span class="text-gray-500 capitalize" x-text="r.paymentMethod"></span>
                                <span class="font-medium text-green-700" x-text="fmt(r.amount)"></span>
                            </div>
                        </template>
                        <div x-show="!(selectedLoan?.repayments ?? []).length" class="text-sm text-gray-400 text-center py-2">No repayments yet</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Create Loan Modal -->
    <div x-show="showCreate" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" @click.self="showCreate = false">
        <div class="bg-white rounded-2xl w-full max-w-lg shadow-xl" @click.stop>
            <div class="flex items-center justify-between p-5 border-b border-gray-200">
                <h2 class="text-base font-semibold text-gray-900">New Loan Application</h2>
                <button @click="showCreate = false" class="text-gray-400 hover:text-gray-600"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <form @submit.prevent="createLoan()" class="p-5 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Loan Package</label>
                    <select x-model="newLoan.packageId" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select package</option>
                        <template x-for="p in packages" :key="p.id">
                            <option :value="p.id" x-text="p.name + ' — ' + p.interestRate + '%/mo'"></option>
                        </template>
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Amount (TZS)</label>
                        <input type="number" x-model="newLoan.principalAmount" min="1000" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Duration (days)</label>
                        <input type="number" x-model="newLoan.durationDays" min="1" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Borrower ID (leave blank for self)</label>
                    <input type="text" x-model="newLoan.borrowerId" placeholder="User UUID (optional)" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                    <textarea x-model="newLoan.purpose" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                </div>
                <div x-show="createError" class="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" x-text="createError"></div>
                <div class="flex gap-3 pt-1">
                    <button type="button" @click="showCreate = false" class="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button type="submit" :disabled="creating" class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium py-2 rounded-lg" x-text="creating ? 'Creating...' : 'Create Loan'"></button>
                </div>
            </form>
        </div>
    </div>

    <!-- Record Repayment Modal -->
    <div x-show="showRepayment" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" @click.self="showRepayment = false">
        <div class="bg-white rounded-2xl w-full max-w-md shadow-xl" @click.stop>
            <div class="flex items-center justify-between p-5 border-b border-gray-200">
                <h2 class="text-base font-semibold text-gray-900">Record Repayment</h2>
                <button @click="showRepayment = false" class="text-gray-400 hover:text-gray-600"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <form @submit.prevent="recordRepayment()" class="p-5 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Amount (TZS)</label>
                    <input type="number" x-model="repayment.amount" min="1" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                    <input type="date" x-model="repayment.paymentDate" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <select x-model="repayment.paymentMethod" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="cash">Cash</option>
                        <option value="mobile_money">Mobile Money</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cheque">Cheque</option>
                    </select>
                </div>
                <div class="flex gap-3 pt-1">
                    <button type="button" @click="showRepayment = false" class="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button type="submit" :disabled="recording" class="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium py-2 rounded-lg" x-text="recording ? 'Recording...' : 'Record Payment'"></button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
function loansPage() {
    return {
        loans: [], packages: [], total: 0, pages: 1, page: 1,
        search: '', statusFilter: '', loading: true,
        selectedLoan: null, showCreate: false, showRepayment: false,
        newLoan: { packageId: '', principalAmount: '', durationDays: '', borrowerId: '', purpose: '' },
        repayment: { amount: '', paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'cash' },
        createError: '', creating: false, recording: false,

        async init() {
            const token = localStorage.getItem('access_token');
            if (!token) return;
            await Promise.all([this.loadLoans(), this.loadPackages()]);
        },

        async loadLoans() {
            this.loading = true;
            const token = localStorage.getItem('access_token');
            const params = new URLSearchParams({ page: this.page });
            if (this.search) params.set('search', this.search);
            if (this.statusFilter) params.set('status', this.statusFilter);
            try {
                const res = await fetch('/api/loans?' + params, { headers: { Authorization: 'Bearer ' + token } });
                if (res.ok) { const d = await res.json(); this.loans = d.loans; this.total = d.total; this.pages = d.pages; }
            } catch {} finally { this.loading = false; }
        },

        async loadPackages() {
            const token = localStorage.getItem('access_token');
            try { const res = await fetch('/api/loan-packages', { headers: { Authorization: 'Bearer ' + token } }); if (res.ok) this.packages = await res.json(); } catch {}
        },

        async viewLoan(loan) {
            const token = localStorage.getItem('access_token');
            try { const res = await fetch('/api/loans/' + loan.id, { headers: { Authorization: 'Bearer ' + token } }); if (res.ok) this.selectedLoan = await res.json(); } catch {}
        },

        openCreateModal() { this.newLoan = { packageId:'', principalAmount:'', durationDays:'', borrowerId:'', purpose:'' }; this.createError=''; this.showCreate=true; },

        async createLoan() {
            this.creating = true; this.createError = '';
            const token = localStorage.getItem('access_token');
            try {
                const res = await fetch('/api/loans', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body:JSON.stringify(this.newLoan) });
                const data = await res.json();
                if (!res.ok) { this.createError = data.error || 'Failed'; return; }
                this.showCreate = false; await this.loadLoans();
            } catch { this.createError = 'Network error'; } finally { this.creating = false; }
        },

        openRepaymentModal() { this.repayment = { amount:'', paymentDate: new Date().toISOString().split('T')[0], paymentMethod:'cash' }; this.showRepayment=true; },

        async recordRepayment() {
            this.recording = true;
            const token = localStorage.getItem('access_token');
            try {
                const res = await fetch('/api/repayments', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body:JSON.stringify({ ...this.repayment, loanId: this.selectedLoan.id }) });
                if (res.ok) { this.showRepayment=false; await this.viewLoan(this.selectedLoan); await this.loadLoans(); }
            } catch {} finally { this.recording = false; }
        },

        async approveLoan(id) { if (!confirm('Approve this loan?')) return; const t=localStorage.getItem('access_token'); await fetch('/api/loans/'+id+'/approve',{method:'POST',headers:{Authorization:'Bearer '+t}}); await this.loadLoans(); },
        async disburseLoan(id) { if (!confirm('Mark as disbursed?')) return; const t=localStorage.getItem('access_token'); await fetch('/api/loans/'+id+'/disburse',{method:'POST',headers:{Authorization:'Bearer '+t}}); await this.loadLoans(); },
        async rejectLoan(id) { const r=prompt('Rejection reason:'); if(!r) return; const t=localStorage.getItem('access_token'); await fetch('/api/loans/'+id+'/reject',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({reason:r})}); await this.loadLoans(); },

        fmt(n) { return 'TZS ' + Number(n??0).toLocaleString(); },
        statusClass(s) { return {draft:'bg-gray-100 text-gray-600',submitted:'bg-amber-100 text-amber-700',approved:'bg-blue-100 text-blue-700',disbursed:'bg-green-100 text-green-700',overdue:'bg-red-100 text-red-700',closed:'bg-purple-100 text-purple-700',rejected:'bg-gray-100 text-gray-500'}[s]??'bg-gray-100 text-gray-600'; }
    };
}
</script>

<?php $slot = ob_get_clean(); require __DIR__ . '/../layouts/app.php'; ?>
