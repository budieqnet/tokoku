<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import ModalForm from '@/components/forms/ModalForm.vue'
import PurchaseForm from '@/components/forms/PurchaseForm.vue'
import { alertNotify } from '@/utils/alert'

interface Purchase {
  id: number
  product_id: number | null
  product_name: string
  sku: string | null
  qty: number
  price: number
  supplier_id: number | null
  supplier_name: string | null
  purchase_date: string
  notes: string | null
  created_at: string
}

const purchases = ref<Purchase[]>([])
const loading = ref(false)
const search = ref('')
const pagination = ref({ page: 1, limit: 10, total: 0, totalPages: 0 })

// State untuk Modal Form
const showFormModal = ref(false)
const isEditing = ref(false)
const selectedPurchaseId = ref<number | null>(null)
const purchaseFormRef = ref<InstanceType<typeof PurchaseForm> | null>(null)
const formData = ref({
  id: undefined as number | undefined,
  product_id: null as number | null,
  product_name: '',
  sku: '',
  qty: 1,
  price: 0,
  supplier_id: null as number | null,
  supplier_name: '',
  purchase_date: new Date().toISOString().split('T')[0],
  notes: '',
})

const columns: Column[] = [
  { key: 'no', label: 'No', slot: 'no' },
  { key: 'purchase_date', label: 'Tanggal', slot: 'purchase_date' },
  { key: 'product_name', label: 'Produk', tdClass: 'font-medium text-gray-900 dark:text-white' },
  { key: 'sku', label: 'SKU' },
  { key: 'qty', label: 'Qty' },
  { key: 'price', label: 'Harga', tdClass: 'text-gray-900 dark:text-white', slot: 'price' },
  { key: 'supplier_name', label: 'Pemasok' },
  { key: 'notes', label: 'Catatan', tdClass: 'max-w-xs truncate' },
  { key: 'actions', label: 'Aksi', slot: 'actions' },
]

const fetchPurchases = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(pagination.value.page),
      limit: String(pagination.value.limit),
    })
    if (search.value) params.append('search', search.value)
    const res = await api.get(`/purchases?${params.toString()}`)
    console.log('Purchases API response:', res.data)
    console.log('First purchase supplier_name:', res.data.data[0]?.supplier_name)
    purchases.value = res.data.data
    pagination.value = res.data.pagination
  } catch (error) {
    console.error('Failed to fetch purchases:', error)
  } finally {
    loading.value = false
  }
}

const handleDelete = async (id: number) => {
  const confirmed = await alertNotify.confirm('Yakin ingin menghapus pembelian ini?')
  if (!confirmed) return
  try {
    await api.delete(`/purchases/${id}`)
    alertNotify.success('Pembelian berhasil dihapus')
    fetchPurchases()
  } catch (error) {
    alertNotify.error('Gagal menghapus pembelian')
  }
}

const handleSearch = () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  pagination.value.page = 1
  fetchPurchases()
}

// Auto search dengan debounce saat mengetik (sama seperti Pelanggan/Mitra/Pemasok/Produk)
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    pagination.value.page = 1
    fetchPurchases()
  }, 400)
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})

const handlePage = (page: number) => {
  pagination.value.page = page
  fetchPurchases()
}

const formatCurrency = (num: number) => 'Rp ' + Number(num).toLocaleString('id-ID')
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })

const openCreateModal = () => {
  isEditing.value = false
  selectedPurchaseId.value = null
  formData.value = {
    id: undefined,
    product_id: null,
    product_name: '',
    sku: '',
    qty: 1,
    price: 0,
    supplier_id: null,
    supplier_name: '',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: '',
  }
  showFormModal.value = true
}

const openEditModal = (purchase: Purchase) => {
  isEditing.value = true
  selectedPurchaseId.value = purchase.id
  formData.value = {
    id: purchase.id,
    product_id: purchase.product_id,
    product_name: purchase.product_name,
    sku: purchase.sku || '',
    qty: Number(purchase.qty) || 1,
    price: Number(purchase.price) || 0,
    supplier_id: purchase.supplier_id,
    supplier_name: purchase.supplier_name || '',
    purchase_date: purchase.purchase_date || new Date().toISOString().split('T')[0],
    notes: purchase.notes || '',
  }
  showFormModal.value = true
}

const handleFormSuccess = () => {
  showFormModal.value = false
  fetchPurchases()
}

const handleModalSubmit = () => {
  purchaseFormRef.value?.submit()
}

const handleFormClose = () => {
  showFormModal.value = false
}

onMounted(() => fetchPurchases())
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Kelola Pembelian</h1>
      <button @click="openCreateModal" class="btn-primary p-2" aria-label="Tambah pembelian">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <DataTable
      :columns="columns"
      :rows="purchases"
      :loading="loading"
      :pagination="pagination"
      :search-value="search"
      search-placeholder="Cari produk, pemasok, SKU..."
      empty-text="Tidak ada data pembelian"
      @search="handleSearch"
      @update:searchValue="search = $event"
      @page="handlePage"
    >
      <template #no="{ index }">
        {{ (pagination.page - 1) * pagination.limit + index + 1 }}
      </template>
      <template #purchase_date="{ row }">
        {{ formatDate(row.purchase_date) }}
      </template>
      <template #price="{ row }">
        {{ formatCurrency(row.price) }}
      </template>
      <template #actions="{ row }">
        <div class="flex items-center gap-2">
          <button @click="openEditModal(row)" class="text-blue-600 hover:text-blue-500 p-1.5" aria-label="Edit pembelian">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button @click="handleDelete(row.id)" class="text-red-600 hover:text-red-500 p-1.5" aria-label="Hapus pembelian">
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
      :title="isEditing ? 'Edit Pembelian' : 'Tambah Pembelian'"
      width="max-w-3xl"
      @close="handleFormClose"
      @submit="handleModalSubmit"
    >
      <PurchaseForm
        ref="purchaseFormRef"
        v-model="showFormModal"
        :initial-data="formData"
        :is-editing="isEditing"
        @success="handleFormSuccess"
      />
    </ModalForm>
  </div>
</template>