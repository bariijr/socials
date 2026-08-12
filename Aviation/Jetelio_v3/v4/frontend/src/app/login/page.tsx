"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await api.post<TokenResponse>("/auth/login", { email, password });
      window.localStorage.setItem("jetelio_access_token", tokens.access_token);
      window.localStorage.setItem("jetelio_refresh_token", tokens.refresh_token);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? "Invalid email or password" : "Could not reach the API");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="mb-6 text-xl font-semibold">Jetelio V3 sign in</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-fg/60">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-fg/60">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-md border border-fg/20 bg-transparent px-3 text-base text-fg"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-md bg-primary font-semibold text-fg disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
