import { useEffect } from 'react'
import { Routes, Route } from 'react-router'
import { applyBranding } from './lib/dataStore'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import TripsPage from './pages/TripsPage'
import TripDetail from './pages/TripDetail'
import CommsPage from './pages/CommsPage'
import AuditPage from './pages/AuditPage'
import ReferencePage from './pages/ReferencePage'
import ComposerPage from './pages/ComposerPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import VendorCapabilityForm from './pages/VendorCapabilityForm'
import RequireAuth from './components/RequireAuth'
import RequireRole from './components/RequireRole'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminTrips from './pages/admin/AdminTrips'
import AdminAssets from './pages/admin/AdminAssets'
import MessageTemplatesPage from './pages/admin/MessageTemplatesPage'
import VendorCapabilityQueue from './pages/admin/VendorCapabilityQueue'
import PersonDetail from './pages/admin/PersonDetail'
import AdminSettings from './pages/admin/AdminSettings'
import NewTripWizard from './pages/admin/NewTripWizard'
import BillingPage from './pages/admin/BillingPage'
import UsersPage from './pages/admin/UsersPage'

export default function App() {
  // Runs once regardless of route/auth state — the public landing and
  // login pages need branding applied before any login happens.
  useEffect(() => { applyBranding(); }, [])

  return (
    <Routes>
      {/* Public landing page — no sidebar */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/vendor-capability/:token" element={<VendorCapabilityForm />} />

      {/* Internal app — with sidebar layout, requires auth */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:tripId" element={<TripDetail />} />
        <Route path="/comms" element={<CommsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/reference" element={<ReferencePage />} />
        <Route path="/composer" element={<ComposerPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/trips" element={<AdminTrips />} />
        <Route path="/admin/trips/new" element={<NewTripWizard />} />
        <Route path="/admin/billing" element={<RequireRole role="Admin"><BillingPage /></RequireRole>} />
        <Route path="/admin/assets" element={<AdminAssets />} />
        <Route path="/admin/message-templates" element={<RequireRole role="Admin"><MessageTemplatesPage /></RequireRole>} />
        <Route path="/admin/vendor-capability" element={<RequireRole role="Admin"><VendorCapabilityQueue /></RequireRole>} />
        <Route path="/admin/persons/:personId" element={<PersonDetail />} />
        <Route path="/admin/settings" element={<RequireRole role="Admin"><AdminSettings /></RequireRole>} />
        <Route path="/admin/users" element={<RequireRole role="Admin"><UsersPage /></RequireRole>} />
      </Route>
    </Routes>
  )
}
