<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import CustomerForm from '@/components/forms/CustomerForm.vue'
import ModalForm from '@/components/forms/ModalForm.vue'
import { alertNotify } from '@/utils/alert'

const customerFormRef = ref<InstanceType<typeof CustomerForm> | null>(null)

interface Customer {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
  created_at: string
}

const customers = ref<Customer[]>([])
const loading = ref(false)
const search = ref('')
const pagination = ref({ page: 1, limit: 10, total: 0, totalPages: 0 })

// State untuk Modal Form
const showFormModal = ref(false)
const isEditing = ref(false)
const selectedCustomerId = ref<number | null>(null)
const formData = ref({
  id: undefined as number | undefined,
  name: '',
  phone: '',
  email: '',
  address: '',
})

const columns: Column[] = [
  { key: 'no', label: 'Nomor', slot: 'no' },
  { key: 'name', label: 'Nama', tdClass: 'font-medium text-gray-900 dark:text-white' },
  { key: 'phone', label: 'Telepon' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Alamat', tdClass: 'max-w-xs truncate' },
  { key: 'created_at', label: 'Dibuat' },
  { key: 'actions', label: 'Aksi', slot: 'actions' },
]

const fetchCustomers = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(pagination.value.page),
      limit: String(pagination.value.limit),
    })
    if (search.value) params.append('search', search.value)
    const res = await api.get(`/customers?${params.toString()}`)
    customers.value = res.data.data
    pagination.value = res.data.pagination
  } catch (error) {
    console.error('Failed to fetch customers:', error)
  } finally {
    loading.value = false
  }
}

const handleDelete = async (id: number) => {
  const confirmed = await alertNotify.confirm('Yakin ingin menghapus pelanggan ini?')
  if (!confirmed) return
  try {
    await api.delete(`/customers/${id}`)
    alertNotify.success('Pelanggan berhasil dihapus')
    fetchCustomers()
  } catch (error) {
    alertNotify.error('Gagal menghapus pelanggan')
  }
}

const handleMigrate = async (customer: Customer) => {
  const confirmed = await alertNotify.confirm(
    `Yakin ingin memigrasikan pelanggan "${customer.name}" menjadi Mitra?\nData pelanggan akan dihapus dan dibuatkan data Mitra baru.`
  )
  if (!confirmed) return
  try {
    await api.post(`/customers/${customer.id}/migrate-to-partner`)
    alertNotify.success('Pelanggan berhasil dimigrasi ke Mitra')
    fetchCustomers()
  } catch (error: any) {
    const msg = error.response?.data?.error || 'Gagal memigrasikan pelanggan'
    alertNotify.error(msg)
  }
}

const handleSearch = () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  pagination.value.page = 1
  fetchCustomers()
}

// Auto search dengan debounce saat mengetik
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    pagination.value.page = 1
    fetchCustomers()
  }, 400)
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})

const handlePage = (page: number) => {
  pagination.value.page = page
  fetchCustomers()
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const openCreateModal = () => {
  isEditing.value = false
  selectedCustomerId.value = null
  formData.value = { id: undefined, name: '', phone: '', email: '', address: '' }
  showFormModal.value = true
}

const openEditModal = async (customer: Customer) => {
  isEditing.value = true
  selectedCustomerId.value = customer.id
  try {
    const res = await api.get(`/customers/${customer.id}`)
    formData.value = {
      id: res.data.id,
      name: res.data.name,
      phone: res.data.phone || '',
      email: res.data.email || '',
      address: res.data.address || '',
    }
    showFormModal.value = true
  } catch (error) {
    alertNotify.error('Gagal memuat data pelanggan')
  }
}

const handleFormSuccess = () => {
  showFormModal.value = false
  fetchCustomers()
}

const handleModalSubmit = () => {
  customerFormRef.value?.submit()
}

const handleFormClose = () => {
  showFormModal.value = false
}

onMounted(() => fetchCustomers())
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Kelola Pelanggan</h1>
      <button @click="openCreateModal" class="btn-primary p-2" aria-label="Tambah pelanggan">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <DataTable
      :columns="columns"
      :rows="customers"
      :loading="loading"
      :pagination="pagination"
      :search-value="search"
      search-placeholder="Cari nama, telepon, email..."
      empty-text="Tidak ada data pelanggan"
      @search="handleSearch"
      @update:searchValue="search = $event"
      @page="handlePage"
    >
      <template #no="{ row, index }">
        {{ (pagination.page - 1) * pagination.limit + index + 1 }}
      </template>
      <template #created_at="{ row }">
        {{ formatDate(row.created_at) }}
      </template>
      <template #actions="{ row }">
        <div class="flex items-center gap-2">
          <button @click="openEditModal(row)" class="text-blue-600 hover:text-blue-500 p-1.5" aria-label="Edit pelanggan">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button @click="handleMigrate(row)" class="text-purple-600 hover:text-purple-500 p-1.5" aria-label="Migrasi ke Mitra">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </button>
          <button @click="handleDelete(row.id)" class="text-red-600 hover:text-red-500 p-1.5" aria-label="Hapus pelanggan">
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
      :title="isEditing ? 'Edit Pelanggan' : 'Tambah Pelanggan'"
      @close="handleFormClose"
      @submit="handleModalSubmit"
    >
      <CustomerForm
        ref="customerFormRef"
        :initial-data="formData"
        :is-editing="isEditing"
        @success="handleFormSuccess"
      />
    </ModalForm>
  </div>
</template>