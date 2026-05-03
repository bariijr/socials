<?php
$title = 'KYC — Pounds MFI';
$page  = 'kyc';
?>
<?php ob_start(); ?>

<div x-data="kycPage()" x-init="init()">
    <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-3">
            <input x-model="search" @input.debounce.300ms="loadKyc()" type="search" placeholder="Search name or ID..." class="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <select x-model="statusFilter" @change="loadKyc()" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
            </select>
        </div>
        <button @click="openCreateModal()" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            New KYC
        </button>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Full Name</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">ID Number</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <template x-for="k in kyc" :key="k.id">
                        <tr class="hover:bg-gray-50 cursor-pointer" @click="viewKyc(k)">
                            <td class="px-4 py-3 font-medium text-gray-900" x-text="k.fullName"></td>
                            <td class="px-4 py-3 text-gray-500" x-text="k.idNumber"></td>
                            <td class="px-4 py-3 text-gray-500" x-text="k.phone"></td>
                            <td class="px-4 py-3 text-gray-500" x-text="k.email"></td>
                            <td class="px-4 py-3"><span class="text-xs px-2 py-1 rounded-full font-medium" :class="statusClass(k.status)" x-text="k.status"></span></td>
                            <td class="px-4 py-3 text-gray-400 text-xs" x-text="(k.createdAt ?? '').substring(0,10)"></td>
                            <td class="px-4 py-3" @click.stop>
                                <div class="flex gap-1">
                                    <button x-show="k.status === 'submitted'" @click.stop="approveKyc(k.id)" class="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-2 py-1 rounded">Approve</button>
                                    <button x-show="k.status === 'submitted'" @click.stop="rejectKyc(k.id)" class="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2 py-1 rounded">Reject</button>
                                </div>
                            </td>
                        </tr>
                    </template>
                    <tr x-show="!loading && kyc.length === 0">
                        <td colspan="7" class="px-4 py-10 text-center text-gray-400 text-sm">No KYC records found</td>
                    </tr>
                    <tr x-show="loading">
                        <td colspan="7" class="px-4 py-10 text-center"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- KYC Detail Modal -->
    <div x-show="selectedKyc" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" @click.self="selectedKyc = null">
        <div class="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl" @click.stop>
            <div class="flex items-center justify-between p-5 border-b border-gray-200">
                <h2 class="text-base font-semibold text-gray-900" x-text="selectedKyc?.fullName + ' — KYC'"></h2>
                <div class="flex items-center gap-2">
                    <button @click="downloadPdf(selectedKyc.id)" class="text-xs bg-gray-50 text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">Print / PDF</button>
                    <button @click="selectedKyc = null" class="text-gray-400 hover:text-gray-600"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
            </div>
            <div class="p-5 space-y-4 text-sm">
                <div class="grid grid-cols-2 gap-3">
                    <div><span class="text-gray-500">ID Type:</span> <span class="font-medium capitalize" x-text="selectedKyc?.idType?.replace('_',' ')"></span></div>
                    <div><span class="text-gray-500">ID Number:</span> <span class="font-medium" x-text="selectedKyc?.idNumber"></span></div>
                    <div><span class="text-gray-500">Date of Birth:</span> <span class="font-medium" x-text="selectedKyc?.dateOfBirth ?? '—'"></span></div>
                    <div><span class="text-gray-500">Gender:</span> <span class="font-medium capitalize" x-text="selectedKyc?.gender ?? '—'"></span></div>
                    <div><span class="text-gray-500">Phone:</span> <span class="font-medium" x-text="selectedKyc?.phone"></span></div>
                    <div><span class="text-gray-500">Email:</span> <span class="font-medium" x-text="selectedKyc?.email"></span></div>
                    <div><span class="text-gray-500">City:</span> <span class="font-medium" x-text="selectedKyc?.city ?? '—'"></span></div>
                    <div><span class="text-gray-500">Address:</span> <span class="font-medium" x-text="selectedKyc?.address ?? '—'"></span></div>
                    <div><span class="text-gray-500">Occupation:</span> <span class="font-medium" x-text="selectedKyc?.occupation ?? '—'"></span></div>
                    <div><span class="text-gray-500">Monthly Income:</span> <span class="font-medium" x-text="selectedKyc?.monthlyIncome ? 'TZS ' + Number(selectedKyc.monthlyIncome).toLocaleString() : '—'"></span></div>
                    <div><span class="text-gray-500">Status:</span> <span class="font-medium capitalize" x-text="selectedKyc?.status"></span></div>
                </div>

                <div>
                    <h3 class="text-sm font-semibold text-gray-700 mb-2">Documents</h3>
                    <div class="space-y-2">
                        <template x-for="doc in selectedKyc?.documents ?? []" :key="doc.id">
                            <div class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                                <span class="text-gray-700 capitalize" x-text="doc.documentType.replace('_', ' ')"></span>
                                <span class="text-xs text-gray-500" x-text="doc.fileName"></span>
                            </div>
                        </template>
                        <div x-show="!(selectedKyc?.documents ?? []).length" class="text-sm text-gray-400">No documents uploaded</div>
                    </div>
                </div>

                <div x-show="['draft','submitted'].includes(selectedKyc?.status)">
                    <h3 class="text-sm font-semibold text-gray-700 mb-2">Upload Document</h3>
                    <div class="flex items-center gap-3 flex-wrap">
                        <select x-model="uploadDocType" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
                            <option value="national_id_front">National ID Front</option>
                            <option value="national_id_back">National ID Back</option>
                            <option value="passport">Passport</option>
                            <option value="utility_bill">Utility Bill</option>
                            <option value="bank_statement">Bank Statement</option>
                            <option value="selfie">Selfie</option>
                        </select>
                        <input type="file" x-ref="docFile" accept="image/*,.pdf" class="text-sm">
                        <button @click="uploadDocument()" :disabled="uploading" class="bg-blue-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400" x-text="uploading ? 'Uploading...' : 'Upload'"></button>
                    </div>
                </div>

                <div x-show="selectedKyc?.status === 'draft'">
                    <button @click="submitKyc(selectedKyc.id)" class="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Submit for Review</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Create KYC Modal -->
    <div x-show="showCreate" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" @click.self="showCreate = false">
        <div class="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl" @click.stop>
            <div class="flex items-center justify-between p-5 border-b border-gray-200">
                <h2 class="text-base font-semibold text-gray-900">New KYC Application</h2>
                <button @click="showCreate = false" class="text-gray-400 hover:text-gray-600"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <form @submit.prevent="createKyc()" class="p-5 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input type="text" x-model="newKyc.fullName" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input type="tel" x-model="newKyc.phone" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" x-model="newKyc.email" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">ID Type</label>
                        <select x-model="newKyc.idType" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="national_id">National ID</option>
                            <option value="passport">Passport</option>
                            <option value="driving_license">Driving License</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                        <input type="text" x-model="newKyc.idNumber" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input type="text" x-model="newKyc.address" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input type="text" x-model="newKyc.city" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div x-show="createError" class="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" x-text="createError"></div>
                <div class="flex gap-3 pt-1">
                    <button type="button" @click="showCreate = false" class="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button type="submit" :disabled="creating" class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium py-2 rounded-lg" x-text="creating ? 'Creating...' : 'Create KYC'"></button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
function kycPage() {
    return {
        kyc: [], loading: true, search: '', statusFilter: '',
        selectedKyc: null, showCreate: false,
        newKyc: { fullName:'', phone:'', email:'', idType:'national_id', idNumber:'', address:'', city:'' },
        createError: '', creating: false, uploadDocType: 'national_id_front', uploading: false,

        async init() {
            const token = localStorage.getItem('access_token');
            if (!token) return;
            await this.loadKyc();
        },

        async loadKyc() {
            this.loading = true;
            const token = localStorage.getItem('access_token');
            const params = new URLSearchParams();
            if (this.search) params.set('search', this.search);
            if (this.statusFilter) params.set('status', this.statusFilter);
            try { const res = await fetch('/api/kyc?' + params, { headers: { Authorization: 'Bearer ' + token } }); if (res.ok) this.kyc = await res.json(); } catch {} finally { this.loading = false; }
        },

        async viewKyc(k) {
            const token = localStorage.getItem('access_token');
            try { const res = await fetch('/api/kyc/' + k.id, { headers: { Authorization: 'Bearer ' + token } }); if (res.ok) this.selectedKyc = await res.json(); } catch {}
        },

        openCreateModal() { this.newKyc = { fullName:'', phone:'', email:'', idType:'national_id', idNumber:'', address:'', city:'' }; this.createError=''; this.showCreate=true; },

        async createKyc() {
            this.creating = true; this.createError = '';
            const token = localStorage.getItem('access_token');
            try {
                const res = await fetch('/api/kyc', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body:JSON.stringify(this.newKyc) });
                const data = await res.json();
                if (!res.ok) { this.createError = data.error || 'Failed'; return; }
                this.showCreate = false; await this.loadKyc();
            } catch { this.createError = 'Network error'; } finally { this.creating = false; }
        },

        async uploadDocument() {
            const file = this.$refs.docFile.files[0];
            if (!file) return;
            this.uploading = true;
            const token = localStorage.getItem('access_token');
            const form = new FormData();
            form.append('document', file); form.append('documentType', this.uploadDocType);
            try { const res = await fetch('/api/kyc/' + this.selectedKyc.id + '/document', { method:'POST', headers:{ Authorization:'Bearer '+token }, body:form }); if (res.ok) await this.viewKyc(this.selectedKyc); } catch {} finally { this.uploading = false; }
        },

        async submitKyc(id) {
            if (!confirm('Submit this KYC for review?')) return;
            const token = localStorage.getItem('access_token');
            await fetch('/api/kyc/'+id+'/submit', { method:'POST', headers:{ Authorization:'Bearer '+token } });
            await this.viewKyc({ id }); await this.loadKyc();
        },

        async approveKyc(id) { if (!confirm('Approve?')) return; const t=localStorage.getItem('access_token'); await fetch('/api/kyc/'+id+'/approve',{method:'POST',headers:{Authorization:'Bearer '+t}}); await this.loadKyc(); },
        async rejectKyc(id) { const n=prompt('Rejection notes:'); if(!n) return; const t=localStorage.getItem('access_token'); await fetch('/api/kyc/'+id+'/reject',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({notes:n})}); await this.loadKyc(); },

        async downloadPdf(id) {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/api/kyc/'+id+'/pdf', { headers:{ Authorization:'Bearer '+token } });
            if (res.ok) { const data = await res.json(); const win = window.open('', '_blank'); win.document.write(data.html); win.document.close(); win.print(); }
        },

        statusClass(s) { return { draft:'bg-gray-100 text-gray-600', submitted:'bg-amber-100 text-amber-700', approved:'bg-green-100 text-green-700', rejected:'bg-red-100 text-red-700' }[s]??'bg-gray-100 text-gray-600'; }
    };
}
</script>

<?php $slot = ob_get_clean(); require __DIR__ . '/../layouts/app.php'; ?>
