import { api } from './api'

export interface Client {
  id: string
  organizationId: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  _count?: { bookings: number }
}

export interface ClientInput {
  name: string
  email?: string
  phone?: string
  company?: string
  notes?: string
}

export async function listClients(): Promise<Client[]> {
  const { data } = await api.get<Client[]>('/clients')
  return data
}

export async function createClient(input: ClientInput): Promise<Client> {
  const { data } = await api.post<Client>('/clients', input)
  return data
}

export async function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  const { data } = await api.patch<Client>(`/clients/${id}`, input)
  return data
}

export async function deleteClient(id: string): Promise<void> {
  await api.delete(`/clients/${id}`)
}
