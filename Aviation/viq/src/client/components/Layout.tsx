import { Outlet, NavLink, useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard, Plane, MessageSquare, ClipboardList,
  BookOpen, Send, AlertTriangle, Menu, X,
  Shield, Briefcase, Users, Settings, DollarSign, LogOut,
  Sun, Moon
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/authContext';
import { useTheme } from '../lib/theme';
import { preloadReferenceData, getTrips, getServices } from '../lib/dataStore';

const navItems = [
  { path: '/dashboard', label: 'Action Board', icon: LayoutDashboard },
  { path: '/trips', label: 'Trips', icon: Plane },
  { path: '/comms', label: 'Comms', icon: MessageSquare },
  { path: '/audit', label: 'Audit Trail', icon: ClipboardList },
  { path: '/reference', label: 'Reference Data', icon: BookOpen },
  { path: '/composer', label: 'Composer', icon: Send },
];

const adminItems = [
  { path: '/admin', label: 'Admin Dashboard', icon: Shield },
  { path: '/admin/trips', label: 'Manage Trips', icon: Briefcase },
  { path: '/admin/assets', label: 'Assets', icon: Users },
  { path: '/admin/message-templates', label: 'Message Templates', icon: MessageSquare },
  { path: '/admin/billing', label: 'Billing', icon: DollarSign },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
  { path: '/admin/users', label: 'Users', icon: Users },
];

function UrgencyBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <AlertTriangle className="h-3 w-3" />
      {count} urgent
    </span>
  );
}

function NavCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      {count}
    </span>
  );
}

function NavSection({ items, title, enquiryCount, urgentCount, onNavigate }: { items: typeof navItems; title?: string; enquiryCount?: number; urgentCount?: number; onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <div className="space-y-1">
      {title && (
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      )}
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
        return (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={`flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Icon className="mr-3 h-4 w-4" />
            {item.label}
            {item.path === '/dashboard' && <UrgencyBadge count={urgentCount ?? 0} />}
            {item.path === '/admin/trips' && <NavCountBadge count={enquiryCount ?? 0} />}
          </NavLink>
        );
      })}
    </div>
  );
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refDataReady, setRefDataReady] = useState(false);
  const [enquiryCount, setEnquiryCount] = useState(0);
  const [urgentCount, setUrgentCount] = useState(0);
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    preloadReferenceData().finally(() => setRefDataReady(true));
  }, []);

  // Re-fetch the unreviewed-enquiry count and the urgent-services count on
  // every navigation — two cheap fetches, kept in one effect so they share
  // the same refresh trigger. Keeps both sidebar badges from going stale
  // after an admin resolves something elsewhere and navigates back here.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getTrips(), getServices()]).then(([trips, services]) => {
      if (cancelled) return;
      setEnquiryCount(trips.filter((t) => t.Owner === 'Web Enquiry' && t.Status === 'Planning').length);
      setUrgentCount(services.filter((s) => s.Urgency === 'URGENT' || s.Urgency === 'BREACH').length);
    });
    return () => { cancelled = true; };
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  if (!refDataReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      {/* Sidebar toggle — collapsible through tablet width too (not just
          mobile), since a permanently-static 256px sidebar left too little
          room for master-detail content in the 768-1023px tablet band. */}
      <button
        className="fixed left-4 top-4 z-50 rounded-md bg-primary p-2 text-primary-foreground shadow-md lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b px-6">
          <Plane className="mr-2 h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">VIQ</span>
        </div>
        <nav className="space-y-4 p-3">
          <NavSection items={navItems} urgentCount={urgentCount} onNavigate={() => setSidebarOpen(false)} />
          <div className="border-t pt-2" />
          <NavSection
            items={isAdmin ? adminItems : adminItems.filter((item) => !['/admin/billing', '/admin/message-templates', '/admin/settings', '/admin/users'].includes(item.path))}
            title="Admin"
            enquiryCount={enquiryCount}
            onNavigate={() => setSidebarOpen(false)}
          />
        </nav>
        <div className="absolute bottom-0 w-full border-t p-4">
          <div className="mb-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{user?.username ?? 'Signed in'}</p>
            <p>Seed data loaded. All times UTC.</p>
          </div>
          <button
            onClick={toggleTheme}
            className="mb-2 flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      {/* Overlay for mobile + tablet */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
