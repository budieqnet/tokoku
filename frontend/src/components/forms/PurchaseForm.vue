<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import api from '@/services/api'
import { useProductsStore } from '@/stores/products'

interface Props {
  modelValue: boolean
  initialData?: {
    id?: number
    product_id: number | null
    product_name: string
    sku: string
    qty: number
    price: number
    supplier_id: number | null
    supplier_name: string | null
    purchase_date: string
    notes: string
    payment_method?: 'cash' | 'transfer' | 'partner_savings'
    partner_id?: number | null
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

const productsStore = useProductsStore()

const form = ref({
  product_id: null as number | null,
  product_name: '',
  sku: '',
  qty: 1,
  buy_price: 0,
  supplier_id: null as number | null,
  supplier_name: '',
  purchase_date: new Date().toISOString().split('T')[0],
  notes: '',
  payment_method: 'cash' as 'cash' | 'transfer' | 'partner_savings',
  partner_id: null as number | null,
})

const products = ref<Array<{ id: number; name: string; sku: string | null; price: number; buy_price: number; stock: number; supplier_id: number | null; supplier_name: string | null }>>([])
const suppliers = ref<Array<{ id: number; name: string }>>([])
const partners = ref<Array<{ id: number; name: string }>>([])
const loading = ref(false)
const loadingRefs = ref(false)
const errors = ref<Record<string, string>>({})

// Product search for existing products (for reference/suggestion)
const productSearch = ref('')
const showProductDropdown = ref(false)
const highlightedProductIndex = ref(-1)
const filteredProducts = computed(() => {
  const query = (productSearch.value || form.value.product_name || '').toLowerCase()
  if (!query) return products.value.slice(0, 5)
  return products.value.filter(p =>
    p.name.toLowerCase().includes(query) ||
    (p.sku && p.sku.toLowerCase().includes(query))
  ).slice(0, 5)
})

// Check if user is creating a new product (not selecting existing)
const isNewProduct = computed(() => !form.value.product_id && form.value.product_name.trim() !== '')

// Formatted Harga Beli for currency input display
const formattedBuyPrice = computed({
  get: () => {
    const val = form.value.buy_price
    if (val === 0 || val === null || val === undefined) return ''
    return Number(val).toLocaleString('id-ID')
  },
  set: (value: string) => {
    // Remove non-numeric characters except digits
    const numeric = value.replace(/[^\d]/g, '')
    form.value.buy_price = numeric ? Number(numeric) : 0
  }
})

const fetchRefs = async () => {
  loadingRefs.value = true
  try {
    const [productsRes, suppliersRes, partnersRes] = await Promise.all([
      api.get('/products?limit=1000'),
      api.get('/suppliers?limit=1000'),
      api.get('/partners?limit=1000'),
    ])
    products.value = productsRes.data.data.map((p: any) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: Number(p.price),
      buy_price: Number(p.buy_price),
      stock: Number(p.stock),
      supplier_id: p.supplier_id,
      supplier_name: p.supplier_name,
    }))
    suppliers.value = suppliersRes.data.data.map((s: any) => ({ id: s.id, name: s.name }))
    partners.value = partnersRes.data.data.map((p: any) => ({ id: p.id, name: p.name }))
  } catch (error) {
    console.error('Failed to fetch refs:', error)
  } finally {
    loadingRefs.value = false
  }
}

// Watch supplier_id to auto-populate supplier_name
watch(() => form.value.supplier_id, (newSupplierId) => {
  if (newSupplierId) {
    const selectedSupplier = suppliers.value.find(s => s.id === newSupplierId)
    if (selectedSupplier) {
      form.value.supplier_name = selectedSupplier.name
    }
  } else {
    form.value.supplier_name = ''
  }
})

const handleProductChange = () => {
  const selected = products.value.find(p => p.id === form.value.product_id)
  if (selected) {
    form.value.product_name = selected.name
    form.value.sku = selected.sku || ''
    form.value.buy_price = selected.buy_price
  }
}

const selectProduct = (product: { id: number; name: string; sku: string | null; buy_price: number; supplier_id: number | null; supplier_name: string | null }) => {
  form.value.product_id = product.id
  form.value.product_name = product.name
  form.value.sku = product.sku || ''
  form.value.buy_price = product.buy_price
  form.value.supplier_id = product.supplier_id
  form.value.supplier_name = product.supplier_name || ''
  productSearch.value = product.name
  highlightedProductIndex.value = -1
  showProductDropdown.value = false
}

const handleProductInput = () => {
  productSearch.value = form.value.product_name
  showProductDropdown.value = true
  highlightedProductIndex.value = -1
  // Clear product_id if user types new name not in list
  const match = products.value.find(p => p.name.toLowerCase() === (form.value.product_name || '').toLowerCase())
  if (!match) {
    form.value.product_id = null
    form.value.sku = ''
    form.value.buy_price = 0
    form.value.supplier_id = null
    form.value.supplier_name = ''
  }
}

const handleProductKeydown = (e: KeyboardEvent) => {
  if (!showProductDropdown.value || filteredProducts.value.length === 0) {
    if (e.key === 'Escape') showProductDropdown.value = false
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightedProductIndex.value = (highlightedProductIndex.value + 1) % filteredProducts.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightedProductIndex.value =
      (highlightedProductIndex.value - 1 + filteredProducts.value.length) % filteredProducts.value.length
  } else if (e.key === 'Enter' && highlightedProductIndex.value >= 0) {
    e.preventDefault()
    selectProduct(filteredProducts.value[highlightedProductIndex.value])
  } else if (e.key === 'Escape') {
    showProductDropdown.value = false
  }
}

const handleProductBlur = () => {
  // Delay to allow click on dropdown item
  setTimeout(() => {
    showProductDropdown.value = false
  }, 200)
}

watch(() => props.initialData, async (data) => {
  if (products.value.length === 0) await fetchRefs()
  
  if (data) {
    // Convert ISO datetime to YYYY-MM-DD for date input
    const formatDate = (dateStr: string | null | undefined) => {
      if (!dateStr) return new Date().toISOString().split('T')[0]
      return dateStr.split('T')[0]
    }
    
    form.value = {
      product_id: data.product_id,
      product_name: data.product_name || '',
      sku: data.sku || '',
      qty: Number(data.qty) || 1,
      buy_price: Number(data.price) || 0, // use price as buy_price for edit
      supplier_id: data.supplier_id,
      supplier_name: data.supplier_name || '',
      purchase_date: formatDate(data.purchase_date),
      notes: data.notes || '',
      payment_method: data.payment_method || 'cash',
      partner_id: data.partner_id || null,
    }
    // Set autocomplete search value for edit mode
    productSearch.value = data.product_name || ''
  } else {
    form.value = { product_id: null, product_name: '', sku: '', qty: 1, buy_price: 0, supplier_id: null, supplier_name: '', purchase_date: new Date().toISOString().split('T')[0], notes: '', payment_method: 'cash', partner_id: null }
  }
  errors.value = {}
}, { immediate: true, deep: true })

const validate = () => {
  errors.value = {}
  let valid = true
  
  if (!form.value.product_name.trim()) {
    errors.value.product_name = 'Nama produk wajib diisi'
    valid = false
  }
  if (form.value.qty <= 0) {
    errors.value.qty = 'Qty harus lebih dari 0'
    valid = false
  }
  if (form.value.buy_price < 0) {
    errors.value.buy_price = 'Harga beli tidak boleh negatif'
    valid = false
  }
  return valid
}

const submit = async () => {
  if (!validate()) return
  
  loading.value = true
  try {
    let productId = form.value.product_id
    
    // If creating new product (no product_id but has product_name)
    if (!productId && form.value.product_name.trim()) {
      const trimmedName = form.value.product_name.trim()
      const trimmedSku = (form.value.sku || '').trim()
      // Check if product already exists by name or SKU (reuse to avoid 409)
      const existingProduct =
        products.value.find(p => p.name.toLowerCase() === trimmedName.toLowerCase()) ||
        (trimmedSku ? products.value.find(p => (p.sku || '').toLowerCase() === trimmedSku.toLowerCase()) : undefined)

      if (existingProduct) {
        productId = existingProduct.id
      } else {
        // Create new product via API
        // NOTE: jangan kirim null untuk field optional (zod optional() menolak null)
        const productPayload: Record<string, any> = {
          name: trimmedName,
          buy_price: Number(form.value.buy_price) || 0,
          price: 0, // will be set in Products feature
          partner_price: 0,
          bundle_qty: 0,
          bundle_price: 0,
          stock: 0, // will be updated by purchase
        }
        if (trimmedSku) productPayload.sku = trimmedSku
        if (form.value.supplier_id) {
          productPayload.supplier_id = form.value.supplier_id
          if (form.value.supplier_name) productPayload.supplier_name = form.value.supplier_name
        }
        
        console.log('[PurchaseForm] Creating new product:', productPayload)
        const productResponse = await api.post('/products', productPayload)
        console.log('[PurchaseForm] Product created:', productResponse.data)
        productId = productResponse.data.id
        
        // Add to products store for real-time update
        productsStore.addProduct(productResponse.data)
      }
    }
    
    // Now create purchase with product_id
    const payload = { ...form.value } as Record<string, any>
    payload.product_id = productId
    payload.price = payload.buy_price // map buy_price to price for purchase API
    delete payload.buy_price // not needed for purchase API
    if (payload.supplier_id === null) delete payload.supplier_id
    if (payload.customer_id === null) delete payload.customer_id
    
    console.log('[PurchaseForm] Creating purchase:', payload)
    let response
    if (props.isEditing && props.initialData?.id) {
      response = await api.put(`/purchases/${props.initialData.id}`, payload)
    } else {
      response = await api.post('/purchases', payload)
    }
    console.log('[PurchaseForm] Purchase created:', response.data)
    
    // Update products store stock in real-time
    if (productId) {
      const qty = Number(form.value.qty) || 0
      if (props.isEditing && props.initialData?.product_id) {
        // For edit: calculate difference
        const oldQty = Number(props.initialData.qty) || 0
        const diff = qty - oldQty
        if (diff !== 0) {
          productsStore.updateStock(productId, diff)
        }
      } else {
        // For create: add stock
        productsStore.updateStock(productId, qty)
      }
    }
    
    emit('success')
  } catch (error: any) {
    console.error('[PurchaseForm] Submit error:', error)
    console.error('[PurchaseForm] Error response:', error.response?.data)
    console.error('[PurchaseForm] Error status:', error.response?.status)
    
    if (error.response?.data?.details) {
      Object.entries(error.response.data.details).forEach(([key, msgs]: [string, any]) => {
        errors.value[key] = Array.isArray(msgs) ? msgs[0] : msgs
      })
    } else if (error.response?.data?.error) {
      errors.value.general = error.response.data.error
    } else if (error.message) {
      errors.value.general = error.message
    } else {
      errors.value.general = 'Gagal menyimpan data: ' + JSON.stringify(error)
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

    <div class="relative">
      <label class="label-field">Nama Produk <span class="text-red-500">*</span></label>
      <input
        v-model="form.product_name"
        @input="handleProductInput"
        @focus="handleProductInput"
        @blur="handleProductBlur"
        @keydown="handleProductKeydown"
        type="text"
        class="input-field"
        :class="{ 'border-red-500': errors.product_name }"
        placeholder="Ketik nama produk (baru atau existing)"
        autocomplete="off"
      />
      <!-- Existing Products Suggestion Dropdown -->
      <div
        v-if="showProductDropdown && filteredProducts.length > 0"
        class="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto"
      >
        <div class="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
          {{ filteredProducts.length }} produk ditemukan — klik untuk pilih (atau ketik nama baru):
        </div>
        <div
          v-for="(p, idx) in filteredProducts"
          :key="p.id"
          @click="selectProduct(p)"
          @mousedown.prevent
          class="px-3 py-2 cursor-pointer border-b last:border-b-0 dark:border-gray-700"
          :class="{
            'bg-blue-50 dark:bg-blue-900/30': idx === highlightedProductIndex,
            'hover:bg-gray-100 dark:hover:bg-gray-700': idx !== highlightedProductIndex,
          }"
        >
          <div class="font-medium text-sm text-gray-900 dark:text-white truncate">{{ p.name }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <span v-if="p.sku">SKU: {{ p.sku }}</span>
            <span>Stok: {{ p.stock }}</span>
            <span>Harga Beli: Rp {{ Number(p.buy_price).toLocaleString('id-ID') }}</span>
          </div>
        </div>
      </div>
      <div
        v-else-if="showProductDropdown && (form.product_name || '').trim().length >= 2"
        class="absolute z-20 w-full mt-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
      >
        Tidak ada produk cocok — akan dibuat sebagai produk baru saat disimpan.
      </div>
      <p v-if="errors.product_name" class="mt-1 text-sm text-red-500">{{ errors.product_name }}</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label class="label-field">SKU</label>
        <input v-model="form.sku" type="text" class="input-field" placeholder="SKU / Barcode" />
      </div>
      <div>
        <label class="label-field">Qty <span class="text-red-500">*</span></label>
        <input
          v-model.number="form.qty"
          type="number"
          class="input-field"
          :class="{ 'border-red-500': errors.qty }"
          min="1"
          step="1"
        />
        <p v-if="errors.qty" class="mt-1 text-sm text-red-500">{{ errors.qty }}</p>
      </div>
      <div>
        <label class="label-field">Harga Beli <span class="text-red-500">*</span></label>
        <input
          v-model="formattedBuyPrice"
          type="text"
          class="input-field"
          :class="{ 'border-red-500': errors.buy_price }"
          placeholder="Contoh: 10000"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <p v-if="errors.buy_price" class="mt-1 text-sm text-red-500">{{ errors.buy_price }}</p>
      </div>
    </div>

    <div>
      <label class="label-field">Pemasok</label>
      <select v-model="form.supplier_id" class="input-field" :disabled="loadingRefs">
        <option value="">-- Pilih Pemasok --</option>
        <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <p v-if="errors.supplier_id" class="mt-1 text-sm text-red-500">{{ errors.supplier_id }}</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="label-field">Metode Pembayaran</label>
        <select v-model="form.payment_method" class="input-field">
          <option value="cash">Tunai</option>
          <option value="transfer">Transfer</option>
          <option value="partner_savings">Tabungan Mitra</option>
        </select>
        <p v-if="form.payment_method === 'partner_savings'" class="mt-1 text-sm text-red-500">
          Pilih mitra di bawah untuk menggunakan tabungan
        </p>
      </div>
      <div v-if="form.payment_method === 'partner_savings'" class="sm:col-span-2">
        <label class="label-field">Mitra (untuk tabungan)</label>
        <select v-model="form.partner_id" class="input-field" :disabled="loadingRefs">
          <option value="">-- Pilih Mitra --</option>
          <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <p v-if="errors.partner_id" class="mt-1 text-sm text-red-500">{{ errors.partner_id }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="label-field">Tanggal <span class="text-red-500">*</span></label>
        <input
          v-model="form.purchase_date"
          type="date"
          class="input-field"
          max="9999-12-31"
        />
      </div>
    </div>

    <div>
      <label class="label-field">Catatan</label>
      <textarea v-model="form.notes" class="input-field" rows="2" placeholder="Catatan tambahan"></textarea>
    </div>
  </div>
</template>