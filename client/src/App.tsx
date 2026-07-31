import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './router'
import { useAuthStore } from './store/authStore'

// TanStack Query client — caches API responses so we don't
// re-fetch data we already have
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:   1000 * 60 * 5,   // data is fresh for 5 minutes
      retry:       1,                // retry failed requests once
      refetchOnWindowFocus: false,   // don't re-fetch when tab regains focus
    },
  },
})

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)
  const isLoading  = useAuthStore((s) => s.isLoading)

  // Restore session on page load — checks localStorage for existing tokens
  // and fetches /auth/me/ to rebuild the user object
  useEffect(() => {
    initialize()
  }, [initialize])

  // Don't mount any page until we know who's logged in. Without this,
  // a hard refresh renders protected pages before `initialize()` has
  // populated the user object — any query that depends on user.id fires
  // with a bad/missing param, 404s, and React Query caches that failure
  // under the query key. Navigating back and forward "fixes" it only
  // because the user object is already loaded by then. Waiting here
  // closes that race entirely.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
