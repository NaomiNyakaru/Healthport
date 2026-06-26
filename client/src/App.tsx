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

  // Restore session on page load — checks localStorage for existing tokens
  // and fetches /auth/me/ to rebuild the user object
  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
