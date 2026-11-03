import { createRouter, createWebHistory } from 'vue-router'
import type { LocationQuery, RouteRecordRaw } from 'vue-router'
import { parseSharedListing } from '@apart/contracts'
import { useAuthStore } from '@/stores/auth'

const first = (value: LocationQuery[string] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null

/**
 * La cible de partage de la PWA (`share_target`, GET) : ce que la feuille de
 * partage du téléphone transmet (titre, texte, lien) ouvre « Nouvelle
 * annonce » pré-remplie. Rien n'est téléchargé depuis le portail.
 */
export function sharedListingQuery(
  query: LocationQuery
): Record<string, string> {
  const shared = parseSharedListing({
    title: first(query.title),
    text: first(query.text),
    url: first(query.url),
  })
  return {
    partage: '1',
    ...(shared.url ? { url: shared.url } : {}),
    ...(shared.text ? { texte: shared.text.slice(0, 20_000) } : {}),
    ...(shared.title ? { titre: shared.title.slice(0, 300) } : {}),
  }
}

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
    path: '/activite',
    name: 'activity',
    component: () => import('@/views/ActivityPage.vue'),
    meta: { title: 'Activité', requiresAuth: true },
  },
  {
    path: '/notifications',
    name: 'notifications',
    component: () => import('@/views/NotificationsPage.vue'),
    meta: { title: 'Notifications', requiresAuth: true },
  },
  {
    path: '/partager',
    name: 'share',
    meta: { title: 'Partager une annonce', requiresAuth: true },
    redirect: to => ({
      name: 'listing-new',
      query: sharedListingQuery(to.query),
    }),
  },
  {
    // Le consentement du serveur OAuth 2.1 de Supabase (connecteur MCP) :
    // GoTrue redirige ici avec `authorization_id`. Connexion exigée ; après
    // la connexion, la page revient ici avec la même requête.
    path: '/oauth/consent',
    name: 'oauth-consent',
    component: () => import('@/views/OAuthConsentPage.vue'),
    meta: { title: 'Autorisation', requiresAuth: true, bare: true },
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
    /** Page sans l'en-tête de l'application (consentement OAuth : une décision, pas de navigation). */
    bare?: boolean
  }
}
