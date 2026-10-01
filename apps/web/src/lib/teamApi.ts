import { api } from './api'
import type { UserRole } from './authApi'

export interface TeamMember {
  id: string
  firstName: string
  lastName: string
  email: string
  role: UserRole
  joinedAt: string
  emailVerified: boolean
  isYou: boolean
}

export interface PendingInvitation {
  id: string
  email: string
  role: UserRole
  invitedByName: string
  createdAt: string
  expiresAt: string
  expired: boolean
}

export type AssignableRole = Exclude<UserRole, 'OWNER'>

export const ROLE_LABELS: Record<UserRole, string> = { OWNER: 'Owner', MANAGER: 'Manager', STAFF: 'Staff', FINANCE: 'Finance' }

/** What each role can do today, as the server enforces it. */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  OWNER: 'Everything, including business settings and the team.',
  MANAGER: 'Day-to-day work, and can invite people.',
  STAFF: 'Day-to-day work: artists, bookings, clients, quotes, invoices, contracts and the calendar.',
  FINANCE: 'Day-to-day work, plus payment settings and invoice reminders.',
}

export const ASSIGNABLE_ROLES: AssignableRole[] = ['MANAGER', 'STAFF', 'FINANCE']

export async function getTeam(): Promise<{ members: TeamMember[]; invitations: PendingInvitation[] }> {
  const { data } = await api.get('/team')
  return data
}

export async function inviteMember(email: string, role: AssignableRole) {
  const { data } = await api.post('/team/invitations', { email, role })
  return data
}

export async function resendInvitation(id: string) {
  await api.post(`/team/invitations/${id}/resend`)
}

export async function cancelInvitation(id: string) {
  await api.delete(`/team/invitations/${id}`)
}

export async function changeMemberRole(id: string, role: AssignableRole) {
  await api.patch(`/team/members/${id}/role`, { role })
}

export async function removeMember(id: string) {
  await api.delete(`/team/members/${id}`)
}

export async function transferOwnership(userId: string, password: string) {
  await api.post('/team/transfer-ownership', { userId, password })
}
