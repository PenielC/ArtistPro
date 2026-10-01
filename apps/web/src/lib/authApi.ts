import { api } from './api'

export type UserRole = 'OWNER' | 'MANAGER' | 'STAFF' | 'FINANCE'

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  organizationId: string
  organizationName: string
  organizationCurrency: string
  /** False until the user follows the link in their verification email. Sessions saved before it existed: unknown. */
  emailVerified?: boolean
  /** Shows the Platform admin area. The admin API checks the allowlist itself on every call. */
  isPlatformAdmin?: boolean
}

export interface AuthResult {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export async function registerUser(input: {
  organizationName: string
  firstName: string
  lastName: string
  email: string
  password: string
}): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/register', input)
  return data
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/login', input)
  return data
}

/** The signed-in user as the server has them now (role, verification, business details). */
export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me')
  return data
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email })
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post('/auth/reset-password', { token, password })
}

export async function verifyEmail(token: string): Promise<void> {
  await api.post('/auth/verify-email', { token })
}

export async function resendVerification(): Promise<{ sent: boolean }> {
  const { data } = await api.post<{ sent: boolean }>('/auth/resend-verification')
  return data
}

export interface InvitationPreview {
  email: string
  role: UserRole
  organizationName: string
  invitedByName: string
  expiresAt: string
}

export async function getInvitation(token: string): Promise<InvitationPreview> {
  const { data } = await api.get<InvitationPreview>(`/auth/invitations/${encodeURIComponent(token)}`)
  return data
}

export async function acceptInvitation(input: { token: string; firstName: string; lastName: string; password: string }): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>('/auth/accept-invitation', input)
  return data
}

export async function updateOrganizationCurrency(currency: string): Promise<{ id: string; name: string; currency: string }> {
  const { data } = await api.patch('/organization', { currency })
  return data
}
