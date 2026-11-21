<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import api from '@/services/api'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import OperationalCostForm from '@/components/forms/OperationalCostForm.vue'
import ModalForm from '@/components/forms/ModalForm.vue'
import { alertNotify } from '@/utils/alert'

const formRef = ref<InstanceType<typeof OperationalCostForm> | null>(null)

interface OperationalCost {
  id: number
  category_id: number | null
  category_name: string
  amount: number
  cost_date: string
  notes: string | null
  receipt_url: string | null
  created_at: string
}

const costs = ref<OperationalCost[]>([])
const loading = ref(false)
const search = ref('')
const pagination = ref({ page: 1, limit: 10, total: 0, totalPages: 0 })

const showFormModal = ref(false)
const isEditing = ref(false)
const selectedCostId = ref<number | null>(null)
const formData = ref({
  id: undefined as number | undefined,
  category_id: undefined as number | undefined,
  category_name: '',
  amount: 0,
  cost_date: new Date().toISOString().split('T')[0],
  notes: '',
  receipt_url: '',
})

const columns: Column[] = [
  { key: 'no', label: 'Nomor', slot: 'no' },
  { key: 'category_name', label: 'Kategori', tdClass: 'font-medium text-gray-900 dark:text-white' },
  { key: 'amount', label: 'Jumlah', tdClass: 'text-right font-medium' },
  { key: 'cost_date', label: 'Tanggal', slot: 'cost_date' },
  { key: 'notes', label: 'Catatan', tdClass: 'max-w-xs truncate' },
  { key: 'created_at', label: 'Dibuat', slot: 'created_at' },
  { key: 'actions', label: 'Aksi', slot: 'actions' },
]

const fetchCosts = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(pagination.value.page),
      limit: String(pagination.value.limit),
    })
    if (search.value) params.append('search', search.value)
    const res = await api.get(`/operational-costs?${params.toString()}`)
    costs.value = res.data.data
    pagination.value = res.data.pagination
  } catch (error) {
    console.error('Failed to fetch operational costs:', error)
    alertNotify.error('Gagal memuat data biaya operasional')
  } finally {
    loading.value = false
  }
}

const handleDelete = async (id: number) => {
  const confirmed = await alertNotify.confirm('Yakin ingin menghapus biaya operasional ini?')
  if (!confirmed) return
  try {
    await api.delete(`/operational-costs/${id}`)
    alertNotify.success('Biaya operasional berhasil dihapus')
    fetchCosts()
  } catch (error) {
    alertNotify.error('Gagal menghapus biaya operasional')
  }
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    pagination.value.page = 1
    fetchCosts()
  }, 400)
})

const handlePage = (page: number) => {
  pagination.value.page = page
  fetchCosts()
}

const handleSearch = () => {
  pagination.value.page = 1
  fetchCosts()
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

const formatRupiah = (val: number | string) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Number(val))
}

const openCreateModal = () => {
  isEditing.value = false
  selectedCostId.value = null
  formData.value = {
    id: undefined,
    category_id: undefined,
    category_name: '',
    amount: 0,
    cost_date: new Date().toISOString().split('T')[0],
    notes: '',
    receipt_url: '',
  }
  showFormModal.value = true
}

const openEditModal = async (cost: OperationalCost) => {
  isEditing.value = true
  selectedCostId.value = cost.id
  try {
    const res = await api.get(`/operational-costs/${cost.id}`)
    const d = res.data.data
    formData.value = {
      id: d.id,
      category_id: d.category_id,
      category_name: d.category_name,
      amount: Number(d.amount),
      cost_date: d.cost_date,
      notes: d.notes || '',
      receipt_url: d.receipt_url || '',
    }
    showFormModal.value = true
  } catch (error) {
    alertNotify.error('Gagal memuat data biaya operasional')
  }
}

const handleFormSuccess = () => {
  showFormModal.value = false
  fetchCosts()
}

const handleModalSubmit = () => {
  formRef.value?.submit()
}

const handleFormClose = () => {
  showFormModal.value = false
}

onMounted(() => fetchCosts())
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Biaya Operasional</h1>
      <button @click="openCreateModal" class="btn-primary p-2" aria-label="Tambah biaya operasional">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <DataTable
      :columns="columns"
      :rows="costs"
      :loading="loading"
      :pagination="pagination"
      :search-value="search"
      search-placeholder="Cari kategori, catatan..."
      empty-text="Tidak ada data biaya operasional"
      @search="handleSearch"
      @update:searchValue="search = $event"
      @page="handlePage"
    >
      <template #no="{ row, index }">
        {{ (pagination.page - 1) * pagination.limit + index + 1 }}
      </template>
      <template #amount="{ row }">
        {{ formatRupiah(row.amount) }}
      </template>
      <template #cost_date="{ row }">
        {{ formatDate(row.cost_date) }}
      </template>
      <template #created_at="{ row }">
        {{ formatDate(row.created_at) }}
      </template>
      <template #actions="{ row }">
        <div class="flex items-center gap-2">
          <button @click="openEditModal(row)" class="text-blue-600 hover:text-blue-500 p-1.5" aria-label="Edit biaya">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button @click="handleDelete(row.id)" class="text-red-600 hover:text-red-500 p-1.5" aria-label="Hapus biaya">
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
      :title="isEditing ? 'Edit Biaya Operasional' : 'Tambah Biaya Operasional'"
      @close="handleFormClose"
      @submit="handleModalSubmit"
    >
      <OperationalCostForm
        ref="formRef"
        :initial-data="formData"
        :is-editing="isEditing"
        @success="handleFormSuccess"
      />
    </ModalForm>
  </div>
</template>
