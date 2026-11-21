<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import DataTable from '@/components/DataTable.vue'
import type { Column } from '@/components/DataTable.vue'
import PartnerForm from '@/components/forms/PartnerForm.vue'
import ModalForm from '@/components/forms/ModalForm.vue'
import { alertNotify } from '@/utils/alert'

const partnerFormRef = ref<InstanceType<typeof PartnerForm> | null>(null)

interface Partner {
  id: number
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  address: string | null
  created_at: string
}

interface Savings {
  id: number
  partner_id: number
  balance: number
  created_at: string
  updated_at: string
}

interface Transaction {
  id: number
  type: 'deposit' | 'withdraw' | 'payment'
  amount: number
  balance_before: number
  balance_after: number
  reference_type: 'manual' | 'sale'
  reference_id: number | null
  notes: string | null
  created_at: string
}

const partners = ref<Partner[]>([])
const loading = ref(false)
const search = ref('')
const pagination = ref({ page: 1, limit: 10, total: 0, totalPages: 0 })

// State untuk Modal Form Partner
const showFormModal = ref(false)
const isEditing = ref(false)
const selectedPartnerId = ref<number | null>(null)
const formData = ref({
  id: undefined as number | undefined,
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: '',
})

// State untuk Modal Tabungan
const showSavingsModal = ref(false)
const selectedPartnerForSavings = ref<Partner | null>(null)
const savingsData = ref<Savings | null>(null)
const savingsTransactions = ref<Transaction[]>([])
const savingsLoading = ref(false)
const savingsPagination = ref({ page: 1, limit: 20, total: 0, totalPages: 0 })

// Form deposit/withdraw
const savingsFormType = ref<'deposit' | 'withdraw'>('deposit')
const savingsFormAmount = ref<number | null>(null)
const savingsFormNotes = ref('')
const savingsFormSubmitting = ref(false)

// Formatted amount for currency display
const formattedSavingsAmount = ref('')

const parseSavingsAmount = () => {
  const numeric = formattedSavingsAmount.value.replace(/[^\d]/g, '')
  savingsFormAmount.value = numeric ? Number(numeric) : null
  formattedSavingsAmount.value = numeric ? Number(numeric).toLocaleString('id-ID') : ''
}

const formatSavingsAmountForDisplay = () => {
  if (savingsFormAmount.value !== null && savingsFormAmount.value !== undefined) {
    formattedSavingsAmount.value = savingsFormAmount.value.toLocaleString('id-ID')
  }
}

const formatSavingsAmountRealTime = (event: Event) => {
  const input = event.target as HTMLInputElement
  let value = input.value.replace(/[^\d]/g, '')
  if (value) {
    savingsFormAmount.value = Number(value)
    formattedSavingsAmount.value = Number(value).toLocaleString('id-ID')
    input.value = formattedSavingsAmount.value
  } else {
    savingsFormAmount.value = null
    formattedSavingsAmount.value = ''
    input.value = ''
  }
}

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

const fetchPartners = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(pagination.value.page),
      limit: String(pagination.value.limit),
    })
    if (search.value) params.append('search', search.value)
    const res = await api.get(`/partners?${params.toString()}`)
    partners.value = res.data.data
    pagination.value = res.data.pagination
  } catch (error) {
    console.error('Failed to fetch partners:', error)
  } finally {
    loading.value = false
  }
}

const handleDelete = async (id: number) => {
  const confirmed = await alertNotify.confirm('Yakin ingin menghapus mitra ini?')
  if (!confirmed) return
  try {
    await api.delete(`/partners/${id}`)
    alertNotify.success('Mitra berhasil dihapus')
    fetchPartners()
  } catch (error) {
    alertNotify.error('Gagal menghapus mitra')
  }
}

// Savings functions
const openSavingsModal = async (partner: Partner) => {
  selectedPartnerForSavings.value = partner
  savingsFormType.value = 'deposit'
  savingsFormAmount.value = null
  savingsFormNotes.value = ''
  formattedSavingsAmount.value = ''
  await fetchSavings(partner.id)
  showSavingsModal.value = true
}

const fetchSavings = async (partnerId: number, page = 1) => {
  savingsLoading.value = true
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(savingsPagination.value.limit),
    })
    const res = await api.get(`/partners/${partnerId}/savings?${params.toString()}`)
    savingsData.value = res.data.savings
    savingsTransactions.value = res.data.transactions
    savingsPagination.value = res.data.pagination
  } catch (error) {
    console.error('Failed to fetch savings:', error)
    alertNotify.error('Gagal memuat data tabungan')
  } finally {
    savingsLoading.value = false
  }
}

const handleSavingsPage = (page: number) => {
  if (selectedPartnerForSavings.value) {
    fetchSavings(selectedPartnerForSavings.value.id, page)
  }
}

const handleSavingsFormSubmit = async () => {
  // Parse the formatted amount before submitting
  parseSavingsAmount()
  
  if (!selectedPartnerForSavings.value || savingsFormAmount.value === null || savingsFormAmount.value <= 0) {
    alertNotify.error('Jumlah harus diisi dan lebih dari 0')
    return
  }

  savingsFormSubmitting.value = true
  try {
    const endpoint = savingsFormType.value === 'deposit' ? 'POST' : 'PUT'
    if (endpoint === 'POST') {
      await api.post(`/partners/${selectedPartnerForSavings.value.id}/savings`, {
        amount: savingsFormAmount.value,
        notes: savingsFormNotes.value,
      })
    } else {
      await api.put(`/partners/${selectedPartnerForSavings.value.id}/savings`, {
        amount: savingsFormAmount.value,
        notes: savingsFormNotes.value,
      })
    }
    alertNotify.success(savingsFormType.value === 'deposit' ? 'Setoran berhasil' : 'Penarikan berhasil')
    savingsFormAmount.value = null
    savingsFormNotes.value = ''
    formattedSavingsAmount.value = ''
    if (selectedPartnerForSavings.value) {
      await fetchSavings(selectedPartnerForSavings.value.id, savingsPagination.value.page)
    }
  } catch (error: any) {
    const msg = error.response?.data?.error || (savingsFormType.value === 'deposit' ? 'Gagal setoran' : 'Gagal penarikan')
    alertNotify.error(msg)
  } finally {
    savingsFormSubmitting.value = false
  }
}

const handleSavingsFormClose = () => {
  showSavingsModal.value = false
  selectedPartnerForSavings.value = null
  savingsData.value = null
  savingsTransactions.value = []
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount)
}

const getTransactionTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    deposit: 'Setoran',
    withdraw: 'Penarikan',
    payment: 'Pembayaran',
  }
  return labels[type] || type
}

const getTransactionTypeClass = (type: string) => {
  const classes: Record<string, string> = {
    deposit: 'text-green-600',
    withdraw: 'text-red-600',
    payment: 'text-blue-600',
  }
  return classes[type] || ''
}

const handleSearch = () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  pagination.value.page = 1
  fetchPartners()
}

// Auto search dengan debounce saat mengetik (sama seperti Kelola Pelanggan)
let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    pagination.value.page = 1
    fetchPartners()
  }, 400)
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})

const handlePage = (page: number) => {
  pagination.value.page = page
  fetchPartners()
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const openCreateModal = () => {
  isEditing.value = false
  selectedPartnerId.value = null
  formData.value = { id: undefined, name: '', contact: '', phone: '', email: '', address: '' }
  showFormModal.value = true
}

const openEditModal = async (partner: Partner) => {
  isEditing.value = true
  selectedPartnerId.value = partner.id
  try {
    const res = await api.get(`/partners/${partner.id}`)
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
    alertNotify.error('Gagal memuat data mitra')
  }
}

const handleFormSuccess = () => {
  showFormModal.value = false
  fetchPartners()
}

const handleModalSubmit = () => {
  partnerFormRef.value?.submit()
}

const handleFormClose = () => {
  showFormModal.value = false
}

onMounted(() => fetchPartners())
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Kelola Mitra</h1>
      <button @click="openCreateModal" class="btn-primary p-2" aria-label="Tambah mitra">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <DataTable
      :columns="columns"
      :rows="partners"
      :loading="loading"
      :pagination="pagination"
      :search-value="search"
      search-placeholder="Cari nama, kontak, telepon..."
      empty-text="Tidak ada data mitra"
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
          <button @click="openSavingsModal(row)" class="text-green-600 hover:text-green-500 p-1.5" aria-label="Tabungan mitra">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button @click="openEditModal(row)" class="text-blue-600 hover:text-blue-500 p-1.5" aria-label="Edit mitra">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button @click="handleDelete(row.id)" class="text-red-600 hover:text-red-500 p-1.5" aria-label="Hapus mitra">
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
      :title="isEditing ? 'Edit Mitra' : 'Tambah Mitra'"
      @close="handleFormClose"
      @submit="handleModalSubmit"
    >
      <PartnerForm
        ref="partnerFormRef"
        :model-value="showFormModal"
        @update:model-value="showFormModal = $event"
        :initial-data="formData"
        :is-editing="isEditing"
        @success="handleFormSuccess"
      />
    </ModalForm>

    <!-- Savings Modal -->
    <ModalForm
      v-model="showSavingsModal"
      :title="`Tabungan: ${selectedPartnerForSavings?.name || ''}`"
      :width="'lg'"
      @close="handleSavingsFormClose"
    >
      <div v-if="savingsData" class="space-y-6">
        <!-- Balance Card -->
        <div class="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl p-6">
          <div class="text-sm opacity-90">Saldo Tabungan</div>
          <div class="text-3xl font-bold mt-1">{{ formatCurrency(savingsData.balance) }}</div>
        </div>

        <!-- Deposit/Withdraw Form -->
        <div class="border-t pt-6">
          <div class="flex gap-2 mb-4">
            <button
              @click="savingsFormType = 'deposit'"
              :class="[
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                savingsFormType === 'deposit' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              ]"
            >
              Setoran
            </button>
            <button
              @click="savingsFormType = 'withdraw'"
              :class="[
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                savingsFormType === 'withdraw' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              ]"
              :disabled="savingsData.balance <= 0"
            >
              Penarikan
            </button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Jumlah {{ savingsFormType === 'deposit' ? 'Setoran' : 'Penarikan' }}
              </label>
              <input
                type="text"
                :value="formattedSavingsAmount"
                :max="savingsFormType === 'withdraw' ? savingsData.balance : undefined"
                placeholder="Masukkan jumlah"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                @input="formatSavingsAmountRealTime"
              />
              <p v-if="savingsFormType === 'withdraw'" class="text-sm text-gray-500 mt-1">
                Maksimal: {{ formatCurrency(savingsData.balance) }}
              </p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Catatan (opsional)</label>
              <textarea
                v-model="savingsFormNotes"
                rows="2"
                placeholder="Catatan transaksi..."
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <button
              @click="handleSavingsFormSubmit"
              :disabled="savingsFormSubmitting || savingsFormAmount === null || savingsFormAmount <= 0"
              class="w-full py-2.5 rounded-lg font-medium transition-colors"
              :class="savingsFormType === 'deposit'
                ? 'bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300'
                : 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300'"
            >
              <span v-if="savingsFormSubmitting">Memproses...</span>
              <span v-else>{{ savingsFormType === 'deposit' ? 'Setor' : 'Tarik' }}</span>
            </button>
          </div>
        </div>

        <!-- Transaction History -->
        <div class="border-t pt-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Riwayat Transaksi</h3>
          <div v-if="savingsTransactions.length === 0" class="text-center py-8 text-gray-500">
            Belum ada transaksi
          </div>
          <div v-else class="space-y-2 max-h-96 overflow-y-auto">
            <div
              v-for="tx in savingsTransactions"
              :key="tx.id"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex items-center gap-3">
                <span
                  :class="['px-2 py-1 text-xs font-medium rounded-full', getTransactionTypeClass(tx.type)]"
                >
                  {{ getTransactionTypeLabel(tx.type) }}
                </span>
                <div>
                  <p class="text-sm font-medium text-gray-900">
                    {{ formatCurrency(tx.amount) }}
                  </p>
                  <p class="text-xs text-gray-500">
                    {{ new Date(tx.created_at).toLocaleString('id-ID') }}
                    {{ tx.notes ? `· ${tx.notes}` : '' }}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-sm font-medium text-gray-900">
                  {{ formatCurrency(tx.balance_after) }}
                </p>
                <p class="text-xs text-gray-500">Saldo setelah</p>
              </div>
            </div>
          </div>

          <!-- Pagination for transactions -->
          <div v-if="savingsPagination.totalPages > 1" class="flex justify-center gap-2 mt-4">
            <button
              @click="handleSavingsPage(savingsPagination.page - 1)"
              :disabled="savingsPagination.page === 1"
              class="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <span class="flex items-center px-3 text-sm text-gray-600">
              Halaman {{ savingsPagination.page }} dari {{ savingsPagination.totalPages }}
            </span>
            <button
              @click="handleSavingsPage(savingsPagination.page + 1)"
              :disabled="savingsPagination.page >= savingsPagination.totalPages"
              class="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      </div>
      <div v-else class="text-center py-8 text-gray-500">
        Memuat data tabungan...
      </div>
    </ModalForm>
  </div>
</template>