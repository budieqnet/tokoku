<script setup lang="ts">
import { ref, reactive, watch, computed, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import { alertNotify } from '@/utils/alert'

interface Props {
  initialData: {
    id?: number
    name: string
    phone: string
    email: string
    address: string
  }
  isEditing: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'success'): void
  (e: 'close'): void
}>()

const form = reactive({
  id: props.initialData?.id,
  name: props.initialData?.name || '',
  phone: props.initialData?.phone || '',
  email: props.initialData?.email || '',
  address: props.initialData?.address || '',
})

const loading = ref(false)
const errors = ref<Record<string, string>>({})

// Autocomplete Nama Lengkap untuk deteksi duplikat
interface CustomerSuggestion {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
}

const suggestions = ref<CustomerSuggestion[]>([])
const showSuggestions = ref(false)
const searching = ref(false)
const highlightedIndex = ref(-1)
const suppressNextSearch = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

const normalizedName = computed(() => form.name.trim().toLowerCase())

const exactDuplicates = computed(() =>
  suggestions.value.filter((s) => s.name.trim().toLowerCase() === normalizedName.value)
)

const hasExactDuplicate = computed(() =>
  normalizedName.value.length > 0 && exactDuplicates.value.length > 0
)

const fetchSuggestions = async (keyword: string, seq: number) => {
  try {
    const params = new URLSearchParams({
      search: keyword.trim(),
      limit: '5',
      page: '1',
    })
    const res = await api.get(`/customers?${params.toString()}`)
    if (seq !== searchSeq) return
    let data: CustomerSuggestion[] = res.data?.data ?? []
    // Saat edit, jangan tampilkan data dirinya sendiri sebagai duplikat
    if (props.isEditing && form.id) {
      data = data.filter((s) => s.id !== form.id)
    }
    suggestions.value = data.slice(0, 5)
    showSuggestions.value = true
    highlightedIndex.value = -1
  } catch (error) {
    console.error('Failed to fetch customer suggestions:', error)
    if (seq === searchSeq) {
      suggestions.value = []
      showSuggestions.value = false
    }
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

watch(() => form.name, (val) => {
  highlightedIndex.value = -1
  if (debounceTimer) clearTimeout(debounceTimer)
  if (suppressNextSearch.value) {
    suppressNextSearch.value = false
    searching.value = false
    return
  }
  if (!val || val.trim().length < 2) {
    suggestions.value = []
    showSuggestions.value = false
    searching.value = false
    return
  }
  searching.value = true
  debounceTimer = setTimeout(() => {
    const seq = ++searchSeq
    fetchSuggestions(val, seq)
  }, 300)
})

const selectSuggestion = (item: CustomerSuggestion) => {
  suppressNextSearch.value = true
  form.name = item.name
  // Isi field lain agar user langsung tahu datanya sudah sama
  if (!props.isEditing) {
    form.phone = item.phone || form.phone
    form.email = item.email || form.email
    form.address = item.address || form.address
  }
  suggestions.value = [item]
  showSuggestions.value = false
  highlightedIndex.value = -1
}

const onNameFocus = () => {
  if (suggestions.value.length > 0) showSuggestions.value = true
}

const onNameBlur = () => {
  // Delay agar klik pada dropdown sempat diproses
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

const onNameKeydown = (e: KeyboardEvent) => {
  if (!showSuggestions.value || suggestions.value.length === 0) {
    if (e.key === 'Escape') showSuggestions.value = false
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightedIndex.value = (highlightedIndex.value + 1) % suggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedIndex.value =
      (highlightedIndex.value - 1 + suggestions.value.length) % suggestions.value.length
  } else if (e.key === 'Enter' && highlightedIndex.value >= 0) {
    e.preventDefault()
    selectSuggestion(suggestions.value[highlightedIndex.value])
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
  }
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  searchSeq++
})

// Update form data when initialData changes (e.g., switching customers to edit)
watch(() => props.initialData, (newData) => {
  if (newData) {
    suppressNextSearch.value = true
    if (debounceTimer) clearTimeout(debounceTimer)
    searchSeq++
    searching.value = false
    form.id = newData.id
    form.name = newData.name || ''
    form.phone = newData.phone || ''
    form.email = newData.email || ''
    form.address = newData.address || ''
    suggestions.value = []
    showSuggestions.value = false
    searching.value = false
    highlightedIndex.value = -1
  }
}, { immediate: true, deep: true })

const validate = () => {
  errors.value = {}
  if (!form.name) errors.value.name = 'Nama wajib diisi'
  if (!form.email) errors.value.email = 'Email wajib diisi'
  return Object.keys(errors.value).length === 0
}

const submit = async () => {
  if (!validate()) return

  loading.value = true
  try {
    if (props.isEditing && form.id) {
      // Use the correct payload based on backend schema
      const payload = {
        name: form.name,
        phone: form.phone || '',
        email: form.email || '',
        address: form.address || '',
      }
      await api.put(`/customers/${form.id}`, payload)
      alertNotify.success('Data berhasil diupdate')
    } else {
      const payload = {
        name: form.name,
        phone: form.phone || '',
        email: form.email || '',
        address: form.address || '',
      }
      await api.post('/customers', payload)
      alertNotify.success('Data berhasil ditambah')
    }
    emit('success')
    } catch (error: any) {
      console.error('Submit error:', error)
      alertNotify.error(error.response?.data?.message || 'Terjadi kesalahan saat menyimpan data')
    } finally {
      loading.value = false
    }
}

// Expose submit for parent ModalForm
defineExpose({ submit })
</script>

<template>
  <form @submit.prevent="submit" class="space-y-4">
    <div class="space-y-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nama Lengkap</label>
      <div class="relative">
        <input
          v-model="form.name"
          type="text"
          class="input-field pr-9"
          :class="{ 'border-red-500': errors.name, 'border-amber-500': !errors.name && hasExactDuplicate }"
          placeholder="Masukkan nama lengkap"
          autocomplete="off"
          @focus="onNameFocus"
          @blur="onNameBlur"
          @keydown="onNameKeydown"
        />
        <span v-if="searching" class="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
          <svg class="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </span>

        <!-- Dropdown autocomplete -->
        <div
          v-if="showSuggestions && suggestions.length > 0"
          class="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          <div class="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            {{ suggestions.length }} pelanggan ditemukan — klik untuk lihat detail
          </div>
          <div
            v-for="(item, idx) in suggestions"
            :key="item.id"
            @mousedown.prevent="selectSuggestion(item)"
            class="px-3 py-2 cursor-pointer border-b last:border-b-0 dark:border-gray-700"
            :class="{
              'bg-blue-50 dark:bg-blue-900/30': idx === highlightedIndex,
              'hover:bg-gray-100 dark:hover:bg-gray-700': idx !== highlightedIndex,
            }"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ item.name }}</span>
              <span
                v-if="item.name.trim().toLowerCase() === normalizedName"
                class="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              >
                Sama persis
              </span>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
              {{ item.phone || '-' }} • {{ item.email || '-' }}
            </div>
          </div>
        </div>

        <!-- Empty state saat mengetik tapi tidak ada hasil -->
        <div
          v-else-if="showSuggestions && !searching && form.name.trim().length >= 2"
          class="absolute z-20 w-full mt-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
        >
          Tidak ada pelanggan dengan nama tersebut — aman untuk tambah baru.
        </div>
      </div>
      <p v-if="errors.name" class="text-xs text-red-500">{{ errors.name }}</p>
      <div
        v-if="!errors.name && hasExactDuplicate"
        class="flex items-start gap-2 text-xs px-3 py-2 rounded-md bg-amber-50 border border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300"
        role="alert"
      >
        <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span>
          Pelanggan dengan nama yang sama sudah ada ({{ exactDuplicates.length }} data).
          Pastikan bukan duplikat sebelum menyimpan.
        </span>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Telepon</label>
        <input
          v-model="form.phone"
          type="text"
          class="input-field"
          placeholder="0812..."
        />
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
        <input
          v-model="form.email"
          type="email"
          class="input-field"
          :class="{ 'border-red-500': errors.email }"
          placeholder="email@contoh.com"
        />
        <p v-if="errors.email" class="text-xs text-red-500">{{ errors.email }}</p>
      </div>
    </div>

    <div class="space-y-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Alamat</label>
      <textarea
        v-model="form.address"
        class="input-field h-24 resize-none"
        placeholder="Masukkan alamat lengkap"
      ></textarea>
    </div>

    </form>
</template>