import axios from 'axios'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { type AuthUser, getMe, loginUser, registerUser } from './authApi'
import { SESSION_ENDED_EVENT, tokenStorage, type SessionEndReason } from './api'
import { saveSessionNotice } from './sessionNotice'

interface AuthContextValue {
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  register: (input: {
    organizationName: string
    firstName: string
    lastName: string
    email: string
    password: string
  }) => Promise<void>
  logout: () => void
  setOrganizationCurrency: (currency: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const USER_KEY = 'artbh_user'

function readStoredUser(): AuthUser | null {
  const stored = localStorage.getItem(USER_KEY)
  if (stored && tokenStorage.getAccess()) {
    const parsed = JSON.parse(stored) as AuthUser
    // Sessions saved before base currency existed have no value; USD is the default until the next login.
    return { ...parsed, organizationCurrency: parsed.organizationCurrency ?? 'USD' }
  }
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser)

  function persist(result: { accessToken: string; refreshToken: string; user: AuthUser }) {
    tokenStorage.set(result.accessToken, result.refreshToken)
    localStorage.setItem(USER_KEY, JSON.stringify(result.user))
    setUser(result.user)
  }

  async function login(email: string, password: string) {
    const result = await loginUser({ email, password })
    persist(result)
  }

  async function register(input: {
    organizationName: string
    firstName: string
    lastName: string
    email: string
    password: string
  }) {
    const result = await registerUser(input)
    persist(result)
  }

  function logout() {
    tokenStorage.clear()
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }

  // The API layer ends the session when it can't be renewed (or the business was suspended).
  useEffect(() => {
    const onEnded = (e: Event) => {
      const reason = (e as CustomEvent<SessionEndReason>).detail
      saveSessionNotice(reason)
      localStorage.removeItem(USER_KEY)
      setUser(null)
    }
    window.addEventListener(SESSION_ENDED_EVENT, onEnded)
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded)
  }, [])

  // Sessions saved before the admin flag existed learn it without logging in again.
  const needsAdminFlag = !!user && user.isPlatformAdmin === undefined
  useEffect(() => {
    if (!needsAdminFlag) return
    getMe()
      .then(({ isPlatformAdmin }) =>
        setUser((current) => {
          if (!current) return current
          const next = { ...current, isPlatformAdmin }
          localStorage.setItem(USER_KEY, JSON.stringify(next))
          return next
        }),
      )
      .catch(() => {})
  }, [needsAdminFlag])

  function setOrganizationCurrency(currency: string) {
    setUser((current) => {
      if (!current) return current
      const next = { ...current, organizationCurrency: currency }
      localStorage.setItem(USER_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, setOrganizationCurrency }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined
    if (Array.isArray(data?.message)) return data.message[0]
    if (typeof data?.message === 'string') return data.message
  }
  return 'Something went wrong. Please try again.'
}
