<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import ProductForm from '@/components/forms/ProductForm.vue'
import ModalForm from '@/components/forms/ModalForm.vue'
import { alertNotify } from '@/utils/alert'
import { useProductsStore } from '@/stores/products'

const productFormRef = ref<InstanceType<typeof ProductForm> | null>(null)

interface Product {
  id: number
  name: string
  sku: string | null
  buy_price: number
  price: number
  partner_price: number
  bundle_qty: number
  bundle_price: number
  stock: number
  supplier_id: number | null
  supplier_name: string | null
  purchase_date: string | null
  created_at: string
}

const productsStore = useProductsStore()

// Use store's products reactively
const products = computed(() => productsStore.products)
const loading = computed(() => productsStore.loading)
const search = ref('')
const pagination = ref({ page: 1, limit: 10, total: 0, totalPages: 0 })

// State untuk Modal Form
const showFormModal = ref(false)
const isEditing = ref(false)
const selectedProductId = ref<number | null>(null)
const formData = ref({
  id: undefined as number | undefined,
  name: '',
  sku: '',
  buy_price: 0,
  price: 0,
  partner_price: 0,
  bundle_qty: 0,
  bundle_price: 0,
  stock: 0,
  supplier_id: null as number | null,
  supplier_name: null as string | null,
  purchase_date: null as string | null,
})

const columns: Column[] = [
  { key: 'no', label: 'No', slot: 'no' },
  { key: 'name', label: 'Nama', tdClass: 'font-medium text-gray-900 dark:text-white' },
  { key: 'sku', label: 'SKU' },
  { key: 'buy_price', label: 'Harga Beli', slot: 'buy_price' },
  { key: 'price', label: 'Harga Jual', tdClass: 'text-gray-900 dark:text-white', slot: 'price' },
  { key: 'partner_price', label: 'Harga Mitra', slot: 'partner_price' },
  { key: 'bundle', label: 'Bundle', slot: 'bundle' },
  { key: 'stock', label: 'Stok', slot: 'stock' },
  { key: 'supplier_name', label: 'Pemasok' },
  { key: 'purchase_date', label: 'Tanggal Beli', slot: 'purchase_date' },
  { key: 'actions', label: 'Aksi', slot: 'actions' },
]

const fetchProducts = async () => {
  try {
    const params = new URLSearchParams({
      page: String(pagination.value.page),
      limit: String(pagination.value.limit),
    })
    if (search.value) params.append('search', search.value)
    const res = await productsStore.fetchAll({ page: pagination.value.page, limit: pagination.value.limit, search: search.value })
    pagination.value = res.pagination
  } catch (error) {
    console.error('Failed to fetch products:', error)
  }
}

const handleDelete = async (id: number) => {
  const confirmed = await alertNotify.confirm('Yakin ingin menghapus produk ini?')
  if (!confirmed) return
  try {
    await api.delete(`/products/${id}`)
    productsStore.removeProduct(id)
    alertNotify.success('Produk berhasil dihapus')
  } catch (error) {
    alertNotify.error('Gagal menghapus produk')
  }
}

const handleSearch = () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  pagination.value.page = 1
  fetchProducts()
}

// Auto search dengan debounce saat mengetik (sama seperti Pelanggan/Mitra/Pemasok)
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    pagination.value.page = 1
    fetchProducts()
  }, 400)
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})

const handlePage = (page: number) => {
  pagination.value.page = page
  fetchProducts()
}

const formatCurrency = (num: number) => {
  return 'Rp ' + Number(num).toLocaleString('id-ID')
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const openCreateModal = () => {
  isEditing.value = false
  selectedProductId.value = null
  formData.value = {
    id: undefined,
    name: '',
    sku: '',
    buy_price: 0,
    price: 0,
    partner_price: 0,
    bundle_qty: 0,
    bundle_price: 0,
    stock: 0,
    supplier_id: null,
    supplier_name: null,
    purchase_date: null,
  }
  showFormModal.value = true
}

const openEditModal = async (product: Product) => {
  isEditing.value = true
  selectedProductId.value = product.id
  try {
    const res = await api.get(`/products/${product.id}`)
    formData.value = {
      id: res.data.id,
      name: res.data.name,
      sku: res.data.sku || '',
      buy_price: Number(res.data.buy_price) || 0,
      price: Number(res.data.price) || 0,
      partner_price: Number(res.data.partner_price) || 0,
      bundle_qty: Number(res.data.bundle_qty) || 0,
      bundle_price: Number(res.data.bundle_price) || 0,
      stock: Number(res.data.stock) || 0,
      supplier_id: res.data.supplier_id,
      supplier_name: res.data.supplier_name,
      purchase_date: res.data.purchase_date || null,
    }
    showFormModal.value = true
  } catch (error) {
    alertNotify.error('Gagal memuat data produk')
  }
}

const handleFormSuccess = () => {
  showFormModal.value = false
  // No need to fetchProducts() - store is reactive and updated by ProductForm
}

const handleModalSubmit = () => {
  productFormRef.value?.submit()
}

const handleFormClose = () => {
  showFormModal.value = false
}

onMounted(() => fetchProducts())
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Kelola Produk</h1>
      <button @click="openCreateModal" class="btn-primary p-2" aria-label="Tambah produk">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <DataTable
      :columns="columns"
      :rows="products"
      :loading="loading"
      :pagination="pagination"
      :search-value="search"
      search-placeholder="Cari nama, SKU..."
      empty-text="Tidak ada data produk"
      @search="handleSearch"
      @update:searchValue="search = $event"
      @page="handlePage"
    >
      <template #no="{ index }">
        {{ (pagination.page - 1) * pagination.limit + index + 1 }}
      </template>
      <template #buy_price="{ row }">
        {{ formatCurrency(row.buy_price) }}
      </template>
      <template #price="{ row }">
        {{ formatCurrency(row.price) }}
      </template>
      <template #partner_price="{ row }">
        {{ formatCurrency(row.partner_price) }}
      </template>
      <template #bundle="{ row }">
        {{ row.bundle_qty > 0 ? `${row.bundle_qty} for ${formatCurrency(row.bundle_price)}` : '-' }}
      </template>
      <template #stock="{ row }">
        <span :class="row.stock <= 5 ? 'text-red-600 font-bold' : 'text-gray-900 dark:text-white'">{{ row.stock }}</span>
      </template>
      <template #purchase_date="{ row }">
        {{ row.purchase_date ? new Date(row.purchase_date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-' }}
      </template>
      <template #actions="{ row }">
        <div class="flex items-center gap-2">
          <button @click="openEditModal(row)" class="text-blue-600 hover:text-blue-500 p-1.5" aria-label="Edit produk">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button @click="handleDelete(row.id)" class="text-red-600 hover:text-red-500 p-1.5" aria-label="Hapus produk">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </template>
    </DataTable>

    <!-- Integrated Form Modal -->
    <ModalForm
      v-model="showFormModal"
      :title="isEditing ? 'Edit Produk' : 'Tambah Produk'"
      @close="handleFormClose"
      @submit="handleModalSubmit"
    >
      <ProductForm
        ref="productFormRef"
        :initial-data="formData"
        :is-editing="isEditing"
        @success="handleFormSuccess"
      />
    </ModalForm>
  </div>
</template>