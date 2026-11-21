<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import api from '@/services/api'
import { alertNotify } from '@/utils/alert'

interface Props {
  initialData: {
    id?: number
    category_id?: number | null
    category_name: string
    amount: number
    cost_date: string
    notes: string
    receipt_url: string
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
  category_id: props.initialData?.category_id ?? null,
  category_name: props.initialData?.category_name || '',
  amount: Number(props.initialData?.amount || 0),
  cost_date: props.initialData?.cost_date || new Date().toISOString().split('T')[0],
  notes: props.initialData?.notes || '',
  receipt_url: props.initialData?.receipt_url || '',
})

const errors = reactive({
  category_name: '',
  amount: '',
  cost_date: '',
})

const isSubmitting = ref(false)

const validate = (): boolean => {
  errors.category_name = ''
  errors.amount = ''
  errors.cost_date = ''

  let valid = true
  if (!form.category_name.trim()) {
    errors.category_name = 'Kategori wajib diisi'
    valid = false
  }
  if (!form.amount || form.amount <= 0) {
    errors.amount = 'Jumlah harus lebih dari 0'
    valid = false
  }
  if (!form.cost_date) {
    errors.cost_date = 'Tanggal wajib diisi'
    valid = false
  }
  return valid
}

const submit = async () => {
  if (!validate()) return
  isSubmitting.value = true
  try {
    const payload = {
      category_id: form.category_id ?? undefined,
      category_name: form.category_name.trim(),
      amount: form.amount,
      cost_date: form.cost_date,
      notes: form.notes.trim() || undefined,
      receipt_url: form.receipt_url.trim() || undefined,
    }

    if (props.isEditing && form.id) {
      await api.put(`/operational-costs/${form.id}`, payload)
    } else {
      await api.post('/operational-costs', payload)
    }

    alertNotify.success(props.isEditing ? 'Biaya operasional berhasil diubah' : 'Biaya operasional berhasil ditambahkan')
    emit('success')
  } catch (error: any) {
    const msg = error.response?.data?.error || 'Gagal menyimpan biaya operasional'
    alertNotify.error(msg)
  } finally {
    isSubmitting.value = false
  }
}

defineExpose({ submit })
</script>

<template>
  <form @submit.prevent="submit" class="space-y-4">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori</label>
        <input
          v-model="form.category_name"
          type="text"
          placeholder="Contoh: Pengiriman, Packing, Listrik"
          class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          :class="{ 'border-red-500': errors.category_name }"
        />
        <p v-if="errors.category_name" class="text-red-500 text-xs mt-1">{{ errors.category_name }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jumlah (Rp)</label>
        <input
          v-model.number="form.amount"
          type="number"
          min="0"
          step="1000"
          placeholder="0"
          class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          :class="{ 'border-red-500': errors.amount }"
        />
        <p v-if="errors.amount" class="text-red-500 text-xs mt-1">{{ errors.amount }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tanggal</label>
        <input
          v-model="form.cost_date"
          type="date"
          class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          :class="{ 'border-red-500': errors.cost_date }"
        />
        <p v-if="errors.cost_date" class="text-red-500 text-xs mt-1">{{ errors.cost_date }}</p>
      </div>

      <div class="md:col-span-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan</label>
        <textarea
          v-model="form.notes"
          rows="2"
          placeholder="Contoh: Ongkir kirim barang ke pelanggan A"
          class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        ></textarea>
      </div>

      <div class="md:col-span-2">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL Bukti Pembayaran (opsional)</label>
        <input
          v-model="form.receipt_url"
          type="url"
          placeholder="https://..."
          class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
        />
      </div>
    </div>

    <div class="flex justify-end gap-2 pt-4">
      <button
        type="button"
        @click="$emit('close')"
        class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
      >
        Batal
      </button>
      <button
        type="submit"
        :disabled="isSubmitting"
        class="btn-primary px-6 py-2 disabled:opacity-50"
      >
        {{ isSubmitting ? 'Menyimpan...' : (props.isEditing ? 'Simpan Perubahan' : 'Simpan') }}
      </button>
    </div>
  </form>
</template>
