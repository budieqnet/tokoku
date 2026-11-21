<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import api from '@/services/api'
import { alertNotify } from '@/utils/alert'

interface Props {
  initialData: {
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
  sku: props.initialData?.sku || '',
  buy_price: Number(props.initialData?.buy_price) || 0,
  price: Number(props.initialData?.price) || 0,
  partner_price: Number(props.initialData?.partner_price) || 0,
  bundle_qty: Number(props.initialData?.bundle_qty) || 0,
  bundle_price: Number(props.initialData?.bundle_price) || 0,
  stock: Number(props.initialData?.stock) || 0,
  supplier_id: props.initialData?.supplier_id || null,
})

const suppliers = ref<any[]>([])
const loading = ref(false)
const errors = ref<Record<string, string>>({})

// Fetch suppliers for dropdown
const fetchSuppliers = async () => {
  try {
    const res = await api.get('/suppliers?limit=100')
    suppliers.value = res.data.data || []
  } catch (error) {
    console.error('Failed to fetch suppliers:', error)
  }
}

// Update form data when initialData changes
watch(() => props.initialData, (newData) => {
  if (newData) {
    form.id = newData.id
    form.name = newData.name || ''
    form.sku = newData.sku || ''
    form.buy_price = Number(newData.buy_price) || 0
    form.price = Number(newData.price) || 0
    form.partner_price = Number(newData.partner_price) || 0
    form.bundle_qty = Number(newData.bundle_qty) || 0
    form.bundle_price = Number(newData.bundle_price) || 0
    form.stock = Number(newData.stock) || 0
    form.supplier_id = newData.supplier_id || null
  }
}, { immediate: true, deep: true })

onMounted(() => {
  fetchSuppliers()
})

const validate = () => {
  errors.value = {}
  if (!form.name) errors.value.name = 'Nama produk wajib diisi'
  if (!form.sku) errors.value.sku = 'SKU wajib diisi'
  if (form.price <= 0) errors.value.price = 'Harga jual harus lebih dari 0'
  if (form.buy_price <= 0) errors.value.buy_price = 'Harga beli harus lebih dari 0'
  return Object.keys(errors.value).length === 0
}

const submit = async () => {
  if (!validate()) return

  loading.value = true
  try {
    const payload = {
      name: form.name,
      sku: form.sku || '',
      buy_price: form.buy_price,
      price: form.price,
      partner_price: form.partner_price,
      bundle_qty: form.bundle_qty,
      bundle_price: form.bundle_price,
      stock: form.stock,
      supplier_id: form.supplier_id,
    }
    if (props.isEditing && form.id) {
      await api.put(`/products/${form.id}`, payload)
    } else {
      await api.post('/products', payload)
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
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nama Produk</label>
        <input
          v-model="form.name"
          type="text"
          class="input-field"
          :class="{ 'border-red-500': errors.name }"
          placeholder="Masukkan nama produk"
        />
        <p v-if="errors.name" class="text-xs text-red-500">{{ errors.name }}</p>
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">SKU</label>
        <input
          v-model="form.sku"
          type="text"
          class="input-field"
          :class="{ 'border-red-500': errors.sku }"
          placeholder="Kode unik produk"
        />
        <p v-if="errors.sku" class="text-xs text-red-500">{{ errors.sku }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Harga Beli</label>
        <input
          v-model.number="form.buy_price"
          type="number"
          class="input-field"
          :class="{ 'border-red-500': errors.buy_price }"
          placeholder="0"
          min="0"
        />
        <p v-if="errors.buy_price" class="text-xs text-red-500">{{ errors.buy_price }}</p>
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Harga Jual</label>
        <input
          v-model.number="form.price"
          type="number"
          class="input-field"
          :class="{ 'border-red-500': errors.price }"
          placeholder="0"
          min="0"
        />
        <p v-if="errors.price" class="text-xs text-red-500">{{ errors.price }}</p>
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Harga Mitra</label>
        <input
          v-model.number="form.partner_price"
          type="number"
          class="input-field"
          placeholder="0"
          min="0"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Bundle Qty</label>
        <input
          v-model.number="form.bundle_qty"
          type="number"
          class="input-field"
          placeholder="0"
          min="0"
        />
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Bundle Price</label>
        <input
          v-model.number="form.bundle_price"
          type="number"
          class="input-field"
          placeholder="0"
          min="0"
        />
      </div>
      <div class="space-y-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Stok</label>
        <input
          v-model.number="form.stock"
          type="number"
          class="input-field"
          placeholder="0"
          min="0"
        />
      </div>
    </div>

    <div class="space-y-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Pemasok</label>
      <select
        v-model="form.supplier_id"
        class="input-field"
      >
        <option value="">-- Pilih Pemasok (Opsional) --</option>
        <option v-for="s in suppliers" :key="s.id" :value="s.id">
          {{ s.name }}
        </option>
      </select>
    </div>

    <div class="flex justify-end gap-3 pt-4">
      <button type="button" @click="$emit('close')" class="btn-secondary">Batal</button>
      <button type="submit" :disabled="loading" class="btn-primary">
        <span v-if="loading">Menyimpan...</span>
        <span v-else>{{ isEditing ? 'Update Produk' : 'Simpan Produk' }}</span>
      </button>
    </div>
  </form>
</template>