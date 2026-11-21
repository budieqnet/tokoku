<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import api from '@/services/api'
import { useProductsStore } from '@/stores/products'
import { alertNotify } from '@/utils/alert'

interface Props {
  initialData?: {
    id?: number
    name: string
    sku: string
    buy_price: number
    price: number
    partner_price: number
    bundle_qty: number
    bundle_price: number
    stock: number
    supplier_id: number | null
    supplier_name: string | null
    purchase_date: string | null
  } | null | undefined
  isEditing: boolean
}

interface Emits {
  (e: 'success'): void
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
})

const productsStore = useProductsStore()

const emit = defineEmits<Emits>()

const form = ref({
  name: '',
  sku: '',
  buy_price: 0,
  price: 0,
  partner_price: 0,
  bundle_qty: 0,
  bundle_price: 0,
  stock: 0,
  supplier_id: null as number | null,
  purchase_date: null as string | null,
})

const suppliers = ref<Array<{ id: number; name: string }>>([])
const loading = ref(false)
const loadingSuppliers = ref(false)
const errors = ref<Record<string, string>>({})

// Autocomplete untuk nama produk (standar sama seperti Pelanggan/Mitra/Pemasok)
interface ProductSuggestion {
  id: number
  name: string
  sku: string | null
}

const productSuggestions = ref<ProductSuggestion[]>([])
const showSuggestions = ref(false)
const suggestionLoading = ref(false)
const highlightedIndex = ref(-1)
const suppressNextSearch = ref(false)
let suggestionDebounce: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

const normalizedName = computed(() => (form.value.name || '').trim().toLowerCase())

const exactDuplicates = computed(() =>
  productSuggestions.value.filter((s) => (s.name || '').trim().toLowerCase() === normalizedName.value)
)

const hasExactDuplicate = computed(() =>
  normalizedName.value.length > 0 && exactDuplicates.value.length > 0
)

const fetchProductSuggestions = async (query: string, seq: number) => {
  if (!query.trim() || query.trim().length < 2) {
    productSuggestions.value = []
    showSuggestions.value = false
    return
  }

  suggestionLoading.value = true
  try {
    const params = new URLSearchParams({
      search: query.trim(),
      limit: '5',
      page: '1',
    })
    const res = await api.get(`/products?${params.toString()}`)
    if (seq !== searchSeq) return
    let data: ProductSuggestion[] = (res.data.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      sku: p.sku ?? null,
    }))
    // Saat edit, jangan tampilkan data dirinya sendiri sebagai duplikat
    if (props.isEditing && props.initialData?.id) {
      data = data.filter((s) => s.id !== props.initialData?.id)
    }
    productSuggestions.value = data.slice(0, 5)
    showSuggestions.value = true
    highlightedIndex.value = -1
  } catch (error) {
    console.error('Failed to fetch product suggestions:', error)
    if (seq === searchSeq) {
      productSuggestions.value = []
      showSuggestions.value = false
    }
  } finally {
    if (seq === searchSeq) suggestionLoading.value = false
  }
}

watch(() => form.value.name, (val) => {
  highlightedIndex.value = -1
  if (suggestionDebounce) clearTimeout(suggestionDebounce)
  if (suppressNextSearch.value) {
    suppressNextSearch.value = false
    suggestionLoading.value = false
    return
  }
  if (!val || val.trim().length < 2) {
    productSuggestions.value = []
    showSuggestions.value = false
    suggestionLoading.value = false
    return
  }
  suggestionLoading.value = true
  suggestionDebounce = setTimeout(() => {
    const seq = ++searchSeq
    fetchProductSuggestions(val, seq)
  }, 300)
})

const getInputValue = (e: Event): string => (e.target as HTMLInputElement).value

const handleNameInput = (e: Event) => {
  form.value.name = getInputValue(e)
}

const selectProductSuggestion = (product: ProductSuggestion) => {
  suppressNextSearch.value = true
  form.value.name = product.name
  if (product.sku && !form.value.sku) {
    form.value.sku = product.sku
  }
  productSuggestions.value = [product]
  showSuggestions.value = false
  highlightedIndex.value = -1
}

const hideSuggestions = () => {
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

const onNameFocus = () => {
  if (productSuggestions.value.length > 0) showSuggestions.value = true
}

const onNameKeydown = (e: KeyboardEvent) => {
  if (!showSuggestions.value || productSuggestions.value.length === 0) {
    if (e.key === 'Escape') showSuggestions.value = false
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightedIndex.value = (highlightedIndex.value + 1) % productSuggestions.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedIndex.value =
      (highlightedIndex.value - 1 + productSuggestions.value.length) % productSuggestions.value.length
  } else if (e.key === 'Enter' && highlightedIndex.value >= 0) {
    e.preventDefault()
    selectProductSuggestion(productSuggestions.value[highlightedIndex.value])
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
  }
}

onBeforeUnmount(() => {
  if (suggestionDebounce) clearTimeout(suggestionDebounce)
  searchSeq++
})

// Currency formatting helpers
const formatCurrency = (value: number): string => {
  if (value === 0 || value === null || value === undefined) return ''
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const parseCurrency = (value: string): number => {
  if (!value) return 0
  const numeric = value.replace(/\./g, '')
  const parsed = parseInt(numeric, 10)
  return isNaN(parsed) ? 0 : parsed
}

const handleCurrencyInput = (field: 'buy_price' | 'price' | 'partner_price', value: string) => {
  form.value[field] = parseCurrency(value)
}

const handleCurrencyInputEvent = (field: 'buy_price' | 'price' | 'partner_price', e: Event) => {
  handleCurrencyInput(field, getInputValue(e))
}

const fetchSuppliers = async () => {
  loadingSuppliers.value = true
  try {
    const res = await api.get('/suppliers?limit=1000')
    suppliers.value = res.data.data.map((s: any) => ({ id: s.id, name: s.name }))
  } catch (error) {
    console.error('Failed to fetch suppliers:', error)
  } finally {
    loadingSuppliers.value = false
  }
}

watch(() => props.initialData, async (data) => {
  if (suppliers.value.length === 0) await fetchSuppliers()

  suppressNextSearch.value = true
  if (suggestionDebounce) clearTimeout(suggestionDebounce)
  searchSeq++
  suggestionLoading.value = false
  productSuggestions.value = []
  showSuggestions.value = false
  highlightedIndex.value = -1
  if (data) {
    form.value = {
      name: data.name || '',
      sku: data.sku || '',
      buy_price: Number(data.buy_price) || 0,
      price: Number(data.price) || 0,
      partner_price: Number(data.partner_price) || 0,
      bundle_qty: Number(data.bundle_qty) || 0,
      bundle_price: Number(data.bundle_price) || 0,
      stock: Number(data.stock) || 0,
      supplier_id: data.supplier_id,
      purchase_date: data.purchase_date || null,
    }
  } else {
    form.value = { name: '', sku: '', buy_price: 0, price: 0, partner_price: 0, bundle_qty: 0, bundle_price: 0, stock: 0, supplier_id: null, purchase_date: null }
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
  if (form.value.price < 0) {
    errors.value.price = 'Harga jual tidak boleh negatif'
    valid = false
  }
  if (form.value.buy_price < 0) {
    errors.value.buy_price = 'Harga beli tidak boleh negatif'
    valid = false
  }
  if (form.value.bundle_qty > 0 && form.value.bundle_price <= 0) {
    errors.value.bundle_price = 'Harga bundle wajib diisi jika qty bundle > 0'
    valid = false
  }
  return valid
}

const submit = async () => {
  if (!validate()) return
  
  loading.value = true
  try {
    const payload = { ...form.value } as Record<string, any>
    if (payload.supplier_id === null) delete payload.supplier_id
    
    let response
    if (props.isEditing && props.initialData?.id) {
      response = await api.put(`/products/${props.initialData.id}`, payload)
      alertNotify.success('Data berhasil diupdate')
    } else {
      response = await api.post('/products', payload)
      alertNotify.success('Data berhasil ditambah')
    }
    
    // Update products store
    if (props.isEditing && props.initialData?.id) {
      productsStore.updateProduct(response.data)
    } else {
      productsStore.addProduct(response.data)
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

defineExpose({ submit })
</script>

<template>
  <div class="space-y-4">
    <div v-if="errors.general" class="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded">
      {{ errors.general }}
    </div>

    <div class="relative">
      <label class="label-field">Nama Produk <span class="text-red-500">*</span></label>
      <div class="relative">
        <input
          :value="form.name"
          @input="handleNameInput($event)"
          @focus="onNameFocus"
          @blur="hideSuggestions"
          @keydown="onNameKeydown"
          type="text"
          class="input-field pr-9"
          :class="{ 'border-red-500': errors.name, 'border-amber-500': !errors.name && hasExactDuplicate }"
          placeholder="Nama produk"
          autocomplete="off"
        />
        <span v-if="suggestionLoading" class="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
          <svg class="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </span>

        <!-- Autocomplete dropdown -->
        <div
          v-if="showSuggestions && productSuggestions.length > 0"
          class="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          <div class="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            {{ productSuggestions.length }} produk ditemukan — klik untuk lihat detail
          </div>
          <div
            v-for="(product, idx) in productSuggestions"
            :key="product.id"
            @mousedown.prevent="selectProductSuggestion(product)"
            class="px-3 py-2 cursor-pointer border-b last:border-b-0 dark:border-gray-700"
            :class="{
              'bg-blue-50 dark:bg-blue-900/30': idx === highlightedIndex,
              'hover:bg-gray-100 dark:hover:bg-gray-700': idx !== highlightedIndex,
            }"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ product.name }}</span>
              <span class="flex shrink-0 items-center gap-1">
                <span v-if="product.sku" class="text-xs text-gray-500 dark:text-gray-400 ml-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                  {{ product.sku }}
                </span>
                <span
                  v-if="(product.name || '').trim().toLowerCase() === normalizedName"
                  class="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                >
                  Sama persis
                </span>
              </span>
            </div>
          </div>
        </div>

        <!-- Empty state saat mengetik tapi tidak ada hasil -->
        <div
          v-else-if="showSuggestions && !suggestionLoading && (form.name || '').trim().length >= 2"
          class="absolute z-20 w-full mt-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
        >
          Tidak ada produk dengan nama tersebut — aman untuk tambah baru.
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
          Produk dengan nama yang sama sudah ada ({{ exactDuplicates.length }} data).
          Pastikan bukan duplikat sebelum menyimpan.
        </span>
      </div>
    </div>

    <div>
      <label class="label-field">SKU / Barcode</label>
      <input
        v-model="form.sku"
        type="text"
        class="input-field"
        placeholder="Kode produk / barcode"
      />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="label-field">Harga Beli</label>
        <input
          :value="formatCurrency(form.buy_price)"
          @input="handleCurrencyInputEvent('buy_price', $event)"
          type="text"
          class="input-field"
          :class="{ 'border-red-500': errors.buy_price }"
          placeholder="0"
          inputmode="numeric"
        />
        <p v-if="errors.buy_price" class="mt-1 text-sm text-red-500">{{ errors.buy_price }}</p>
      </div>

      <div>
        <label class="label-field">Harga Jual <span class="text-red-500">*</span></label>
        <input
          :value="formatCurrency(form.price)"
          @input="handleCurrencyInputEvent('price', $event)"
          type="text"
          class="input-field"
          :class="{ 'border-red-500': errors.price }"
          placeholder="0"
          inputmode="numeric"
        />
        <p v-if="errors.price" class="mt-1 text-sm text-red-500">{{ errors.price }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="label-field">Harga Mitra</label>
        <input
          :value="formatCurrency(form.partner_price)"
          @input="handleCurrencyInputEvent('partner_price', $event)"
          type="text"
          class="input-field"
          placeholder="0"
          inputmode="numeric"
        />
      </div>

      <div>
        <label class="label-field">Stok Awal</label>
        <input
          v-model.number="form.stock"
          type="number"
          class="input-field"
          min="0"
          step="1"
          placeholder="0"
        />
      </div>
    </div>

    <!-- Bundle Section -->
    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Bundle (Qty Discount)</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label-field">Bundle Qty</label>
          <input
            v-model.number="form.bundle_qty"
            type="number"
            class="input-field"
            min="0"
            step="1"
            placeholder="0 = tidak ada bundle"
          />
        </div>
        <div>
          <label class="label-field">Bundle Price</label>
          <input
            v-model.number="form.bundle_price"
            type="number"
            class="input-field"
            :class="{ 'border-red-500': errors.bundle_price }"
            min="0"
            step="100"
            placeholder="0"
          />
          <p v-if="errors.bundle_price" class="mt-1 text-sm text-red-500">{{ errors.bundle_price }}</p>
        </div>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Contoh: Qty=5, Price=14000 berarti beli 5 harga 14.000</p>
    </div>

    <!-- Supplier Section -->
    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Pemasok</h4>
      <div>
        <label class="label-field">Pemasok</label>
        <select
          v-model="form.supplier_id"
          class="input-field"
          :disabled="loadingSuppliers"
        >
          <option value="">-- Pilih Pemasok --</option>
          <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
    </div>

    <!-- Purchase Date Section -->
    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
      <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">Tanggal Beli</h4>
      <div>
        <label class="label-field">Tanggal Beli</label>
        <input
          v-model="form.purchase_date"
          type="date"
          class="input-field"
        />
      </div>
    </div>
  </div>
</template>