<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import api from '@/services/api'
import { alertNotify } from '@/utils/alert'

interface Props {
  initialData: {
    id?: number
    name: string
    contact: string
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
  contact: props.initialData?.contact || '',
  phone: props.initialData?.phone || '',
  email: props.initialData?.email || '',
  address: props.initialData?.address || '',
})

const loading = ref(false)
const errors = ref<Record<string, string>>({})

// Update form data when initialData changes (e.g., switching partners to edit)
watch(() => props.initialData, (newData) => {
  if (newData) {
    form.id = newData.id
    form.name = newData.name || ''
    form.contact = newData.contact || ''
    form.phone = newData.phone || ''
    form.email = newData.email || ''
    form.address = newData.address || ''
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
    const payload = {
      name: form.name,
      contact: form.contact || '',
      phone: form.phone || '',
      email: form.email || '',
      address: form.address || '',
    }
    if (props.isEditing && form.id) {
      await api.put(`/partners/${form.id}`, payload)
    } else {
      await api.post('/partners', payload)
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
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nama Mitra</label>
      <input
        v-model="form.name"
        type="text"
        class="input-field"
        :class="{ 'border-red-500': errors.name }"
        placeholder="Masukkan nama mitra"
      />
      <p v-if="errors.name" class="text-xs text-red-500">{{ errors.name }}</p>
    </div>

    <div class="space-y-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Kontak Person</label>
      <input
        v-model="form.contact"
        type="text"
        class="input-field"
        placeholder="Nama kontak person"
      />
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

    <div class="flex justify-end gap-3 pt-4">
      <button type="button" @click="$emit('close')" class="btn-secondary">Batal</button>
      <button type="submit" :disabled="loading" class="btn-primary">
        <span v-if="loading">Menyimpan...</span>
        <span v-else>{{ isEditing ? 'Update Mitra' : 'Simpan Mitra' }}</span>
      </button>
    </div>
  </form>
</template>