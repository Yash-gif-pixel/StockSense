import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { FullPageLoader } from '@/components/FullPageStatus'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth } from '@/components/layout/RequireAuth'
import { RouteErrorPage } from '@/components/RouteErrorPage'
import { DELIVERY, INTERNAL, RECEIPT, type OperationTypeConfig } from '@/features/operations/config'

// Every page is its own chunk (route-level code splitting); the shell and auth gate stay in the main bundle.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K): RouteObject['lazy'] =>
  () => load().then((m) => ({ Component: m[name] }))

const operationList = (config: OperationTypeConfig): RouteObject['lazy'] => () =>
  import('@/pages/operations/OperationListPage').then(({ OperationListPage }) => ({ Component: () => <OperationListPage config={config} /> }))

const operationForm = (config: OperationTypeConfig): RouteObject['lazy'] => () =>
  import('@/pages/operations/OperationFormPage').then(({ OperationFormPage }) => ({ Component: () => <OperationFormPage config={config} /> }))

export const router = createBrowserRouter([
  {
    // Shown while the first page's chunk downloads, and for errors anywhere below.
    hydrateFallbackElement: <FullPageLoader />,
    errorElement: <RouteErrorPage />,
    children: [
      // Public pages: the landing at / (signed-in users are sent on to /dashboard) and auth
      { path: '/', lazy: page(() => import('@/pages/LandingPage'), 'LandingPage') },
      { path: '/login', lazy: page(() => import('@/pages/auth/LoginPage'), 'LoginPage') },
      { path: '/signup', lazy: page(() => import('@/pages/auth/SignupPage'), 'SignupPage') },
      { path: '/forgot-password', lazy: page(() => import('@/pages/auth/ForgotPasswordPage'), 'ForgotPasswordPage') },
      { path: '/reset-password', lazy: page(() => import('@/pages/auth/ResetPasswordPage'), 'ResetPasswordPage') },

      // Logged-in pages: GET /api/auth/me gate + top-nav shell
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/dashboard', lazy: page(() => import('@/pages/DashboardPage'), 'DashboardPage') },
              { path: '/operations', element: <Navigate to="/operations/receipts" replace /> },
              { path: '/operations/receipts', lazy: operationList(RECEIPT) },
              { path: '/operations/receipts/new', lazy: operationForm(RECEIPT) },
              { path: '/operations/receipts/:id', lazy: operationForm(RECEIPT) },
              { path: '/operations/deliveries', lazy: operationList(DELIVERY) },
              { path: '/operations/deliveries/new', lazy: operationForm(DELIVERY) },
              { path: '/operations/deliveries/:id', lazy: operationForm(DELIVERY) },
              { path: '/operations/internal', lazy: operationList(INTERNAL) },
              { path: '/operations/internal/new', lazy: operationForm(INTERNAL) },
              { path: '/operations/internal/:id', lazy: operationForm(INTERNAL) },
              { path: '/operations/adjustments', lazy: page(() => import('@/pages/operations/AdjustmentsPage'), 'AdjustmentsPage') },
              { path: '/products', lazy: page(() => import('@/pages/ProductsPage'), 'ProductsPage') },
              { path: '/moves', lazy: page(() => import('@/pages/MovesPage'), 'MovesPage') },
              { path: '/settings', element: <Navigate to="/settings/warehouses" replace /> },
              { path: '/settings/warehouses', lazy: page(() => import('@/pages/settings/WarehousesPage'), 'WarehousesPage') },
              { path: '/settings/locations', lazy: page(() => import('@/pages/settings/LocationsPage'), 'LocationsPage') },
              { path: '/profile', lazy: page(() => import('@/pages/ProfilePage'), 'ProfilePage') },
              { path: '*', lazy: page(() => import('@/pages/NotFoundPage'), 'NotFoundPage') },
            ],
          },
        ],
      },
    ],
  },
])
