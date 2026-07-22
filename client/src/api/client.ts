import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
})

/**
 * Resolves a media/avatar URL returned by the backend into something the
 * browser can actually fetch.
 *
 * Django's MEDIA_URL is configured as the relative path '/media/', so
 * User.get_avatar_url() returns paths like '/media/avatars/xyz.jpg' rather
 * than a full URL. That's fine when the frontend is served from the same
 * origin as Django, but in dev (Vite on :5173, Django on :8000) the browser
 * resolves a relative '/media/...' path against the *frontend's* origin,
 * not Django's — which 404s and shows a broken image icon.
 *
 * Pass any avatar/attachment URL through this before rendering.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`
}

// ─── Token storage ────────────────────────────────────────────────────────────

const TOKEN_KEY   = 'hp_access'
const REFRESH_KEY = 'hp_refresh'

export const tokenStorage = {
  getAccess:   () => localStorage.getItem(TOKEN_KEY),
  getRefresh:  () => localStorage.getItem(REFRESH_KEY),
  setAccess:   (token: string) => localStorage.setItem(TOKEN_KEY, token),
  setRefresh:  (token: string) => localStorage.setItem(REFRESH_KEY, token),
  setTokens:   (access: string, refresh: string) => {
    localStorage.setItem(TOKEN_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  clearTokens: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

// ─── Request interceptor ──────────────────────────────────────────────────────

apiClient.interceptors.request.use(
  (config) => {
    const token = tokenStorage.getAccess()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ─── Response interceptor — auto refresh ─────────────────────────────────────

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject:  (error: unknown) => void
}> = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else if (token) resolve(token)
  })
  failedQueue = []
}

apiClient.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    if (error.response?.status === 401 && !originalRequest?._retry) {
      const refreshToken = tokenStorage.getRefresh()

      if (!refreshToken) {
        tokenStorage.clearTokens()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`
          }
          return apiClient(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post(
          `${BASE_URL}/api/v1/auth/token/refresh/`,
          { refresh: refreshToken },
        )
        const newToken = data.access
        tokenStorage.setAccess(newToken)
        processQueue(null, newToken)
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }
        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        tokenStorage.clearTokens()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

// ─── WebSocket helper ─────────────────────────────────────────────────────────

export const createWebSocket = (roomId: string): WebSocket => {
  const token  = tokenStorage.getAccess()
  const wsBase = BASE_URL.replace('http', 'ws')
  return new WebSocket(`${wsBase}/ws/chat/${roomId}/?token=${token}`)
}