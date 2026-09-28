import { api } from './api'

export type DocumentKind = 'INVOICE' | 'QUOTE' | 'CONTRACT'
export type EmailStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED'
export type EmailKind = DocumentKind | 'PAYMENT_RECEIPT' | 'PAYMENT_ALERT' | 'INVOICE_REMINDER'

export const EMAIL_STATUSES: Record<EmailStatus, { label: string; className: string }> = {
  PENDING: { label: 'Queued', className: 'bg-amber-500/15 text-amber-300' },
  SENDING: { label: 'Sending', className: 'bg-amber-500/15 text-amber-300' },
  SENT: { label: 'Sent', className: 'bg-emerald-500/15 text-emerald-400' },
  FAILED: { label: 'Failed', className: 'bg-red-500/15 text-red-300' },
}

export const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  INVOICE: 'Invoice',
  QUOTE: 'Quote',
  CONTRACT: 'Contract',
  PAYMENT_RECEIPT: 'Payment receipt',
  PAYMENT_ALERT: 'Payment alert',
  INVOICE_REMINDER: 'Overdue reminder',
}

export interface EmailMessage {
  id: string
  kind: EmailKind
  toEmail: string
  toName: string | null
  subject: string
  bodyText: string
  status: EmailStatus
  attempts: number
  lastError: string | null
  sentAt: string | null
  createdAt: string
  createdBy: { firstName: string; lastName: string } | null
}

export interface ComposeDefaults {
  to: string
  toName: string
  subject: string
  message: string
  marksSent: boolean
}

export interface InboxNotification {
  id: string
  type: 'PAYMENT_RECEIVED' | 'EMAIL_FAILED' | 'REMINDERS_SENT'
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface Inbox {
  items: InboxNotification[]
  unread: number
}

export interface ReminderSettings {
  reminderEnabled: boolean
  reminderDays: number[]
}

const documentFilter = (kind: DocumentKind, id: string) =>
  kind === 'INVOICE' ? { invoiceId: id } : kind === 'QUOTE' ? { quoteId: id } : { contractId: id }

export async function getComposeDefaults(kind: DocumentKind, documentId: string): Promise<ComposeDefaults> {
  return (await api.get<ComposeDefaults>('/notifications/emails/compose', { params: { kind, documentId } })).data
}

export async function sendDocumentEmail(input: { kind: DocumentKind; documentId: string; to: string; subject?: string; message?: string }): Promise<EmailMessage> {
  return (await api.post<EmailMessage>('/notifications/emails', input)).data
}

export async function listDocumentEmails(kind: DocumentKind, documentId: string): Promise<EmailMessage[]> {
  return (await api.get<EmailMessage[]>('/notifications/emails', { params: documentFilter(kind, documentId) })).data
}

export async function retryEmail(id: string): Promise<EmailMessage> {
  return (await api.post<EmailMessage>(`/notifications/emails/${id}/retry`)).data
}

export async function getInbox(): Promise<Inbox> {
  return (await api.get<Inbox>('/notifications/inbox')).data
}

export async function markNotificationRead(id: string): Promise<Inbox> {
  return (await api.post<Inbox>(`/notifications/inbox/${id}/read`)).data
}

export async function markAllNotificationsRead(): Promise<Inbox> {
  return (await api.post<Inbox>('/notifications/inbox/read-all')).data
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  return (await api.get<ReminderSettings>('/notifications/settings')).data
}

export async function saveReminderSettings(input: ReminderSettings): Promise<ReminderSettings> {
  return (await api.put<ReminderSettings>('/notifications/settings', input)).data
}

export async function runRemindersNow(): Promise<{ sent: number; skippedNoEmail: number }> {
  return (await api.post('/notifications/reminders/run')).data
}
