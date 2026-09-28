import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Mail, Pencil, Phone, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { ClientFormModal } from '../components/ClientFormModal'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button } from '../components/ui/button'
import { deleteClient, listClients, type Client } from '../lib/clientsApi'

export function ClientsPage() {
  const [modalClient, setModalClient] = useState<Client | 'new' | null>(null)
  const queryClient = useQueryClient()

  const { data: clients, isLoading } = useQuery({ queryKey: ['clients'], queryFn: listClients })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
    },
  })

  function handleDelete(client: Client) {
    if (window.confirm(`Delete ${client.name}? Their bookings will be kept.`)) {
      deleteMutation.mutate(client.id)
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Clients</h1>
            <p className="mt-1 text-sm text-neutral-400">Everyone you work with, in one place.</p>
          </div>
          <Button onClick={() => setModalClient('new')} className="gap-2 rounded-lg bg-brand-orange text-white hover:bg-brand-orange/90">
            <Plus size={16} />
            New Client
          </Button>
        </div>

        <div className="mt-8">
          {isLoading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : !clients || clients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <Users size={28} className="mx-auto text-neutral-600" />
              <p className="mt-4 text-sm font-medium text-white">No clients yet</p>
              <p className="mt-1 text-sm text-neutral-500">Add your first client to link them to bookings.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {clients.map((client) => (
                <div key={client.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white">{client.name}</p>
                      {client.company && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                          <Building2 size={12} />
                          {client.company}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setModalClient(client)}
                        className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white"
                        aria-label="Edit client"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(client)}
                        className="rounded p-1.5 text-neutral-500 hover:bg-white/5 hover:text-red-400"
                        aria-label="Delete client"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                    {client.email && (
                      <span className="flex items-center gap-1">
                        <Mail size={12} />
                        {client.email}
                      </span>
                    )}
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} />
                        {client.phone}
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-xs text-brand-orange-light">
                    {client._count?.bookings ?? 0} {client._count?.bookings === 1 ? 'booking' : 'bookings'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalClient && (
        <ClientFormModal client={modalClient === 'new' ? undefined : modalClient} onClose={() => setModalClient(null)} />
      )}
    </DashboardLayout>
  )
}
