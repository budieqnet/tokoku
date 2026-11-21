<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const authStore = useAuthStore()

const isAdmin = computed(() => authStore.user?.role === 'admin')

// Admin stats
const adminStats = ref({
  customers: 0,
  suppliers: 0,
  totalValue: 0,
})

// User stats
const userStats = ref({
  totalProducts: 0,
  totalStock: 0,
  topSellingProduct: null as any,
  totalSalesValue: 0,
})

const lowStockProducts = ref<any[]>([])
const recentProducts = ref<any[]>([])

const fetchAdminDashboard = async () => {
  try {
    const [customersRes, suppliersRes] = await Promise.all([
      api.get('/customers?limit=1'),
      api.get('/suppliers?limit=1'),
    ])

    adminStats.value.customers = customersRes.data.pagination?.total || 0
    adminStats.value.suppliers = suppliersRes.data.pagination?.total || 0
    adminStats.value.totalValue = 0
  } catch (error) {
    console.error('Failed to fetch admin dashboard:', error)
  }
}

const fetchUserDashboard = async () => {
  try {
    const [productsRes, salesRes] = await Promise.all([
      api.get('/products?limit=100'),
      api.get('/sales?limit=100'),
    ])

    const products = productsRes.data.data || []
    const sales = salesRes.data.data || []

    // Total products
    userStats.value.totalProducts = products.length

    // Total stock
    userStats.value.totalStock = products.reduce((sum: number, p: any) => 
      sum + (Number(p.stock) || 0), 0
    )

    // Low stock (stock <= 5)
    lowStockProducts.value = products
      .filter((p: any) => (Number(p.stock) || 0) <= 5)
      .slice(0, 10)

    // Recent products
    recentProducts.value = products.slice(-5).reverse()

    // Top selling product from sales
    const productSales: Record<string, { qty: number; value: number; name: string }> = {}
    sales.forEach((sale: any) => {
      const key = sale.product_id || sale.product_name
      if (!productSales[key]) {
        productSales[key] = { qty: 0, value: 0, name: sale.product_name }
      }
      productSales[key].qty += Number(sale.qty) || 0
      productSales[key].value += Number(sale.subtotal) || 0
    })

    const topSelling = Object.entries(productSales)
      .sort((a, b) => b[1].qty - a[1].qty)[0]
    
    if (topSelling) {
      userStats.value.topSellingProduct = {
        name: topSelling[1].name,
        qty: topSelling[1].qty,
        value: topSelling[1].value,
      }
    }

    // Total sales value
    userStats.value.totalSalesValue = sales.reduce((sum: number, s: any) => 
      sum + (Number(s.subtotal) || 0), 0
    )
  } catch (error) {
    console.error('Failed to fetch user dashboard:', error)
  }
}

const fetchDashboard = async () => {
  if (isAdmin.value) {
    await fetchAdminDashboard()
  } else {
    await fetchUserDashboard()
  }
}

onMounted(() => {
  fetchDashboard()
})

const formatCurrency = (num: number) => {
  return 'Rp ' + Number(num).toLocaleString('id-ID')
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
    </div>

    <!-- Admin Dashboard -->
    <div v-if="isAdmin">
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card p-6">
          <div class="flex items-center">
            <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <svg class="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500 dark:text-gray-400">Pelanggan</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ adminStats.customers }}</p>
            </div>
          </div>
        </div>

        <div class="card p-6">
          <div class="flex items-center">
            <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <svg class="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500 dark:text-gray-400">Pemasok</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ adminStats.suppliers }}</p>
            </div>
          </div>
        </div>

        <div class="card p-6">
          <div class="flex items-center">
            <div class="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <svg class="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Nilai</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(adminStats.totalValue) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- User Dashboard -->
    <div v-else>
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card p-6">
          <div class="flex items-center">
            <div class="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <svg class="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Produk</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ userStats.totalProducts }}</p>
            </div>
          </div>
        </div>

        <div class="card p-6">
          <div class="flex items-center">
            <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <svg class="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Stok</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ userStats.totalStock }}</p>
            </div>
          </div>
        </div>

        <div class="card p-6">
          <div class="flex items-center">
            <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <svg class="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500 dark:text-gray-400">Produk Paling Laku</p>
              <p class="text-xl font-bold text-gray-900 dark:text-white">{{ userStats.topSellingProduct?.name || '-' }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ userStats.topSellingProduct?.qty || 0 }} terjual</p>
            </div>
          </div>
        </div>

        <div class="card p-6">
          <div class="flex items-center">
            <div class="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <svg class="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-4">
              <p class="text-sm text-gray-500 dark:text-gray-400">Total Penjualan</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(userStats.totalSalesValue) }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Low Stock & Recent Products -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Low Stock -->
        <div class="card">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Stok Rendah (&le;5)</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="table-light">
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Produk</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">SKU</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stok</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Pemasok</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="p in lowStockProducts" :key="p.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ p.name }}</td>
                  <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{{ p.sku || '-' }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      {{ p.stock }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{{ p.supplier_name || '-' }}</td>
                </tr>
                <tr v-if="lowStockProducts.length === 0">
                  <td colspan="4" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">Tidak ada produk stok rendah</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recent Products -->
        <div class="card">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Produk Terbaru</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="table-light">
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Produk</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Harga</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stok</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr v-for="p in recentProducts" :key="p.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td class="px-4 py-3 text-sm text-gray-900 dark:text-white">{{ p.name }}</td>
                  <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{{ formatCurrency(p.price) }}</td>
                  <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{{ p.stock }}</td>
                </tr>
                <tr v-if="recentProducts.length === 0">
                  <td colspan="3" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">Belum ada produk</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>