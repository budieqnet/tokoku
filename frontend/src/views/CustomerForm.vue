<script setup lang="ts">
import { ref, reactive } from 'vue'
import api from '@/services/api'

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

const form = reactive({ ...props.initialData })
const loading = ref(false)
const errors = ref<Record<string, string>>({})

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
      await api.put(`/customers/${form.id}`, form)
    } else {
      await api.post('/customers', form)
    }
    emit('success')
  } catch (error: any) {
    console.error('Submit error:', error)
    alert(error.response?.data?.message || 'Terjadi kesalahan saat menyimpan data')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form @submit.prevent="submit" class="space-y-4">
    <div class="space-y-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nama Lengkap</label>
      <input
        v-model="form.name"
        type="text"
        class="input-field"
        :class="{ 'border-red-500': errors.name }"
        placeholder="Masukkan nama lengkap"
      />
      <p v-if="errors.name" class="text-xs text-red-500">{{ errors.name }}</p>
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
        <span v-else>{{ isEditing ? 'Update Pelanggan' : 'Simpan Pelanggan' }}</span>
      </button>
    </div>
  </form>
</template>