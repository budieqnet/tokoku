<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import SupplierForm from '@/components/forms/SupplierForm.vue'
import ModalForm from '@/components/forms/ModalForm.vue'
import { alertNotify } from '@/utils/alert'

const supplierFormRef = ref<InstanceType<typeof SupplierForm> | null>(null)

interface Supplier {
  id: number
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  address: string | null
  created_at: string
}

const suppliers = ref<Supplier[]>([])
const loading = ref(false)
const search = ref('')
const pagination = ref({ page: 1, limit: 10, total: 0, totalPages: 0 })

// State untuk Modal Form
const showFormModal = ref(false)
const isEditing = ref(false)
const selectedSupplierId = ref<number | null>(null)
const formData = ref({
  id: undefined as number | undefined,
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: '',
})

const columns: Column[] = [
  { key: 'no', label: 'No', slot: 'no' },
  { key: 'name', label: 'Nama', tdClass: 'font-medium text-gray-900 dark:text-white' },
  { key: 'contact', label: 'Kontak' },
  { key: 'phone', label: 'Telepon' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Alamat', tdClass: 'max-w-xs truncate' },
  { key: 'created_at', label: 'Dibuat' },
  { key: 'actions', label: 'Aksi', slot: 'actions' },
]

const fetchSuppliers = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(pagination.value.page),
      limit: String(pagination.value.limit),
    })
    if (search.value) params.append('search', search.value)
    const res = await api.get(`/suppliers?${params.toString()}`)
    suppliers.value = res.data.data
    pagination.value = res.data.pagination
  } catch (error) {
    console.error('Failed to fetch suppliers:', error)
  } finally {
    loading.value = false
  }
}

const handleDelete = async (id: number) => {
  const confirmed = await alertNotify.confirm('Yakin ingin menghapus pemasok ini?')
  if (!confirmed) return
  try {
    await api.delete(`/suppliers/${id}`)
    alertNotify.success('Pemasok berhasil dihapus')
    fetchSuppliers()
  } catch (error) {
    alertNotify.error('Gagal menghapus pemasok')
  }
}

const handleSearch = () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  pagination.value.page = 1
  fetchSuppliers()
}

// Auto search dengan debounce saat mengetik (sama seperti Pelanggan/Mitra)
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    pagination.value.page = 1
    fetchSuppliers()
  }, 400)
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})

const handlePage = (page: number) => {
  pagination.value.page = page
  fetchSuppliers()
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const openCreateModal = () => {
  isEditing.value = false
  selectedSupplierId.value = null
  formData.value = { id: undefined, name: '', contact: '', phone: '', email: '', address: '' }
  showFormModal.value = true
}

const openEditModal = async (supplier: Supplier) => {
  isEditing.value = true
  selectedSupplierId.value = supplier.id
  try {
    const res = await api.get(`/suppliers/${supplier.id}`)
    formData.value = {
      id: res.data.id,
      name: res.data.name,
      contact: res.data.contact || '',
      phone: res.data.phone || '',
      email: res.data.email || '',
      address: res.data.address || '',
    }
    showFormModal.value = true
  } catch (error) {
    alertNotify.error('Gagal memuat data pemasok')
  }
}

const handleFormSuccess = () => {
  showFormModal.value = false
  fetchSuppliers()
}

const handleModalSubmit = () => {
  supplierFormRef.value?.submit()
}

const handleFormClose = () => {
  showFormModal.value = false
}

onMounted(() => fetchSuppliers())
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Kelola Pemasok</h1>
      <button @click="openCreateModal" class="btn-primary p-2" aria-label="Tambah pemasok">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <DataTable
      :columns="columns"
      :rows="suppliers"
      :loading="loading"
      :pagination="pagination"
      :search-value="search"
      search-placeholder="Cari nama, kontak, telepon..."
      empty-text="Tidak ada data pemasok"
      @search="handleSearch"
      @update:searchValue="search = $event"
      @page="handlePage"
    >
      <template #no="{ index }">
        {{ (pagination.page - 1) * pagination.limit + index + 1 }}
      </template>
      <template #created_at="{ row }">
        {{ formatDate(row.created_at) }}
      </template>
      <template #actions="{ row }">
        <div class="flex items-center gap-2">
          <button @click="openEditModal(row)" class="text-blue-600 hover:text-blue-500 p-1.5" aria-label="Edit pemasok">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button @click="handleDelete(row.id)" class="text-red-600 hover:text-red-500 p-1.5" aria-label="Hapus pemasok">
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
      :title="isEditing ? 'Edit Pemasok' : 'Tambah Pemasok'"
      @close="handleFormClose"
      @submit="handleModalSubmit"
    >
      <SupplierForm
        ref="supplierFormRef"
        :model-value="showFormModal"
        @update:model-value="showFormModal = $event"
        :initial-data="formData"
        :is-editing="isEditing"
        @success="handleFormSuccess"
      />
    </ModalForm>
  </div>
</template>