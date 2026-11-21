<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'
import ModalForm from '@/components/forms/ModalForm.vue'
import PackageForm from '@/components/forms/PackageForm.vue'

const route = useRoute()
const router = useRouter()

const isEditing = ref(false)
const packageId = ref<number | null>(null)
const showModal = ref(false)
const packageFormRef = ref<any>(null)
const formData = ref({
  id: undefined as number | undefined,
  name: '',
  price: 0,
  items: [] as Array<{ product_id: number; qty: number }>,
})

onMounted(async () => {
  const id = route.params.id
  if (id && id !== 'new') {
    isEditing.value = true
    packageId.value = Number(id)
    try {
      const res = await api.get(`/packages/${packageId.value}`)
      formData.value = {
        id: res.data.id,
        name: res.data.name,
        price: Number(res.data.price) || 0,
        items: res.data.items?.map((item: any) => ({
          product_id: item.product_id,
          qty: Number(item.qty) || 1,
        })) || [],
      }
    } catch (error) {
      alert('Gagal memuat data paket')
      router.push('/packages')
    }
  }
  showModal.value = true
})

const handleSuccess = () => {
  showModal.value = false
  router.push('/packages')
}

const handleModalSubmit = () => {
  packageFormRef.value?.submit()
}

const handleClose = () => {
  showModal.value = false
  router.push('/packages')
}

watch(showModal, (visible) => {
  if (!visible && route.path !== '/packages') {
    router.push('/packages')
  }
})
</script>

<template>
  <div>
    <ModalForm
      v-model="showModal"
      :title="isEditing ? 'Edit Paket' : 'Tambah Paket'"
      width="max-w-3xl"
      @close="handleClose"
      @submit="handleModalSubmit"
    >
      <PackageForm
        ref="packageFormRef"
        v-model="showModal"
        :initial-data="formData"
        :is-editing="isEditing"
        @success="handleSuccess"
        @update:model-value="handleClose"
      />
    </ModalForm>
  </div>
</template>