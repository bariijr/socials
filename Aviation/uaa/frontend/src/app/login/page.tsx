'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api-client';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { accessToken } = await login(username, password);
      localStorage.setItem('uaa_token', accessToken);
      router.push('/legs');
    } catch {
      setError('Invalid username or password');
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <p className="login-eyebrow">UAA Coordinator</p>
        <h1 className="login-title">Sign in</h1>
        <div className="runway-rule" />
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn-primary" type="submit">
          Sign in
        </button>
      </form>
    </div>
  );
}
