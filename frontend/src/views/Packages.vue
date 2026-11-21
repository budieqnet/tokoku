<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'

interface Package {
  id: number
  name: string
  price: number
  items: Array<{ product_id: number; qty: number; product_name: string; sku: string | null; stock: number }>
  created_at: string
}

const packages = ref<Package[]>([])
const loading = ref(false)
const search = ref('')
const pagination = ref({ page: 1, limit: 50, total: 0, totalPages: 0 })

const columns: Column[] = [
  { key: 'no', label: 'No', slot: 'no' },
  { key: 'name', label: 'Nama Paket', tdClass: 'font-medium text-gray-900 dark:text-white' },
  { key: 'composition', label: 'Komposisi', slot: 'composition' },
  { key: 'price', label: 'Harga Jual', tdClass: 'text-gray-900 dark:text-white', slot: 'price' },
  { key: 'stock', label: 'Stok Tersedia', slot: 'stock' },
  { key: 'created_at', label: 'Dibuat', slot: 'created_at' },
  { key: 'actions', label: 'Aksi', slot: 'actions' },
]

const fetchPackages = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(pagination.value.page),
      limit: String(pagination.value.limit),
    })
    if (search.value) params.append('search', search.value)
    const res = await api.get(`/packages?${params.toString()}`)
    packages.value = res.data.data
    pagination.value = res.data.pagination
  } catch (error) {
    console.error('Failed to fetch packages:', error)
  } finally {
    loading.value = false
  }
}

const handleDelete = async (id: number) => {
  if (!confirm('Yakin ingin menghapus paket ini?')) return
  try {
    await api.delete(`/packages/${id}`)
    fetchPackages()
  } catch (error) {
    alert('Gagal menghapus paket')
  }
}

const handleSearch = () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  pagination.value.page = 1
  fetchPackages()
}

// Auto search dengan debounce saat mengetik
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    pagination.value.page = 1
    fetchPackages()
  }, 400)
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})

const handlePage = (page: number) => {
  pagination.value.page = page
  fetchPackages()
}

const formatCurrency = (num: number) => 'Rp ' + Number(num).toLocaleString('id-ID')
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })

const getPackageStock = (items: any[]) => {
  if (!items || items.length === 0) return 0
  let min = Infinity
  for (const item of items) {
    const stock = Number(item.stock) || 0
    const qty = Number(item.qty) || 1
    min = Math.min(min, Math.floor(stock / qty))
  }
  return min === Infinity ? 0 : min
}

onMounted(() => fetchPackages())
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Kelola Paket</h1>
      <router-link to="/packages/new" class="btn-primary p-2" aria-label="Tambah paket">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </router-link>
    </div>

    <DataTable
      :columns="columns"
      :rows="packages"
      :loading="loading"
      :pagination="pagination"
      :search-value="search"
      search-placeholder="Cari nama paket..."
      empty-text="Tidak ada data paket"
      @search="handleSearch"
      @update:searchValue="search = $event"
      @page="handlePage"
    >
      <template #no="{ index }">
        {{ (pagination.page - 1) * pagination.limit + index + 1 }}
      </template>
      <template #composition="{ row }">
        <div class="max-w-xs">
          <div v-for="item in row.items" :key="item.product_id" class="truncate">
            {{ item.qty }}× {{ item.product_name }} ({{ item.sku || 'no SKU' }})
          </div>
        </div>
      </template>
      <template #price="{ row }">
        {{ formatCurrency(row.price) }}
      </template>
      <template #stock="{ row }">
        <span :class="getPackageStock(row.items) <= 5 ? 'text-red-600 font-bold' : 'text-gray-900 dark:text-white'">{{ getPackageStock(row.items) }}</span>
      </template>
      <template #created_at="{ row }">
        {{ formatDate(row.created_at) }}
      </template>
      <template #actions="{ row }">
        <div class="flex items-center gap-2">
          <router-link :to="`/packages/${row.id}/edit`" class="text-blue-600 hover:text-blue-500 p-1.5" aria-label="Edit paket">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </router-link>
          <button @click="handleDelete(row.id)" class="text-red-600 hover:text-red-500 p-1.5" aria-label="Hapus paket">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </template>
    </DataTable>
  </div>
</template>