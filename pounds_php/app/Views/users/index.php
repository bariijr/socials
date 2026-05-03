<?php
$title = 'Users — Pounds MFI';
$page  = 'users';
?>
<?php ob_start(); ?>

<div x-data="usersPage()" x-init="init()">
    <div class="flex items-center gap-3 mb-5">
        <input x-model="search" @input.debounce.300ms="loadUsers()" type="search" placeholder="Search name or email..." class="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <select x-model="roleFilter" @change="loadUsers()" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="loan_officer">Loan Officer</option>
            <option value="user">Borrower</option>
        </select>
        <select x-model="statusFilter" @change="loadUsers()" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
        </select>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-50 border-b border-gray-200">
                    <tr>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Joined</th>
                        <th class="text-left px-4 py-3 font-medium text-gray-600">Last Login</th>
                        <th class="px-4 py-3"></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <template x-for="u in users" :key="u.id">
                        <tr class="hover:bg-gray-50 cursor-pointer" @click="viewUser(u)">
                            <td class="px-4 py-3">
                                <div class="flex items-center gap-2">
                                    <div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0" x-text="(u.firstName?.[0]??'')+(u.lastName?.[0]??'')"></div>
                                    <span class="font-medium text-gray-900" x-text="u.firstName + ' ' + u.lastName"></span>
                                </div>
                            </td>
                            <td class="px-4 py-3 text-gray-600" x-text="u.email"></td>
                            <td class="px-4 py-3 text-gray-500" x-text="u.phone ?? '—'"></td>
                            <td class="px-4 py-3"><span class="text-xs px-2 py-1 rounded-full font-medium" :class="roleClass(u.role)" x-text="u.role.replace('_',' ')"></span></td>
                            <td class="px-4 py-3"><span class="text-xs px-2 py-1 rounded-full font-medium" :class="statusClass(u.status)" x-text="u.status"></span></td>
                            <td class="px-4 py-3 text-gray-400 text-xs" x-text="(u.createdAt??'').substring(0,10)"></td>
                            <td class="px-4 py-3 text-gray-400 text-xs" x-text="u.lastLoginAt ? (u.lastLoginAt).substring(0,10) : 'Never'"></td>
                            <td class="px-4 py-3" @click.stop>
                                <select @change="updateUserStatus(u.id, $event.target.value)" :value="u.status" class="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none bg-white">
                                    <option value="active">Active</option>
                                    <option value="pending">Pending</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="suspended">Suspended</option>
                                </select>
                            </td>
                        </tr>
                    </template>
                    <tr x-show="!loading && users.length === 0">
                        <td colspan="8" class="px-4 py-10 text-center text-gray-400 text-sm">No users found</td>
                    </tr>
                    <tr x-show="loading">
                        <td colspan="8" class="px-4 py-10 text-center"><div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500" x-show="total > 0">
            <span x-text="'Showing ' + users.length + ' of ' + total"></span>
            <div class="flex gap-2">
                <button @click="page > 1 && (page--, loadUsers())" :disabled="page === 1" class="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Previous</button>
                <button @click="page < pages && (page++, loadUsers())" :disabled="page >= pages" class="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
        </div>
    </div>

    <!-- User Profile Modal -->
    <div x-show="selectedUser" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" @click.self="selectedUser = null">
        <div class="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-xl" @click.stop>
            <div class="flex items-center justify-between p-5 border-b border-gray-200">
                <h2 class="text-base font-semibold text-gray-900" x-text="(selectedUser?.user?.firstName ?? '') + ' ' + (selectedUser?.user?.lastName ?? '')"></h2>
                <button @click="selectedUser = null" class="text-gray-400 hover:text-gray-600"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <div class="p-5 space-y-4 text-sm">
                <div class="grid grid-cols-2 gap-3">
                    <div><span class="text-gray-500">Email:</span> <span class="font-medium" x-text="selectedUser?.user?.email"></span></div>
                    <div><span class="text-gray-500">Phone:</span> <span class="font-medium" x-text="selectedUser?.user?.phone ?? '—'"></span></div>
                    <div><span class="text-gray-500">Role:</span> <span class="font-medium capitalize" x-text="(selectedUser?.user?.role ?? '').replace('_',' ')"></span></div>
                    <div><span class="text-gray-500">Status:</span> <span class="font-medium capitalize" x-text="selectedUser?.user?.status"></span></div>
                    <div><span class="text-gray-500">National ID:</span> <span class="font-medium" x-text="selectedUser?.user?.nationalId ?? '—'"></span></div>
                    <div><span class="text-gray-500">Address:</span> <span class="font-medium" x-text="selectedUser?.user?.address ?? '—'"></span></div>
                    <div><span class="text-gray-500">Joined:</span> <span class="font-medium" x-text="(selectedUser?.user?.createdAt ?? '').substring(0,10)"></span></div>
                </div>
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <h3 class="font-semibold text-gray-700">KYC</h3>
                        <span x-show="selectedUser?.kyc" class="text-xs px-2 py-1 rounded-full font-medium" :class="kycStatusClass(selectedUser?.kyc?.status)" x-text="selectedUser?.kyc?.status"></span>
                        <span x-show="!selectedUser?.kyc" class="text-xs text-gray-400">No KYC</span>
                    </div>
                </div>
                <div>
                    <h3 class="font-semibold text-gray-700 mb-2">Recent Loans</h3>
                    <div class="space-y-1">
                        <template x-for="l in selectedUser?.loans ?? []" :key="l.id">
                            <div class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                                <span class="font-medium text-blue-600" x-text="l.loanNumber"></span>
                                <span class="text-gray-700" x-text="'TZS ' + Number(l.principalAmount).toLocaleString()"></span>
                                <span class="text-xs px-2 py-0.5 rounded-full" :class="loanStatusClass(l.status)" x-text="l.status"></span>
                            </div>
                        </template>
                        <div x-show="!(selectedUser?.loans ?? []).length" class="text-gray-400">No loans yet</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function usersPage() {
    return {
        users: [], total: 0, pages: 1, page: 1, loading: true,
        search: '', roleFilter: '', statusFilter: '', selectedUser: null,

        async init() {
            const token = localStorage.getItem('access_token');
            if (!token) return;
            await this.loadUsers();
        },

        async loadUsers() {
            this.loading = true;
            const token = localStorage.getItem('access_token');
            const params = new URLSearchParams({ page: this.page });
            if (this.search) params.set('search', this.search);
            if (this.roleFilter) params.set('role', this.roleFilter);
            if (this.statusFilter) params.set('status', this.statusFilter);
            try {
                const res = await fetch('/api/users?' + params, { headers: { Authorization: 'Bearer ' + token } });
                if (res.ok) { const d = await res.json(); this.users = d.users; this.total = d.total; this.pages = d.pages; }
            } catch {} finally { this.loading = false; }
        },

        async viewUser(u) {
            const token = localStorage.getItem('access_token');
            try { const res = await fetch('/api/users/'+u.id+'/profile', { headers: { Authorization: 'Bearer ' + token } }); if (res.ok) this.selectedUser = await res.json(); } catch {}
        },

        async updateUserStatus(id, status) {
            const token = localStorage.getItem('access_token');
            await fetch('/api/users/'+id, { method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body:JSON.stringify({ status }) });
            const u = this.users.find(u => u.id === id); if (u) u.status = status;
        },

        roleClass(r) { return { super_admin:'bg-purple-100 text-purple-700', admin:'bg-blue-100 text-blue-700', loan_officer:'bg-indigo-100 text-indigo-700', user:'bg-gray-100 text-gray-600' }[r]??'bg-gray-100 text-gray-600'; },
        statusClass(s) { return { active:'bg-green-100 text-green-700', pending:'bg-amber-100 text-amber-700', inactive:'bg-gray-100 text-gray-500', suspended:'bg-red-100 text-red-700' }[s]??'bg-gray-100 text-gray-600'; },
        kycStatusClass(s) { return { approved:'bg-green-100 text-green-700', submitted:'bg-amber-100 text-amber-700', rejected:'bg-red-100 text-red-700', draft:'bg-gray-100 text-gray-600' }[s]??'bg-gray-100 text-gray-600'; },
        loanStatusClass(s) { return { draft:'bg-gray-100 text-gray-600', submitted:'bg-amber-100 text-amber-700', approved:'bg-blue-100 text-blue-700', disbursed:'bg-green-100 text-green-700', overdue:'bg-red-100 text-red-700', closed:'bg-purple-100 text-purple-700' }[s]??'bg-gray-100 text-gray-600'; }
    };
}
</script>

<?php $slot = ob_get_clean(); require __DIR__ . '/../layouts/app.php'; ?>
