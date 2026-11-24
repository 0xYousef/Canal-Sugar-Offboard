import { lazy } from 'react'

// Each view is its own chunk, so first load only ships the page you open.
const loaders = {
  dashboard: () => import('./Dashboard'),
  leavers: () => import('./Leavers'),
  detail: () => import('./LeaverDetail'),
  tasks: () => import('./Tasks'),
  reports: () => import('./Reports'),
  settings: () => import('./Settings'),
  guide: () => import('./Guide'),
  profile: () => import('./Profile'),
}
export const Dashboard = lazy(loaders.dashboard)
export const Leavers = lazy(loaders.leavers)
export const LeaverDetail = lazy(loaders.detail)
export const Tasks = lazy(loaders.tasks)
export const Reports = lazy(loaders.reports)
export const Settings = lazy(loaders.settings)
export const Guide = lazy(loaders.guide)
export const Profile = lazy(loaders.profile)

/** Warm the other chunks so clicking a section never waits on the network. */
export const preloadViews = () => { Object.values(loaders).forEach((l) => { void l() }) }
