import { Suspense, lazy } from 'react'
import { useAuth } from './lib/auth'
import Login from './views/Login'

// The portal (all views, tables, charts) is only downloaded after sign-in.
const Portal = lazy(() => import('./Portal'))

export default function App() {
  const { user } = useAuth()
  if (!user) return <Login />
  return <Suspense fallback={null}><Portal user={user} /></Suspense>
}
