import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { DashboardLayout } from './DashboardLayout'

/** Platform admins only. This only hides the pages; the admin API enforces access itself. */
export function AdminRoute() {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  // Older saved sessions learn the flag from /auth/me; wait rather than bounce them away.
  if (user.isPlatformAdmin === undefined) {
    return (
      <DashboardLayout>
        <p className="px-8 py-10 text-sm text-neutral-500">Loading…</p>
      </DashboardLayout>
    )
  }
  if (!user.isPlatformAdmin) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
