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

export async function getMe(): Promise<{ isPlatformAdmin: boolean }> {
  const { data } = await api.get<{ isPlatformAdmin: boolean }>('/auth/me')
  return data
}

export async function updateOrganizationCurrency(currency: string): Promise<{ id: string; name: string; currency: string }> {
  const { data } = await api.patch('/organization', { currency })
  return data
}
