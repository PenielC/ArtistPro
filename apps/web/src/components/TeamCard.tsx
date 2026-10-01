import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, MailPlus, RotateCw, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { extractErrorMessage, useAuth } from '../lib/AuthContext'
import {
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type AssignableRole,
  type TeamMember,
  cancelInvitation,
  changeMemberRole,
  getTeam,
  inviteMember,
  removeMember,
  resendInvitation,
  transferOwnership,
} from '../lib/teamApi'
import { PasswordField } from './PasswordField'
import { Button } from './ui/button'

const field =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-brand-orange focus:outline-none'

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-brand-ink p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignableRole>('STAFF')
  const invite = useMutation({
    mutationFn: () => inviteMember(email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      onClose()
    },
  })
  return (
    <Modal title="Invite a team member" onClose={onClose}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          invite.mutate()
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label htmlFor="inviteEmail" className="mb-1 block text-sm font-medium text-neutral-300">
            Their email address
          </label>
          <input id="inviteEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="name@example.com" />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-neutral-300">Role</legend>
          <div className="flex flex-col gap-2">
            {ASSIGNABLE_ROLES.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 ${role === r ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 hover:bg-white/5'}`}
              >
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1 accent-[#fa5813]" />
                <span>
                  <span className="block text-sm font-medium text-white">{ROLE_LABELS[r]}</span>
                  <span className="block text-xs text-neutral-400">{ROLE_DESCRIPTIONS[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-neutral-500">They&apos;ll get an email with a link that works for 7 days.</p>
        {invite.isError && <p className="text-sm text-red-400">{extractErrorMessage(invite.error)}</p>}
        <Button type="submit" disabled={invite.isPending} className="h-10 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
          {invite.isPending ? 'Sending…' : 'Send invitation'}
        </Button>
      </form>
    </Modal>
  )
}

function TransferModal({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const { refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const transfer = useMutation({
    mutationFn: () => transferOwnership(member.id, password),
    onSuccess: async () => {
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: ['team'] })
      onClose()
    },
  })
  return (
    <Modal title="Transfer ownership" onClose={onClose}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          transfer.mutate()
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-sm text-neutral-300">
          <span className="font-medium text-white">
            {member.firstName} {member.lastName}
          </span>{' '}
          will become the Owner of this business, with full control of its settings and team. You&apos;ll become a Manager. Only
          the new owner can undo this.
        </p>
        <div>
          <label htmlFor="transferPassword" className="mb-1 block text-sm font-medium text-neutral-300">
            Your password, to confirm
          </label>
          <PasswordField id="transferPassword" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {transfer.isError && <p className="text-sm text-red-400">{extractErrorMessage(transfer.error)}</p>}
        <Button type="submit" disabled={transfer.isPending} className="h-10 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
          {transfer.isPending ? 'Transferring…' : `Make ${member.firstName} the owner`}
        </Button>
      </form>
    </Modal>
  )
}

/** Settings → Team: members, their roles, and pending invitations. */
export function TeamCard() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const team = useQuery({ queryKey: ['team'], queryFn: getTeam })
  const [inviting, setInviting] = useState(false)
  const [transferTo, setTransferTo] = useState<TeamMember | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const isOwner = user?.role === 'OWNER'
  const canInvite = isOwner || user?.role === 'MANAGER'
  const done = (text: string) => () => {
    setMessage({ kind: 'ok', text })
    queryClient.invalidateQueries({ queryKey: ['team'] })
  }
  const failed = (err: unknown) => setMessage({ kind: 'error', text: extractErrorMessage(err) })

  const roleChange = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AssignableRole }) => changeMemberRole(id, role),
    onSuccess: done('Role updated.'),
    onError: failed,
  })
  const removal = useMutation({ mutationFn: removeMember, onSuccess: done('Member removed. They have been signed out.'), onError: failed })
  const resend = useMutation({ mutationFn: resendInvitation, onSuccess: done('Invitation sent again with a new link.'), onError: failed })
  const cancel = useMutation({ mutationFn: cancelInvitation, onSuccess: done('Invitation cancelled.'), onError: failed })

  const members = team.data?.members ?? []
  const invitations = team.data?.invitations ?? []

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6" data-testid="team-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">Team</h2>
          <p className="mt-1 text-sm text-neutral-400">The people who can sign in to {user?.organizationName}.</p>
        </div>
        {canInvite && (
          <Button onClick={() => setInviting(true)} className="shrink-0 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            <MailPlus size={16} /> Invite
          </Button>
        )}
      </div>

      {team.isLoading ? (
        <p className="mt-4 text-sm text-neutral-500">Loading…</p>
      ) : team.isError ? (
        <p className="mt-4 text-sm text-red-300">{extractErrorMessage(team.error)}</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center" data-testid="team-member">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {m.firstName} {m.lastName} {m.isYou && <span className="text-neutral-500">(you)</span>}
                </p>
                <p className="truncate text-xs text-neutral-400">
                  {m.email}
                  {!m.emailVerified && <span className="ml-2 text-amber-300">email not confirmed</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && !m.isYou && m.role !== 'OWNER' ? (
                  <select
                    aria-label={`Role for ${m.firstName}`}
                    value={m.role}
                    disabled={roleChange.isPending}
                    onChange={(e) => roleChange.mutate({ id: m.id, role: e.target.value as AssignableRole })}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-brand-orange focus:outline-none"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r} className="bg-brand-ink">
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-neutral-200">
                    {m.role === 'OWNER' && <Crown size={12} className="text-amber-300" />}
                    {ROLE_LABELS[m.role]}
                  </span>
                )}
                {isOwner && !m.isYou && (
                  <>
                    <button
                      onClick={() => setTransferTo(m)}
                      className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-white/5 hover:text-white"
                      title="Make this person the owner"
                    >
                      Make owner
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove ${m.firstName} ${m.lastName}? They'll be signed out at once and can't sign in again. Their past work stays.`)) {
                          removal.mutate(m.id)
                        }
                      }}
                      aria-label={`Remove ${m.firstName}`}
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canInvite && invitations.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-neutral-200">Pending invitations</h3>
          <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center" data-testid="team-invite">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{i.email}</p>
                  <p className="text-xs text-neutral-400">
                    {ROLE_LABELS[i.role]} · invited by {i.invitedByName} ·{' '}
                    {i.expired ? <span className="text-amber-300">link expired</span> : `link works until ${shortDate(i.expiresAt)}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => resend.mutate(i.id)}
                    disabled={resend.isPending}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-white/5 hover:text-white"
                  >
                    <RotateCw size={13} /> Resend
                  </button>
                  <button
                    onClick={() => cancel.mutate(i.id)}
                    disabled={cancel.isPending}
                    className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {message && (
        <p className={`mt-3 text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role="status">
          {message.text}
        </p>
      )}
      {!canInvite && <p className="mt-3 text-xs text-neutral-500">Ask the owner or a manager to invite someone.</p>}

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {transferTo && <TransferModal member={transferTo} onClose={() => setTransferTo(null)} />}
    </div>
  )
}
