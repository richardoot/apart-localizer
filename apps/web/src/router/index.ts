import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/DashboardPage.vue'),
    meta: { title: 'Synthèse', requiresAuth: true },
  },
  {
    path: '/annonces',
    component: () => import('@/views/ListingsPage.vue'),
    meta: { title: 'Annonces', requiresAuth: true },
    children: [
      { path: '', name: 'listings', component: { render: () => null } },
      {
        path: 'nouvelle',
        name: 'listing-new',
        component: { render: () => null },
        meta: { title: 'Nouvelle annonce', requiresAuth: true },
      },
      {
        path: ':id',
        name: 'listing',
        component: { render: () => null },
        meta: { title: 'Annonce', requiresAuth: true },
      },
    ],
  },
  {
    path: '/comparer',
    name: 'compare',
    component: () => import('@/views/ComparePage.vue'),
    meta: { title: 'Comparer', requiresAuth: true },
  },
  {
    path: '/criteres',
    name: 'criteria',
    component: () => import('@/views/CriteriaPage.vue'),
    meta: { title: 'Critères', requiresAuth: true },
  },
  {
    path: '/hypotheses',
    name: 'assumptions',
    component: () => import('@/views/AssumptionsPage.vue'),
    meta: { title: 'Hypothèses', requiresAuth: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginPage.vue'),
    meta: { title: 'Connexion', guestOnly: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

router.beforeEach(async to => {
  const auth = useAuthStore()

  // Wait for the session to be known before deciding.
  if (auth.loading) {
    await new Promise<void>(resolve => {
      const stop = auth.$subscribe(() => {
        if (!auth.loading) {
          stop()
          resolve()
        }
      })
    })
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  if (requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'home' }
  }
  return true
})

router.afterEach(to => {
  const title = [...to.matched].reverse().find(r => r.meta.title)?.meta.title
  document.title = title ? `${title} — apart-localizer` : 'apart-localizer'
})

export default router

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    title?: string
  }
}
