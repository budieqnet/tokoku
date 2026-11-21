import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { guest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Register.vue'),
    meta: { guest: true }
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue') },
      { path: 'customers', name: 'Customers', component: () => import('@/views/Customers.vue') },
      { path: 'customers/new', name: 'CustomerCreate', component: () => import('@/views/CustomerForm.vue') },
      { path: 'customers/:id/edit', name: 'CustomerEdit', component: () => import('@/views/CustomerForm.vue') },
      { path: 'suppliers', name: 'Suppliers', component: () => import('@/views/Suppliers.vue') },
      { path: 'suppliers/new', name: 'SupplierCreate', component: () => import('@/views/SupplierForm.vue') },
      { path: 'suppliers/:id/edit', name: 'SupplierEdit', component: () => import('@/views/SupplierForm.vue') },
      { path: 'partners', name: 'Partners', component: () => import('@/views/Partners.vue') },
      { path: 'partners/new', name: 'PartnerCreate', component: () => import('@/views/PartnerForm.vue') },
      { path: 'partners/:id/edit', name: 'PartnerEdit', component: () => import('@/views/PartnerForm.vue') },
      { path: 'products', name: 'Products', component: () => import('@/views/Products.vue') },
      { path: 'products/new', name: 'ProductCreate', component: () => import('@/views/ProductForm.vue') },
      { path: 'products/:id/edit', name: 'ProductEdit', component: () => import('@/views/ProductForm.vue') },
      { path: 'purchases', name: 'Purchases', component: () => import('@/views/Purchases.vue') },
      { path: 'sales', name: 'Sales', component: () => import('@/views/Sales.vue') },
      { path: 'packages', name: 'Packages', component: () => import('@/views/Packages.vue') },
      { path: 'packages/new', name: 'PackageCreate', component: () => import('@/views/PackageForm.vue') },
      { path: 'packages/:id/edit', name: 'PackageEdit', component: () => import('@/views/PackageForm.vue') },
      { path: 'finance', name: 'Finance', component: () => import('@/views/Finance.vue') },
      { path: 'operational-costs', name: 'OperationalCosts', component: () => import('@/views/OperationalCosts.vue') },
      { path: 'profile', name: 'Profile', component: () => import('@/views/Profile.vue') },
      { path: 'users', name: 'Users', component: () => import('@/views/Users.vue'), meta: { requiresAdmin: true } },
      { path: 'users/new', name: 'UserCreate', component: () => import('@/views/UserForm.vue'), meta: { requiresAdmin: true } },
      { path: 'users/:id/edit', name: 'UserEdit', component: () => import('@/views/UserForm.vue'), meta: { requiresAdmin: true } },
    ]
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    if (authStore.accessToken) {
      await authStore.fetchMe()
    }
    if (!authStore.isAuthenticated) {
      return next({ name: 'Login', query: { redirect: to.fullPath } })
    }
  }

  if (to.meta.guest && authStore.isAuthenticated) {
    return next({ name: 'Dashboard' })
  }

  if (to.meta.requiresAdmin && authStore.user?.role !== 'admin') {
    ElMessage.error('Akses ditolak: hanya Admin')
    return next({ name: 'Dashboard' })
  }

  next()
})

export default router
