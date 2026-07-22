import { useState, useCallback, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, Eye, EyeOff, AlertCircle, MessageSquare, Zap, Globe } from 'lucide-react'
import api from '../../lib/api'
import { useAuthStore } from '../../lib/auth'
import Button from '../../components/ui/Button'

const FEATURES = [
  {
    icon: <Zap size={18} className="shrink-0" />,
    title: 'Multi-Channel Messaging',
    description: 'Send SMS, WhatsApp, Email and Viber from a single unified platform.',
  },
  {
    icon: <Globe size={18} className="shrink-0" />,
    title: 'Campaign Management',
    description: 'Schedule bulk campaigns with audience segmentation and delivery analytics.',
  },
  {
    icon: <MessageSquare size={18} className="shrink-0" />,
    title: 'Real-time Delivery Tracking',
    description: 'Live delivery receipts and engagement metrics across every channel.',
  },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      const res = await api.post('/v1/auth/login', { email: email.trim(), password })
      setAuth(res.data.accessToken, {
        id: res.data.userId,
        email: res.data.email,
        firstName: res.data.firstName,
        lastName: res.data.lastName,
        organizationId: res.data.organizationId,
        role: res.data.role,
        isSuperAdmin: res.data.isSuperAdmin,
      })
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }, [email, password, setAuth, navigate])

  return (
    <div className="min-h-screen flex">
      {/* ── Left branding panel ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col bg-slate-950 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg,#ffffff 0,#ffffff 1px,transparent 0,transparent 50%)',
            backgroundSize: '24px 24px',
          }}
        />
        <div aria-hidden="true" className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-700 via-brand-500 to-brand-700" />
        <div aria-hidden="true" className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-brand-600/10 blur-3xl" />
        <div aria-hidden="true" className="absolute top-20 -left-16 w-64 h-64 rounded-full bg-brand-600/5 blur-2xl" />

        <div className="relative z-10 flex flex-col h-full px-10 xl:px-16 py-12">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 bg-brand-500 rounded-xl shadow-lg shadow-brand-900/40">
              <Bell size={22} className="text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-white">Notify</span>
          </div>

          <div className="mt-auto mb-auto pt-16">
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight">
              Messaging ops,
              <br />
              <span className="text-brand-400">simplified.</span>
            </h1>
            <p className="mt-4 text-lg text-slate-400 leading-relaxed max-w-sm">
              Reach your audience on every channel — SMS, WhatsApp, Email, and Viber — from one platform.
            </p>

            <ul className="mt-10 space-y-5">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex items-start gap-4">
                  <span className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600/20 text-brand-400 shrink-0">
                    {f.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{f.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{f.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-6 mt-auto pt-8 border-t border-white/10">
            <p className="text-xs text-slate-600">notify.insider.co.tz &copy; {new Date().getUTCFullYear()}</p>
          </div>
        </div>
      </div>

      {/* ── Right login panel ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 px-6 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="flex items-center justify-center w-9 h-9 bg-brand-500 rounded-xl">
              <Bell size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Notify</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Sign in to your account</h2>
            <p className="mt-1.5 text-sm text-slate-400">
              Enter your credentials to access the platform.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="you@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <Link to="/forgot-password" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  Forgot password?
                </Link>
              </div>
            </div>

            <div className="pt-1">
              <Button
                type="submit"
                loading={loading}
                disabled={!email.trim() || !password}
                className="w-full"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
            </div>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 transition-colors">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
