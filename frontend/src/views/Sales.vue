<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import ModalForm from '@/components/forms/ModalForm.vue'
import SaleForm from '@/components/forms/SaleForm.vue'
import { alertNotify } from '@/utils/alert'

interface Sale {
  id: number
  product_id: number | null
  package_id: number | null
  product_name: string
  sku: string | null
  qty: number
  price: number
  subtotal: number
  customer_id: number | null
  customer_name: string | null
  customer_type: string
  partner_id: number | null
  sale_date: string
  notes: string | null
  payment_method?: string
  created_at: string
}

const sales = ref<Sale[]>([])
const loading = ref(false)
const search = ref('')
const pagination = ref({ page: 1, limit: 50, total: 0, totalPages: 0 })

// State untuk Modal Form
const showFormModal = ref(false)
const isEditing = ref(false)
const selectedSaleId = ref<number | null>(null)
const saleFormRef = ref<InstanceType<typeof SaleForm> | null>(null)
const formData = ref({
  id: undefined as number | undefined,
  product_id: null as number | null,
  package_id: null as number | null,
  product_name: '',
  sku: '',
  qty: 1,
  price: 0,
  subtotal: 0,
  customer_id: null as number | null,
  customer_name: '',
  customer_type: 'umum' as 'pelanggan' | 'mitra' | 'umum',
  partner_id: null as number | null,
  sale_date: new Date().toISOString().split('T')[0],
  notes: '',
  payment_method: 'cash' as 'cash' | 'transfer' | 'partner_savings',
})

const columns: Column[] = [
  { key: 'no', label: 'No', slot: 'no' },
  { key: 'sale_date', label: 'Tanggal', slot: 'sale_date' },
  { key: 'product_name', label: 'Produk', tdClass: 'font-medium text-gray-900 dark:text-white', slot: 'product_display' },
  { key: 'sku', label: 'SKU' },
  { key: 'qty', label: 'Qty' },
  { key: 'price', label: 'Harga', tdClass: 'text-gray-900 dark:text-white', slot: 'price' },
  { key: 'subtotal', label: 'Subtotal', tdClass: 'font-medium text-gray-900 dark:text-white', slot: 'subtotal' },
  { key: 'customer_display', label: 'Pelanggan', slot: 'customer_display' },
  { key: 'customer_type', label: 'Tipe', slot: 'customer_type' },
  { key: 'actions', label: 'Aksi', slot: 'actions' },
]

const fetchSales = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(pagination.value.page),
      limit: String(pagination.value.limit),
    })
    if (search.value) params.append('search', search.value)
    const res = await api.get(`/sales?${params.toString()}`)
    sales.value = res.data.data
    pagination.value = res.data.pagination
  } catch (error) {
    console.error('Failed to fetch sales:', error)
  } finally {
    loading.value = false
  }
}

const handleDelete = async (id: number) => {
  const confirmed = await alertNotify.confirm('Yakin ingin menghapus penjualan ini?')
  if (!confirmed) return
  try {
    await api.delete(`/sales/${id}`)
    alertNotify.success('Penjualan berhasil dihapus')
    fetchSales()
  } catch (error) {
    alertNotify.error('Gagal menghapus penjualan')
  }
}

const handleSearch = () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  pagination.value.page = 1
  fetchSales()
}

// Auto search dengan debounce saat mengetik (sama seperti Pelanggan/Mitra/Pemasok/Produk/Pembelian)
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    pagination.value.page = 1
    fetchSales()
  }, 400)
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})

const handlePage = (page: number) => {
  pagination.value.page = page
  fetchSales()
}

const formatCurrency = (num: number) => 'Rp ' + Number(num).toLocaleString('id-ID')
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })

const openCreateModal = () => {
  isEditing.value = false
  selectedSaleId.value = null
  formData.value = {
    id: undefined,
    product_id: null,
    package_id: null,
    product_name: '',
    sku: '',
    qty: 1,
    price: 0,
    subtotal: 0,
    customer_id: null,
    customer_name: '',
    customer_type: 'umum',
    partner_id: null,
    sale_date: new Date().toISOString().split('T')[0],
    notes: '',
    payment_method: 'cash',
  }
  showFormModal.value = true
}

const openEditModal = (sale: Sale) => {
  isEditing.value = true
  selectedSaleId.value = sale.id
  formData.value = {
    id: sale.id,
    product_id: sale.product_id,
    package_id: sale.package_id,
    product_name: sale.product_name,
    sku: sale.sku || '',
    qty: Number(sale.qty) || 1,
    price: Number(sale.price) || 0,
    subtotal: Number(sale.subtotal) || 0,
    customer_id: sale.customer_id,
    customer_name: sale.customer_name || '',
    customer_type: sale.customer_type as 'pelanggan' | 'mitra' | 'umum',
    partner_id: sale.partner_id,
    sale_date: sale.sale_date || new Date().toISOString().split('T')[0],
    notes: sale.notes || '',
    payment_method: (sale.payment_method as 'cash' | 'transfer' | 'partner_savings') || 'cash',
  }
  showFormModal.value = true
}

// State untuk Receipt Modal
const showReceiptModal = ref(false)
const receiptSaleId = ref<number | null>(null)
const receiptHtml = ref('')
const receiptText = ''
const receiptLoading = ref(false)
const receiptSending = ref(false)

const sendChannels = ref({
  email: true,
  sms: false,
  whatsapp: false,
})

const handleFormSuccess = (saleId: number | null) => {
  showFormModal.value = false
  fetchSales()
  
  // Open receipt modal with the new sale ID
  if (saleId) {
    receiptSaleId.value = saleId
    loadReceipt(saleId)
    showReceiptModal.value = true
  }
}

const loadReceipt = async (saleId: number) => {
  receiptLoading.value = true
  try {
    const res = await api.get(`/sales/${saleId}/receipt`)
    receiptHtml.value = res.data.receiptHtml
    // receiptText would be loaded here if needed
  } catch (error) {
    console.error('Failed to load receipt:', error)
    alertNotify.error('Gagal memuat struk')
  } finally {
    receiptLoading.value = false
  }
}

const handleSendReceipt = async (channels: { email?: boolean; sms?: boolean; whatsapp?: boolean }) => {
  if (!receiptSaleId.value) return
  
  receiptSending.value = true
  try {
    const res = await api.post(`/sales/${receiptSaleId.value}/send-receipt`, { channels })
    alertNotify.success('Struk berhasil dikirim')
    console.log('Send results:', res.data.results)
  } catch (error: any) {
    alertNotify.error(error.response?.data?.error || 'Gagal mengirim struk')
  } finally {
    receiptSending.value = false
  }
}

const handleReceiptClose = () => {
  showReceiptModal.value = false
  receiptSaleId.value = null
  receiptHtml.value = ''
}

const handleModalSubmit = () => {
  saleFormRef.value?.submit()
}

const handleFormClose = () => {
  showFormModal.value = false
}

onMounted(() => fetchSales())
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Kelola Penjualan</h1>
      <button @click="openCreateModal" class="btn-primary p-2" aria-label="Tambah penjualan">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <DataTable
      :columns="columns"
      :rows="sales"
      :loading="loading"
      :pagination="pagination"
      :search-value="search"
      search-placeholder="Cari produk, paket, pelanggan, SKU..."
      empty-text="Tidak ada data penjualan"
      @search="handleSearch"
      @update:searchValue="search = $event"
      @page="handlePage"
    >
      <template #no="{ index }">
        {{ (pagination.page - 1) * pagination.limit + index + 1 }}
      </template>
      <template #sale_date="{ row }">
        {{ formatDate(row.sale_date) }}
      </template>
      <template #product_display="{ row }">
        <div class="flex items-center gap-2">
          <span>{{ row.product_name }}</span>
          <span
            v-if="row.package_id"
            class="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
          >
            Paket
          </span>
        </div>
      </template>
      <template #price="{ row }">
        {{ formatCurrency(row.price) }}
      </template>
      <template #subtotal="{ row }">
        {{ formatCurrency(row.subtotal) }}
      </template>
      <template #customer_display="{ row }">
        {{ row.customer_name || (row.partner_id ? 'Mitra' : '-') }}
      </template>
      <template #customer_type="{ row }">
        <span class="px-2 py-1 text-xs font-medium rounded-full" :class="row.customer_type === 'mitra' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' : row.customer_type === 'pelanggan' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'">
          {{ row.customer_type }}
        </span>
      </template>
      <template #actions="{ row }">
        <div class="flex items-center gap-2">
          <button @click="openEditModal(row)" class="text-blue-600 hover:text-blue-500 p-1.5" aria-label="Edit penjualan">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button @click="handleDelete(row.id)" class="text-red-600 hover:text-red-500 p-1.5" aria-label="Hapus penjualan">
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
      :title="isEditing ? 'Edit Penjualan' : 'Tambah Penjualan'"
      width="max-w-3xl"
      @close="handleFormClose"
      @submit="handleModalSubmit"
    >
      <SaleForm
        ref="saleFormRef"
        v-model="showFormModal"
        :initial-data="formData"
        :is-editing="isEditing"
        @success="handleFormSuccess"
      />
    </ModalForm>

    <!-- Receipt Modal -->
    <ModalForm
      v-model="showReceiptModal"
      :title="`Struk Penjualan #${receiptSaleId || ''}`"
      width="max-w-2xl"
      @close="handleReceiptClose"
    >
      <div v-if="receiptLoading" class="text-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-2 text-gray-600">Memuat struk...</p>
      </div>
      <div v-else class="space-y-6">
        <!-- Receipt Preview -->
        <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-h-96 overflow-y-auto">
          <div v-html="receiptHtml" class="font-mono text-sm"></div>
        </div>

        <!-- Send Options -->
        <div class="border-t pt-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Kirim Struk</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <input type="checkbox" v-model="sendChannels.email" class="w-4 h-4 text-blue-600 border-gray-300 rounded" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Email</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <input type="checkbox" v-model="sendChannels.sms" class="w-4 h-4 text-green-600 border-gray-300 rounded" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">SMS</span>
            </label>
            <label class="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <input type="checkbox" v-model="sendChannels.whatsapp" class="w-4 h-4 text-green-500 border-gray-300 rounded" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">WhatsApp</span>
            </label>
          </div>
          <button
            @click="handleSendReceipt(sendChannels)"
            :disabled="receiptSending || (!sendChannels.email && !sendChannels.sms && !sendChannels.whatsapp)"
            class="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-300"
          >
            <span v-if="receiptSending">Mengirim...</span>
            <span v-else>Kirim Struk</span>
          </button>
        </div>
      </div>
    </ModalForm>
  </div>
</template>