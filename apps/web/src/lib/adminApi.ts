import { api } from './api'
import type { UserRole } from './authApi'
import type { AnnouncementTone } from './platformApi'

export interface CurrencyTotal {
  currency: string
  count: number
  total: number
}

export interface AdminOverview {
  period: { year: number; month: number }
  totals: {
    businesses: number
    activeBusinesses: number
    suspendedBusinesses: number
    users: number
    artists: number
    publishedArtists: number
  }
  month: {
    newBusinesses: number
    newUsers: number
    activeBusinesses: number
    bookingsCreated: number
    invoicesCreated: number
    paymentsRecorded: CurrencyTotal[]
    onlinePayments: CurrencyTotal[]
    aiGenerations: number
    aiCostUsd: number
    emailsSent: number
    emailsFailed: number
    emailsPending: number
  }
  trend: { year: number; month: number; newBusinesses: number; newUsers: number; activeBusinesses: number }[]
}

export type OrganizationStatus = 'all' | 'active' | 'suspended'
export type OrganizationSort = 'newest' | 'oldest' | 'name'

export interface AdminOrganizationRow {
  id: string
  name: string
  currency: string
  createdAt: string
  suspendedAt: string | null
  owner: { name: string; email: string } | null
  counts: { users: number; artists: number; bookings: number; invoices: number }
  aiMonthlyLimit: number
  aiUsedThisMonth: number
  lastActiveAt: string | null
}

export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  pageCount: number
}

export interface AdminOrganizationList extends Paged<AdminOrganizationRow> {
  counts: { all: number; active: number; suspended: number }
}

export type AdminAction =
  | 'ORGANIZATION_SUSPENDED'
  | 'ORGANIZATION_REACTIVATED'
  | 'ORGANIZATION_AI_LIMIT_CHANGED'
  | 'PLATFORM_CONFIG_UPDATED'

export interface AuditEntry {
  id: string
  adminEmail: string
  action: AdminAction
  organizationId: string | null
  organizationName: string | null
  details: Record<string, unknown>
  createdAt: string
}

export interface AdminOrganization {
  id: string
  name: string
  currency: string
  createdAt: string
  suspendedAt: string | null
  suspendedReason: string | null
  aiMonthlyLimit: number
  aiUsedThisMonth: number
  reminderEnabled: boolean
  lastActiveAt: string | null
  counts: {
    users: number
    artists: number
    clients: number
    bookings: number
    quotes: number
    invoices: number
    contracts: number
    calendarEntries: number
  }
  users: { id: string; name: string; email: string; role: UserRole; createdAt: string; lastActiveAt: string | null }[]
  artists: { id: string; name: string; slug: string; isPublished: boolean; epkPublished: boolean }[]
  paymentAccounts: { provider: 'PAYNOW' | 'TEST'; currency: string; createdAt: string }[]
  paymentsRecorded: CurrencyTotal[]
  audit: AuditEntry[]
}

export interface PlatformConfig {
  signupsEnabled: boolean
  defaultAiMonthlyLimit: number
  announcement: string | null
  announcementTone: AnnouncementTone
  updatedByEmail: string | null
  updatedAt: string
}

export const ACTION_LABELS: Record<AdminAction, string> = {
  ORGANIZATION_SUSPENDED: 'Suspended business',
  ORGANIZATION_REACTIVATED: 'Reactivated business',
  ORGANIZATION_AI_LIMIT_CHANGED: 'Changed AI limit',
  PLATFORM_CONFIG_UPDATED: 'Updated platform settings',
}

export async function getAdminOverview(year: number, month: number): Promise<AdminOverview> {
  const { data } = await api.get<AdminOverview>('/admin/overview', { params: { year, month } })
  return data
}

export async function listAdminOrganizations(params: {
  search?: string
  status: OrganizationStatus
  sort: OrganizationSort
  page: number
  pageSize?: number
}): Promise<AdminOrganizationList> {
  const { data } = await api.get<AdminOrganizationList>('/admin/organizations', {
    params: { ...params, search: params.search || undefined },
  })
  return data
}

export async function getAdminOrganization(id: string): Promise<AdminOrganization> {
  const { data } = await api.get<AdminOrganization>(`/admin/organizations/${id}`)
  return data
}

export async function suspendOrganization(id: string, reason: string): Promise<AdminOrganization> {
  const { data } = await api.post<AdminOrganization>(`/admin/organizations/${id}/suspend`, { reason })
  return data
}

export async function reactivateOrganization(id: string): Promise<AdminOrganization> {
  const { data } = await api.post<AdminOrganization>(`/admin/organizations/${id}/reactivate`)
  return data
}

export async function setOrganizationAiLimit(id: string, aiMonthlyLimit: number): Promise<AdminOrganization> {
  const { data } = await api.patch<AdminOrganization>(`/admin/organizations/${id}/ai-limit`, { aiMonthlyLimit })
  return data
}

export async function getPlatformConfig(): Promise<PlatformConfig> {
  const { data } = await api.get<PlatformConfig>('/admin/config')
  return data
}

export async function updatePlatformConfig(
  changes: Partial<Pick<PlatformConfig, 'signupsEnabled' | 'defaultAiMonthlyLimit' | 'announcement' | 'announcementTone'>>,
): Promise<PlatformConfig> {
  const { data } = await api.patch<PlatformConfig>('/admin/config', changes)
  return data
}

export async function listAudit(params: { page: number; organizationId?: string; action?: AdminAction }): Promise<Paged<AuditEntry>> {
  const { data } = await api.get<Paged<AuditEntry>>('/admin/audit', { params })
  return data
}

/** "3 days ago" style, for activity columns. */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never'
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function monthLabel(year: number, month: number, style: 'long' | 'short' = 'long') {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  })
}

const CONFIG_LABELS: Record<string, string> = {
  signupsEnabled: 'Sign-ups',
  defaultAiMonthlyLimit: 'Default AI limit',
  announcement: 'Announcement',
  announcementTone: 'Announcement style',
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'none'
  if (typeof v === 'boolean') return v ? 'open' : 'paused'
  if (typeof v === 'string') return v.length > 60 ? `"${v.slice(0, 57)}…"` : `"${v}"`
  return String(v)
}

/** One readable line for an audit entry's details. */
export function describeAudit(entry: AuditEntry): string {
  const d = entry.details as Record<string, unknown>
  switch (entry.action) {
    case 'ORGANIZATION_SUSPENDED':
      return `Reason: ${String(d.reason ?? '')}`
    case 'ORGANIZATION_REACTIVATED':
      return d.previousReason ? `Had been suspended for: ${String(d.previousReason)}` : ''
    case 'ORGANIZATION_AI_LIMIT_CHANGED':
      return `AI limit ${String(d.from)} → ${String(d.to)} a month`
    case 'PLATFORM_CONFIG_UPDATED': {
      const changes = (d.changes ?? {}) as Record<string, { from: unknown; to: unknown }>
      return Object.entries(changes)
        .map(([k, c]) =>
          k === 'announcementTone'
            ? `${CONFIG_LABELS[k]}: ${String(c.from).toLowerCase()} → ${String(c.to).toLowerCase()}`
            : `${CONFIG_LABELS[k] ?? k}: ${show(c.from)} → ${show(c.to)}`,
        )
        .join(' · ')
    }
  }
}

export const adminInputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20'
