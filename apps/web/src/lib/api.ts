import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  headers: {
    'Content-Type': 'application/json',
  },
})

const ACCESS_TOKEN_KEY = 'artbh_access_token'
const REFRESH_TOKEN_KEY = 'artbh_refresh_token'

// Carry sessions saved under the app's old name over to the new keys, so nobody is logged out by the rename.
for (const suffix of ['access_token', 'refresh_token', 'user']) {
  try {
    const legacy = `artistbusinesscentre_${suffix}`
    const value = localStorage.getItem(legacy)
    if (value !== null) {
      if (localStorage.getItem(`artbh_${suffix}`) === null) localStorage.setItem(`artbh_${suffix}`, value)
      localStorage.removeItem(legacy)
    }
  } catch {
    // Storage unavailable (private mode etc.): nothing to migrate.
  }
}

export const tokenStorage = {
  getAccess: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  set: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefresh()
  if (!refreshToken) return null

  const response = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
  const { accessToken, refreshToken: newRefreshToken } = response.data
  tokenStorage.set(accessToken, newRefreshToken)
  return accessToken
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null
        })
        const newAccessToken = await refreshPromise
        if (newAccessToken) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
          return api(originalRequest)
        }
      } catch {
        tokenStorage.clear()
      }
    }
    return Promise.reject(error)
  },
)
