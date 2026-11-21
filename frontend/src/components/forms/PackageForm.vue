<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import api from '@/services/api'

interface Props {
  modelValue: boolean
  initialData?: {
    id?: number
    name: string
    price: number
    items: Array<{ product_id: number; qty: number }>
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
  price: 0,
  items: [] as Array<{ product_id: number; qty: number; temp_id: number }>,
})

const products = ref<Array<{ id: number; name: string; sku: string | null; price: number; stock: number }>>([])
const loading = ref(false)
const loadingRefs = ref(false)
const errors = ref<Record<string, string>>({})
let nextTempId = 0

const fetchProducts = async () => {
  loadingRefs.value = true
  try {
    const res = await api.get('/products?limit=1000')
    products.value = res.data.data.map((p: any) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: Number(p.price),
      stock: Number(p.stock),
    }))
  } catch (error) {
    console.error('Failed to fetch products:', error)
  } finally {
    loadingRefs.value = false
  }
}

const addItem = () => {
  form.value.items.push({ product_id: 0, qty: 1, temp_id: nextTempId++ })
}

const removeItem = (tempId: number) => {
  form.value.items = form.value.items.filter(item => item.temp_id !== tempId)
}

const validate = () => {
  errors.value = {}
  let valid = true
  
  if (!form.value.name.trim()) {
    errors.value.name = 'Nama paket wajib diisi'
    valid = false
  }
  if (form.value.price < 0) {
    errors.value.price = 'Harga tidak boleh negatif'
    valid = false
  }
  if (form.value.items.length === 0) {
    errors.value.items = 'Minimal 1 produk wajib ditambahkan'
    valid = false
  }
  form.value.items.forEach((item, index) => {
    if (!item.product_id) {
      errors.value[`item_${index}_product`] = 'Produk wajib dipilih'
      valid = false
    }
    if (item.qty <= 0) {
      errors.value[`item_${index}_qty`] = 'Qty harus > 0'
      valid = false
    }
  })
  return valid
}

const submit = async () => {
  if (!validate()) return
  
  loading.value = true
  try {
    const payload = {
      name: form.value.name,
      price: form.value.price,
      items: form.value.items.map(item => ({
        product_id: item.product_id,
        qty: item.qty,
      })),
    }
    
    if (props.isEditing && props.initialData?.id) {
      await api.put(`/packages/${props.initialData.id}`, payload)
    } else {
      await api.post('/packages', payload)
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

watch(() => props.initialData, async (data) => {
  if (products.value.length === 0) await fetchProducts()
  
  if (data) {
    form.value = {
      name: data.name || '',
      price: Number(data.price) || 0,
      items: data.items.map((item: any, index: number) => ({
        product_id: item.product_id,
        qty: Number(item.qty) || 1,
        temp_id: nextTempId++,
      })),
    }
  } else {
    form.value = { name: '', price: 0, items: [] }
    nextTempId = 0
  }
  errors.value = {}
}, { immediate: true, deep: true })

defineExpose({ submit })
</script>

<template>
  <div class="space-y-4">
    <div v-if="errors.general" class="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded">
      {{ errors.general }}
    </div>

    <div>
      <label class="label-field">Nama Paket <span class="text-red-500">*</span></label>
      <input
        v-model="form.name"
        type="text"
        class="input-field"
        :class="{ 'border-red-500': errors.name }"
        placeholder="Nama paket"
      />
      <p v-if="errors.name" class="mt-1 text-sm text-red-500">{{ errors.name }}</p>
    </div>

    <div>
      <label class="label-field">Harga Jual Paket <span class="text-red-500">*</span></label>
      <input
        v-model.number="form.price"
        type="number"
        class="input-field"
        :class="{ 'border-red-500': errors.price }"
        min="0"
        step="100"
        placeholder="0"
      />
      <p v-if="errors.price" class="mt-1 text-sm text-red-500">{{ errors.price }}</p>
    </div>

    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">Komposisi Paket</h4>
        <button @click="addItem" class="btn-primary text-sm" :disabled="loadingRefs">+ Tambah Produk</button>
      </div>

      <div v-if="errors.items" class="mb-3 text-sm text-red-500">{{ errors.items }}</div>

      <div v-for="item in form.items" :key="item.temp_id" class="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded">
        <div class="sm:col-span-2">
          <label class="label-field">Produk <span class="text-red-500">*</span></label>
          <select
            v-model="item.product_id"
            class="input-field"
            :class="{ 'border-red-500': errors[`item_${form.items.indexOf(item)}_product`] }"
            :disabled="loadingRefs"
          >
            <option value="">-- Pilih Produk --</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }} (Stok: {{ p.stock }})</option>
          </select>
          <p v-if="errors[`item_${form.items.indexOf(item)}_product`]" class="mt-1 text-sm text-red-500">{{ errors[`item_${form.items.indexOf(item)}_product`] }}</p>
        </div>
        <div>
          <label class="label-field">Qty <span class="text-red-500">*</span></label>
          <input
            v-model.number="item.qty"
            type="number"
            class="input-field"
            :class="{ 'border-red-500': errors[`item_${form.items.indexOf(item)}_qty`] }"
            min="1"
            step="1"
          />
          <p v-if="errors[`item_${form.items.indexOf(item)}_qty`]" class="mt-1 text-sm text-red-500">{{ errors[`item_${form.items.indexOf(item)}_qty`] }}</p>
        </div>
        <div class="flex items-end">
          <button @click="removeItem(item.temp_id)" class="btn-danger text-sm" :disabled="form.items.length <= 1">Hapus</button>
        </div>
      </div>

      <div v-if="form.items.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
        Belum ada produk dalam paket. Klik "Tambah Produk" untuk menambah.
      </div>
    </div>
  </div>
</template>