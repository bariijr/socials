'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, MoreVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import { usersApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { User, UserRole, UserStatus } from '@/types';
import { useAuthStore } from '@/store';

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  loan_officer: 'bg-teal-100 text-teal-700',
  user: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  suspended: 'bg-red-100 text-red-700',
  inactive: 'bg-gray-100 text-gray-500',
};

export default function UsersPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', role: 'loan_officer' });

  const { data, isLoading } = useQuery({
    queryKey: ['users', { search, role }],
    queryFn: () => usersApi.list({ search, role, limit: 30 }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created');
      setShowCreate(false);
      setNewUser({ firstName: '', lastName: '', email: '', phone: '', password: '', role: 'loan_officer' });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create user'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      usersApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Status updated');
    },
  });

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="text-xs text-gray-500">{data?.total || 0} total</p>
        </div>
        {currentUser?.role === 'super_admin' && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" /> Add User
          </button>
        )}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="card space-y-3">
          <h2 className="section-title">Create New User</h2>
          {[
            { key: 'firstName', label: 'First Name', type: 'text' },
            { key: 'lastName', label: 'Last Name', type: 'text' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'phone', label: 'Phone', type: 'tel' },
            { key: 'password', label: 'Password', type: 'password' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input
                type={type}
                value={(newUser as any)[key]}
                onChange={(e) => setNewUser({ ...newUser, [key]: e.target.value })}
                className="input"
              />
            </div>
          ))}
          <div>
            <label className="label">Role</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              className="input"
            >
              <option value="loan_officer">Loan Officer</option>
              <option value="admin">Admin</option>
              {currentUser?.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
              <option value="user">Borrower</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={() => createMutation.mutate(newUser)} className="btn-primary flex-1">
              {createMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 text-sm py-2"
            placeholder="Search name or email..."
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="input w-auto text-sm py-2 px-3"
        >
          <option value="">All roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="loan_officer">Loan Officer</option>
          <option value="user">Borrower</option>
        </select>
      </div>

      {/* Users List */}
      <div className="space-y-2">
        {isLoading && [...Array(5)].map((_, i) => <div key={i} className="card h-16 skeleton" />)}
        {!isLoading && data?.items?.length === 0 && (
          <div className="card text-center py-10">
            <p className="text-gray-400 text-sm">No users found</p>
          </div>
        )}
        {data?.items?.map((u: User) => (
          <div key={u.id} className="card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-primary-700 text-sm font-bold">
                  {u.firstName?.[0]}{u.lastName?.[0]}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {u.firstName} {u.lastName}
                </p>
                <p className="text-xs text-gray-500">{u.email}</p>
                <div className="flex gap-1 mt-0.5">
                  <span className={`badge text-[10px] ${ROLE_COLORS[u.role] || ''} capitalize`}>
                    {u.role.replace('_', ' ')}
                  </span>
                  <span className={`badge text-[10px] ${STATUS_COLORS[u.status] || ''} capitalize`}>
                    {u.status}
                  </span>
                </div>
              </div>
            </div>
            {currentUser?.role === 'super_admin' && u.id !== currentUser.id && (
              <div className="flex gap-1">
                {u.status === 'active' ? (
                  <button
                    onClick={() => statusMutation.mutate({ id: u.id, status: 'suspended' as UserStatus })}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Suspend
                  </button>
                ) : u.status === 'suspended' ? (
                  <button
                    onClick={() => statusMutation.mutate({ id: u.id, status: 'active' as UserStatus })}
                    className="text-xs text-green-600 hover:underline"
                  >
                    Activate
                  </button>
                ) : u.status === 'pending' ? (
                  <button
                    onClick={() => statusMutation.mutate({ id: u.id, status: 'active' as UserStatus })}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Activate
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
