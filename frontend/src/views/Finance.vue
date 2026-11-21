<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import api from '@/services/api'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import { alertNotify } from '@/utils/alert'

interface Sale {
  id: number
  product_name: string
  qty: number
  price: number
  subtotal: number
  customer_type: string
  sale_date: string
  created_at: string
}

interface Purchase {
  id: number
  product_name: string
  qty: number
  price: number
  purchase_date: string
  created_at: string
}

const dateFrom = ref('')
const dateTo = ref('')
const loading = ref(false)
const exportLoading = ref(false)
const search = ref('')
const pagination = ref({ page: 1, limit: 10, total: 0, totalPages: 0 })

const summary = ref({
  totalSales: 0,
  totalPurchases: 0,
  netProfit: 0,
  totalTransactions: 0,
})

const transactions = ref<Array<{
  id: number
  date: string
  type: 'penjualan' | 'pembelian'
  product: string
  qty: number
  total: number
}>>([])

const columns: Column[] = [
  { key: 'no', label: 'No' },
  { key: 'date', label: 'Tanggal' },
  { key: 'type', label: 'Jenis' },
  { key: 'product', label: 'Produk', tdClass: 'text-gray-900 dark:text-white' },
  { key: 'qty', label: 'Qty' },
  { key: 'total', label: 'Total' },
]

const filteredTransactions = computed(() => {
  if (!search.value) return transactions.value
  const q = search.value.toLowerCase()
  return transactions.value.filter(t =>
    t.product.toLowerCase().includes(q) ||
    t.type.toLowerCase().includes(q)
  )
})

const paginatedTransactions = computed(() => {
  const start = (pagination.value.page - 1) * pagination.value.limit
  return filteredTransactions.value.slice(start, start + pagination.value.limit)
})

watch(() => filteredTransactions.value, () => {
  pagination.value.total = filteredTransactions.value.length
  pagination.value.totalPages = Math.ceil(pagination.value.total / pagination.value.limit)
  if (pagination.value.page > pagination.value.totalPages) {
    pagination.value.page = pagination.value.totalPages || 1
  }
})

const fetchFinanceReport = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (dateFrom.value) params.append('date_from', dateFrom.value)
    if (dateTo.value) params.append('date_to', dateTo.value)

    const [salesRes, purchasesRes] = await Promise.all([
      api.get(`/sales?${params.toString()}&limit=1000`),
      api.get(`/purchases?${params.toString()}&limit=1000`),
    ])

    const sales = salesRes.data.data as Sale[]
    const purchases = purchasesRes.data.data as Purchase[]

    summary.value.totalSales = sales.reduce((sum, s) => sum + Number(s.subtotal), 0)
    summary.value.totalPurchases = purchases.reduce((sum, p) => sum + (Number(p.price) * Number(p.qty)), 0)
    summary.value.netProfit = summary.value.totalSales - summary.value.totalPurchases
    summary.value.totalTransactions = sales.length + purchases.length

    const allTransactions = [
      ...sales.map(s => ({
        id: s.id,
        date: s.sale_date,
        type: 'penjualan' as const,
        product: s.product_name,
        qty: s.qty,
        total: Number(s.subtotal),
      })),
      ...purchases.map(p => ({
        id: p.id,
        date: p.purchase_date,
        type: 'pembelian' as const,
        product: p.product_name,
        qty: p.qty,
        total: Number(p.price) * Number(p.qty),
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    transactions.value = allTransactions
    pagination.value.page = 1
  } catch (error) {
    console.error('Failed to fetch finance report:', error)
    alert('Gagal memuat laporan keuangan')
  } finally {
    loading.value = false
  }
}

const formatCurrency = (num: number) => 'Rp ' + Number(num).toLocaleString('id-ID')
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })

const exportReport = async (format: 'xlsx' | 'csv') => {
  if (!dateFrom.value || !dateTo.value) {
    alertNotify.error('Silakan pilih rentang tanggal terlebih dahulu')
    return
  }
  
  exportLoading.value = true
  try {
    const params = new URLSearchParams()
    params.append('date_from', dateFrom.value)
    params.append('date_to', dateTo.value)
    params.append('export', format)
    
    const response = await api.get(`/reports/finance?${params.toString()}`, {
      responseType: 'blob'
    })
    
    const blob = new Blob([response.data], { 
      type: format === 'xlsx' 
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv'
    })
    
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const dateStr = new Date().toISOString().split('T')[0]
    link.download = `laporan-keuangan-${dateFrom.value}-${dateTo.value}-${dateStr}.${format}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    
    alertNotify.success(`Laporan berhasil diekspor ke ${format.toUpperCase()}`)
  } catch (error) {
    console.error('Export failed:', error)
    alertNotify.error('Gagal mengekspor laporan')
  } finally {
    exportLoading.value = false
  }
}
 
const handleSearch = () => {
  pagination.value.page = 1
}
 
const handlePage = (page: number) => {
  pagination.value.page = page
}
 
onMounted(() => {
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
  dateFrom.value = firstDay.toISOString().split('T')[0]
  dateTo.value = today.toISOString().split('T')[0]
  fetchFinanceReport()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Laporan Keuangan</h1>
    </div>

    <!-- Filter -->
    <div class="card p-4">
      <form @submit.prevent="fetchFinanceReport" class="flex flex-wrap gap-4 items-end">
        <div>
          <label class="label-field">Dari Tanggal</label>
          <input v-model="dateFrom" type="date" class="input-field" />
        </div>
        <div>
          <label class="label-field">Sampai Tanggal</label>
          <input v-model="dateTo" type="date" class="input-field" />
        </div>
        <button type="submit" class="btn-primary" :disabled="loading">
          <span v-if="loading" class="flex items-center gap-2">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            Memuat...
          </span>
          <span v-else>Tampilkan</span>
        </button>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn-secondary"
            :disabled="exportLoading || !dateFrom || !dateTo"
            @click="exportReport('xlsx')"
            title="Ekspor ke Excel (XLSX)"
          >
            <span v-if="exportLoading" class="flex items-center gap-2">
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              Mengekspor...
            </span>
            <span v-else class="flex items-center gap-2">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              XLSX
            </span>
          </button>
          <button
            type="button"
            class="btn-secondary"
            :disabled="exportLoading || !dateFrom || !dateTo"
            @click="exportReport('csv')"
            title="Ekspor ke CSV"
          >
            <span v-if="exportLoading" class="flex items-center gap-2">
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              Mengekspor...
            </span>
            <span v-else class="flex items-center gap-2">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              CSV
            </span>
          </button>
        </div>
      </form>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="card p-6 border-l-4 border-green-500">
        <p class="text-sm text-gray-500 dark:text-gray-400">Total Penjualan</p>
        <p class="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{{ formatCurrency(summary.totalSales) }}</p>
      </div>
      <div class="card p-6 border-l-4 border-red-500">
        <p class="text-sm text-gray-500 dark:text-gray-400">Total Pembelian</p>
        <p class="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{{ formatCurrency(summary.totalPurchases) }}</p>
      </div>
      <div class="card p-6 border-l-4 border-yellow-500">
        <p class="text-sm text-gray-500 dark:text-gray-400">Laba Bersih</p>
        <p class="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{{ formatCurrency(summary.netProfit) }}</p>
      </div>
      <div class="card p-6 border-l-4 border-blue-500">
        <p class="text-sm text-gray-500 dark:text-gray-400">Total Transaksi</p>
        <p class="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{{ summary.totalTransactions }}</p>
      </div>
    </div>

    <!-- Transaction Table -->
    <DataTable
      :columns="columns"
      :rows="paginatedTransactions"
      :loading="loading"
      :pagination="pagination"
      :search-value="search"
      search-placeholder="Cari produk, jenis..."
      empty-text="Tidak ada data transaksi"
      @search="handleSearch"
      @update:searchValue="search = $event"
      @page="handlePage"
    >
      <template #no="{ index }">
        {{ (pagination.page - 1) * pagination.limit + index + 1 }}
      </template>
      <template #date="{ row }">
        {{ formatDate(row.date) }}
      </template>
      <template #type="{ row }">
        <span class="font-medium" :class="row.type === 'penjualan' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
          {{ row.type === 'penjualan' ? 'Penjualan' : 'Pembelian' }}
        </span>
      </template>
      <template #total="{ row }">
        <span class="font-medium" :class="row.type === 'penjualan' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
          {{ formatCurrency(row.total) }}
        </span>
      </template>
    </DataTable>
  </div>
</template>