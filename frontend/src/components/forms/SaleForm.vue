<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import api from '@/services/api'
import { useProductsStore } from '@/stores/products'

interface Props {
  modelValue: boolean
  initialData?: {
    id?: number
    product_id: number | null
    package_id?: number | null
    product_name: string
    sku: string
    qty: number
    price: number
    subtotal: number
    customer_id: number | null
    customer_name: string | null
    customer_type: 'pelanggan' | 'mitra' | 'umum'
    partner_id: number | null
    sale_date: string
    notes: string
    payment_method?: 'cash' | 'transfer' | 'partner_savings'
  } | null | undefined
  isEditing: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'success', saleId: number | null): void
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
})

const emit = defineEmits<Emits>()

const productsStore = useProductsStore()

const form = ref({
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

interface PackageOption {
  id: number
  name: string
  price: number
  items: Array<{ product_id: number; qty: number; product_name: string; stock: number }>
}

const saleType = ref<'product' | 'package'>('product')
const packages = ref<PackageOption[]>([])

const products = ref<Array<{ id: number; name: string; sku: string | null; price: number; partner_price: number }>>([])
const customers = ref<Array<{ id: number; name: string }>>([])
const partners = ref<Array<{ id: number; name: string }>>([])
const loading = ref(false)
const loadingRefs = ref(false)
const errors = ref<Record<string, string>>({})

const selectedPackage = computed(() =>
  packages.value.find((pkg) => pkg.id === form.value.package_id) || null
)

const packageAvailableStock = computed(() => {
  const pkg = selectedPackage.value
  if (!pkg || pkg.items.length === 0) return 0
  const current = Math.min(...pkg.items.map((item) => Math.floor(Number(item.stock) / Math.max(Number(item.qty) || 1, 1))))
  // When editing the same package, its previous quantity will be restored by the backend.
  if (props.isEditing && props.initialData?.package_id === form.value.package_id) {
    return current + (Number(props.initialData.qty) || 0)
  }
  return current
})

// Autocomplete nama produk (standar sama seperti Pembelian)
const showProductDropdown = ref(false)
const highlightedProductIndex = ref(-1)
const filteredProducts = computed(() => {
  const query = (form.value.product_name || '').trim().toLowerCase()
  if (!query) return products.value.slice(0, 5)
  return products.value.filter(p =>
    p.name.toLowerCase().includes(query) ||
    (p.sku && p.sku.toLowerCase().includes(query))
  ).slice(0, 5)
})

const fetchRefs = async () => {
  loadingRefs.value = true
  try {
    const [productsRes, customersRes, partnersRes, packagesRes] = await Promise.all([
      productsStore.fetchForSelect(),
      api.get('/customers?limit=1000'),
      api.get('/partners?limit=1000'),
      api.get('/packages?limit=1000'),
    ])
    products.value = productsRes.map((p: any) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: Number(p.price),
      partner_price: Number(p.partner_price),
    }))
    packages.value = packagesRes.data.data.map((pkg: any) => ({
      id: pkg.id,
      name: pkg.name,
      price: Number(pkg.price),
      items: (pkg.items || []).map((item: any) => ({
        product_id: item.product_id,
        qty: Number(item.qty),
        product_name: item.product_name,
        stock: Number(item.stock),
      })),
    }))
    customers.value = customersRes.data.data.map((c: any) => ({ id: c.id, name: c.name }))
    partners.value = partnersRes.data.data.map((p: any) => ({ id: p.id, name: p.name }))
  } catch (error) {
    console.error('Failed to fetch refs:', error)
  } finally {
    loadingRefs.value = false
  }
}

const handleProductNameInput = () => {
  showProductDropdown.value = true
  highlightedProductIndex.value = -1
  // Sinkron: jika ketikan tidak cocok produk mana pun, anggap manual (lepas product_id)
  const typed = (form.value.product_name || '').trim().toLowerCase()
  const match = products.value.find(p => p.name.toLowerCase() === typed)
  if (!match) {
    form.value.product_id = null
  }
}

const handleProductNameBlur = () => {
  // Delay agar klik pada dropdown sempat diproses
  setTimeout(() => {
    showProductDropdown.value = false
  }, 200)
}

const handleCustomerChange = () => {
  const selected = customers.value.find(c => c.id === form.value.customer_id)
  if (selected) {
    form.value.customer_name = selected.name
  } else {
    form.value.customer_name = ''
  }
}

const handleProductNameKeydown = (e: KeyboardEvent) => {
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
    selectProductSuggestion(filteredProducts.value[highlightedProductIndex.value])
  } else if (e.key === 'Escape') {
    showProductDropdown.value = false
  }
}

const selectProductSuggestion = (p: { id: number; name: string; sku: string | null; price: number; partner_price: number }) => {
  form.value.product_id = p.id
  form.value.package_id = null
  form.value.product_name = p.name
  form.value.sku = p.sku || ''
  form.value.price = form.value.customer_type === 'mitra' ? p.partner_price : p.price
  updateSubtotal()
  showProductDropdown.value = false
  highlightedProductIndex.value = -1
}

const setSaleType = (type: 'product' | 'package') => {
  if (saleType.value === type) return
  saleType.value = type
  form.value.product_id = null
  form.value.package_id = null
  form.value.product_name = ''
  form.value.sku = ''
  form.value.qty = 1
  form.value.price = 0
  form.value.subtotal = 0
  errors.value = {}
}

const handlePackageChange = () => {
  const pkg = selectedPackage.value
  if (!pkg) {
    form.value.product_name = ''
    form.value.sku = ''
    form.value.price = 0
    form.value.subtotal = 0
    return
  }
  form.value.product_id = null
  form.value.product_name = pkg.name
  form.value.sku = ''
  form.value.price = pkg.price
  updateSubtotal()
}

const updateSubtotal = () => {
  form.value.subtotal = form.value.qty * form.value.price
}

const handleCustomerTypeChange = () => {
  if (saleType.value === 'package') return
  const selected = products.value.find(p => p.id === form.value.product_id)
  if (selected) {
    form.value.price = form.value.customer_type === 'mitra' ? selected.partner_price : selected.price
    updateSubtotal()
  }
}

watch(() => props.initialData, (data) => {
  showProductDropdown.value = false
  highlightedProductIndex.value = -1
  if (data) {
    saleType.value = data.package_id ? 'package' : 'product'
    form.value = {
      product_id: data.product_id,
      package_id: data.package_id ?? null,
      product_name: data.product_name || '',
      sku: data.sku || '',
      qty: Number(data.qty) || 1,
      price: Number(data.price) || 0,
      subtotal: Number(data.subtotal) || 0,
      customer_id: data.customer_id,
      customer_name: data.customer_name || '',
      customer_type: data.customer_type || 'umum',
      partner_id: data.partner_id,
      sale_date: data.sale_date || new Date().toISOString().split('T')[0],
      notes: data.notes || '',
      payment_method: data.payment_method || 'cash',
    }
  } else {
    saleType.value = 'product'
    form.value = {
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
  }
  errors.value = {}
  // Load reference data in the background so it cannot overwrite user input.
  void fetchRefs()
}, { immediate: true, deep: true })

const validate = () => {
  errors.value = {}
  let valid = true
  
  if (saleType.value === 'package') {
    if (!form.value.package_id) {
      errors.value.package_id = 'Paket wajib dipilih'
      valid = false
    } else if (form.value.qty > packageAvailableStock.value) {
      errors.value.qty = `Stok paket tidak mencukupi. Tersedia: ${packageAvailableStock.value}`
      valid = false
    }
  } else if (!form.value.product_name.trim()) {
    errors.value.product_name = 'Nama produk wajib diisi'
    valid = false
  }
  if (form.value.qty <= 0) {
    errors.value.qty = 'Qty harus lebih dari 0'
    valid = false
  }
  if (form.value.price < 0) {
    errors.value.price = 'Harga tidak boleh negatif'
    valid = false
  }
  return valid
}

const submit = async () => {
  if (!validate()) return
  
  loading.value = true
  try {
    const payload = { ...form.value } as Record<string, any>
    if (saleType.value === 'package') {
      delete payload.product_id
    } else {
      delete payload.package_id
      if (payload.product_id === null) delete payload.product_id
    }
    if (payload.customer_id === null) delete payload.customer_id
    if (payload.partner_id === null) delete payload.partner_id
    
    let saleId: number | null = null
    
    if (props.isEditing && props.initialData?.id) {
      await api.put(`/sales/${props.initialData.id}`, payload)
      saleId = props.initialData.id
    } else {
      const response = await api.post('/sales', payload)
      saleId = response.data.id
    }

    // Stock is adjusted atomically by the backend (including package components).
    // Refresh the local product store so stock displays stay accurate.
    try {
      await productsStore.fetchForSelect()
    } catch (err) {
      console.error('Failed to refresh product stock:', err)
    }
    
    // Emit success with saleId for receipt handling
    emit('success', saleId)
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
      <label class="label-field">Jenis Penjualan</label>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          @click="setSaleType('product')"
          class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
          :class="saleType === 'product'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'"
        >
          Produk
        </button>
        <button
          type="button"
          @click="setSaleType('package')"
          class="px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
          :class="saleType === 'package'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'"
        >
          Paket
        </button>
      </div>
    </div>

    <div v-if="saleType === 'package'">
      <label class="label-field">Paket <span class="text-red-500">*</span></label>
      <select
        v-model="form.package_id"
        class="input-field"
        :class="{ 'border-red-500': errors.package_id }"
        :disabled="loadingRefs"
        aria-label="Pilih paket"
        @change="handlePackageChange"
      >
        <option :value="null">-- Pilih Paket --</option>
        <option v-for="pkg in packages" :key="pkg.id" :value="pkg.id">
          {{ pkg.name }} — Rp {{ Number(pkg.price).toLocaleString('id-ID') }}
        </option>
      </select>
      <p v-if="errors.package_id" class="mt-1 text-sm text-red-500">{{ errors.package_id }}</p>

      <div v-if="selectedPackage" class="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm">
        <p class="font-medium text-gray-900 dark:text-white mb-1">Komposisi Paket</p>
        <div class="text-gray-600 dark:text-gray-400 space-y-0.5">
          <div v-for="item in selectedPackage.items" :key="item.product_id">
            {{ item.qty }}× {{ item.product_name }}
          </div>
        </div>
        <p class="mt-2 text-xs" :class="packageAvailableStock <= 5 ? 'text-red-600 font-medium' : 'text-gray-500 dark:text-gray-400'">
          Stok paket tersedia: {{ packageAvailableStock }}
        </p>
      </div>
      <p v-if="!loadingRefs && packages.length === 0" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Belum ada paket. Tambahkan paket terlebih dahulu di menu Paket.
      </p>
    </div>

    <div v-if="saleType === 'product'" class="relative">
      <label class="label-field">Nama Produk <span class="text-red-500">*</span></label>
      <input
        v-model="form.product_name"
        @input="handleProductNameInput"
        @focus="handleProductNameInput"
        @blur="handleProductNameBlur"
        @keydown="handleProductNameKeydown"
        type="text"
        class="input-field"
        :class="{ 'border-red-500': errors.product_name }"
        placeholder="Ketik nama produk atau SKU"
        autocomplete="off"
      />
      <!-- Autocomplete produk -->
      <div
        v-if="showProductDropdown && filteredProducts.length > 0"
        class="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto"
      >
        <div class="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
          {{ filteredProducts.length }} produk ditemukan — klik untuk pilih:
        </div>
        <div
          v-for="(p, idx) in filteredProducts"
          :key="p.id"
          @mousedown.prevent="selectProductSuggestion(p)"
          class="px-3 py-2 cursor-pointer border-b last:border-b-0 dark:border-gray-700"
          :class="{
            'bg-blue-50 dark:bg-blue-900/30': idx === highlightedProductIndex,
            'hover:bg-gray-100 dark:hover:bg-gray-700': idx !== highlightedProductIndex,
          }"
        >
          <div class="font-medium text-sm text-gray-900 dark:text-white truncate">{{ p.name }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <span v-if="p.sku">SKU: {{ p.sku }}</span>
            <span>Rp {{ Number(p.price).toLocaleString('id-ID') }}</span>
          </div>
        </div>
      </div>
      <div
        v-else-if="showProductDropdown && (form.product_name || '').trim().length >= 2"
        class="absolute z-20 w-full mt-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
      >
        Tidak ada produk cocok — akan disimpan sebagai nama manual.
      </div>
      <p v-if="errors.product_name" class="mt-1 text-sm text-red-500">{{ errors.product_name }}</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
      <div v-if="saleType === 'product'">
        <label class="label-field">SKU</label>
        <input v-model="form.sku" type="text" class="input-field" placeholder="SKU / Barcode" />
      </div>
      <div>
        <label class="label-field">{{ saleType === 'package' ? 'Jumlah Paket' : 'Qty' }} <span class="text-red-500">*</span></label>
        <input
          v-model.number="form.qty"
          type="number"
          class="input-field"
          :class="{ 'border-red-500': errors.qty }"
          :aria-label="saleType === 'package' ? 'Jumlah paket' : 'Qty'"
          min="1"
          step="1"
          @input="updateSubtotal"
        />
        <p v-if="errors.qty" class="mt-1 text-sm text-red-500">{{ errors.qty }}</p>
      </div>
      <div>
        <label class="label-field">Harga <span class="text-red-500">*</span></label>
        <input
          v-model.number="form.price"
          type="number"
          class="input-field"
          :class="{ 'border-red-500': errors.price, 'bg-gray-100 dark:bg-gray-800': saleType === 'package' }"
          min="0"
          step="100"
          :readonly="saleType === 'package'"
          @input="updateSubtotal"
        />
        <p v-if="errors.price" class="mt-1 text-sm text-red-500">{{ errors.price }}</p>
      </div>
      <div>
        <label class="label-field">Subtotal</label>
        <input
          v-model.number="form.subtotal"
          type="number"
          class="input-field bg-gray-100 dark:bg-gray-800"
          readonly
        />
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label class="label-field">Tipe Pelanggan</label>
        <select v-model="form.customer_type" class="input-field" @change="handleCustomerTypeChange">
          <option value="umum">Umum</option>
          <option value="pelanggan">Pelanggan Terdaftar</option>
          <option value="mitra">Mitra</option>
        </select>
      </div>
      <div v-if="form.customer_type === 'pelanggan'">
        <label class="label-field">Pelanggan</label>
        <select v-model="form.customer_id" class="input-field" :disabled="loadingRefs" @change="handleCustomerChange">
          <option value="">-- Pilih Pelanggan --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div v-if="form.customer_type === 'mitra'">
        <label class="label-field">Mitra</label>
        <select v-model="form.partner_id" class="input-field" :disabled="loadingRefs">
          <option value="">-- Pilih Mitra --</option>
          <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="label-field">Metode Pembayaran</label>
        <select v-model="form.payment_method" class="input-field">
          <option value="cash">Tunai</option>
          <option value="transfer">Transfer</option>
          <option value="partner_savings">Tabungan Mitra</option>
        </select>
        <p v-if="form.payment_method === 'partner_savings' && form.customer_type !== 'mitra'" class="mt-1 text-sm text-red-500">
          Pilih tipe pelanggan "Mitra" untuk menggunakan tabungan
        </p>
      </div>
      <div v-if="form.payment_method === 'partner_savings' && form.customer_type === 'mitra'" class="sm:col-span-2">
        <label class="label-field">Saldo Tabungan Mitra</label>
        <div class="input-field bg-gray-100 dark:bg-gray-800 flex items-center justify-between px-4 py-2" style="min-height: 44px;">
          <span class="text-gray-500">Pilih mitra di atas untuk melihat saldo</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="label-field">Tanggal <span class="text-red-500">*</span></label>
        <input
          v-model="form.sale_date"
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