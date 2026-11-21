<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import { alertNotify } from '@/utils/alert'

interface Props {
  modelValue: boolean
  initialData?: {
    id?: number
    name: string
    contact: string
    phone: string
    email: string
    address: string
  } | null | undefined
  isEditing: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'success'): void
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
})

const emit = defineEmits<Emits>()

const form = ref({
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: '',
})

const loading = ref(false)
const errors = ref<Record<string, string>>({})

// Autocomplete Nama untuk deteksi duplikat (sama seperti Kelola Pelanggan)
interface PartnerSuggestion {
  id: number
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  address: string | null
}

const suggestions = ref<PartnerSuggestion[]>([])
const showSuggestions = ref(false)
const searching = ref(false)
const highlightedIndex = ref(-1)
const suppressNextSearch = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

const normalizedName = computed(() => (form.value.name || '').trim().toLowerCase())

const exactDuplicates = computed(() =>
  suggestions.value.filter((s) => (s.name || '').trim().toLowerCase() === normalizedName.value)
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
    const res = await api.get(`/partners?${params.toString()}`)
    if (seq !== searchSeq) return
    let data: PartnerSuggestion[] = res.data?.data ?? []
    // Saat edit, jangan tampilkan data dirinya sendiri sebagai duplikat
    if (props.isEditing && props.initialData?.id) {
      data = data.filter((s) => s.id !== props.initialData?.id)
    }
    suggestions.value = data.slice(0, 5)
    showSuggestions.value = true
    highlightedIndex.value = -1
  } catch (error) {
    console.error('Failed to fetch partner suggestions:', error)
    if (seq === searchSeq) {
      suggestions.value = []
      showSuggestions.value = false
    }
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

watch(() => form.value.name, (val) => {
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

const selectSuggestion = (item: PartnerSuggestion) => {
  suppressNextSearch.value = true
  form.value.name = item.name
  // Isi field lain agar user langsung tahu datanya sudah sama
  if (!props.isEditing) {
    form.value.contact = item.contact || form.value.contact
    form.value.phone = item.phone || form.value.phone
    form.value.email = item.email || form.value.email
    form.value.address = item.address || form.value.address
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

watch(() => props.initialData, (data) => {
  suppressNextSearch.value = true
  if (debounceTimer) clearTimeout(debounceTimer)
  searchSeq++
  searching.value = false
  suggestions.value = []
  showSuggestions.value = false
  highlightedIndex.value = -1
  if (data) {
    form.value = {
      name: data.name || '',
      contact: data.contact || '',
      phone: data.phone || '',
      email: data.email || '',
      address: data.address || '',
    }
  } else {
    form.value = { name: '', contact: '', phone: '', email: '', address: '' }
  }
  errors.value = {}
}, { immediate: true, deep: true })

const validate = () => {
  errors.value = {}
  let valid = true
  
  if (!form.value.name.trim()) {
    errors.value.name = 'Nama wajib diisi'
    valid = false
  }
  if (form.value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
    errors.value.email = 'Format email tidak valid'
    valid = false
  }
  return valid
}

const submit = async () => {
  if (!validate()) return
  
  loading.value = true
  try {
    if (props.isEditing && props.initialData?.id) {
      await api.put(`/partners/${props.initialData.id}`, form.value)
      alertNotify.success('Data berhasil diupdate')
    } else {
      await api.post('/partners', form.value)
      alertNotify.success('Data berhasil ditambah')
    }
    emit('success')
  } catch (error: any) {
    if (error.response?.data?.details) {
      Object.entries(error.response.data.details).forEach(([key, msgs]: [string, any]) => {
        errors.value[key] = Array.isArray(msgs) ? msgs[0] : msgs
      })
    } else {
      errors.value.general = error.response?.data?.error || 'Gagal menyimpan data'
    }
  } finally {
    loading.value = false
  }
}

const close = () => {
  emit('update:modelValue', false)
}

defineExpose({ submit })
</script>

<template>
  <div class="space-y-4">
    <div v-if="errors.general" class="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded">
      {{ errors.general }}
    </div>

    <div>
      <label class="label-field">Nama <span class="text-red-500">*</span></label>
      <div class="relative">
        <input
          v-model="form.name"
          type="text"
          class="input-field pr-9"
          :class="{ 'border-red-500': errors.name, 'border-amber-500': !errors.name && hasExactDuplicate }"
          placeholder="Nama mitra"
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
            {{ suggestions.length }} mitra ditemukan — klik untuk lihat detail
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
                v-if="(item.name || '').trim().toLowerCase() === normalizedName"
                class="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              >
                Sama persis
              </span>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
              {{ item.contact || '-' }} • {{ item.phone || '-' }} • {{ item.email || '-' }}
            </div>
          </div>
        </div>

        <!-- Empty state saat mengetik tapi tidak ada hasil -->
        <div
          v-else-if="showSuggestions && !searching && (form.name || '').trim().length >= 2"
          class="absolute z-20 w-full mt-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
        >
          Tidak ada mitra dengan nama tersebut — aman untuk tambah baru.
        </div>
      </div>
      <p v-if="errors.name" class="mt-1 text-sm text-red-500">{{ errors.name }}</p>
      <div
        v-if="!errors.name && hasExactDuplicate"
        class="mt-1 flex items-start gap-2 text-xs px-3 py-2 rounded-md bg-amber-50 border border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300"
        role="alert"
      >
        <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <span>
          Mitra dengan nama yang sama sudah ada ({{ exactDuplicates.length }} data).
          Pastikan bukan duplikat sebelum menyimpan.
        </span>
      </div>
    </div>

    <div>
      <label class="label-field">Kontak Person</label>
      <input
        v-model="form.contact"
        type="text"
        class="input-field"
        placeholder="Nama kontak"
      />
    </div>

    <div>
      <label class="label-field">Telepon</label>
      <input
        v-model="form.phone"
        type="text"
        class="input-field"
        placeholder="Nomor telepon"
      />
    </div>

    <div>
      <label class="label-field">Email</label>
      <input
        v-model="form.email"
        type="email"
        class="input-field"
        :class="{ 'border-red-500': errors.email }"
        placeholder="email@example.com"
      />
      <p v-if="errors.email" class="mt-1 text-sm text-red-500">{{ errors.email }}</p>
    </div>

    <div>
      <label class="label-field">Alamat</label>
      <textarea
        v-model="form.address"
        class="input-field"
        rows="3"
        placeholder="Alamat lengkap"
      ></textarea>
    </div>
  </div>
</template>