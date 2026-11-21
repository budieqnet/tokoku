<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElButton, ElSwitch } from 'element-plus'
import { ArrowLeft, Close, Check } from '@element-plus/icons-vue'
import api from '@/services/api'

const router = useRouter()
const route = useRoute()

const isEditing = computed(() => route.name === 'UserEdit')
const userId = computed(() => route.params.id as string)

const formRef = ref<InstanceType<typeof ElForm> | null>(null)

interface UserForm {
  username: string
  email: string
  password: string
  confirm_password: string
  full_name: string
  role: string
  is_active: boolean
}

const form = reactive<UserForm>({
  username: '',
  email: '',
  password: '',
  confirm_password: '',
  full_name: '',
  role: 'user',
  is_active: true,
})

const rules = computed(() => ({
  username: [
    { required: true, message: 'Username wajib diisi', trigger: 'blur' },
    { min: 3, max: 50, message: 'Username 3-50 karakter', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: 'Username hanya huruf, angka, dan underscore', trigger: 'blur' },
  ],
  email: [
    { required: true, message: 'Email wajib diisi', trigger: 'blur' },
    { type: 'email' as const, message: 'Format email tidak valid', trigger: 'blur' },
  ],
  // Password hanya wajib saat create. Saat edit, kosong = tidak diubah
  // (perubahan password lewat fitur Reset Password di halaman Users)
  password: isEditing.value
    ? [
        { min: 8, max: 100, message: 'Password minimal 8 karakter', trigger: 'blur' },
      ]
    : [
        { required: true, message: 'Password wajib diisi', trigger: 'blur' },
        { min: 8, max: 100, message: 'Password minimal 8 karakter', trigger: 'blur' },
      ],
  confirm_password: isEditing.value
    ? [
        { validator: (rule: any, value: string, callback: any) => {
            if (value && value !== form.password) {
              callback(new Error('Konfirmasi password tidak cocok'))
            } else {
              callback()
            }
          }, trigger: 'blur' },
      ]
    : [
        { required: true, message: 'Konfirmasi password wajib diisi', trigger: 'blur' },
        { validator: (rule: any, value: string, callback: any) => {
            if (value !== form.password) {
              callback(new Error('Konfirmasi password tidak cocok'))
            } else {
              callback()
            }
          }, trigger: 'blur' },
      ],
  full_name: [
    { required: true, message: 'Nama lengkap wajib diisi', trigger: 'blur' },
    { max: 100, message: 'Nama maksimal 100 karakter', trigger: 'blur' },
  ],
  role: [
    { required: true, message: 'Role wajib dipilih', trigger: 'change' },
  ],
}))

const loading = ref(false)
const showPassword = ref(false)

const allRoleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
]

// Kedua role bisa dibuat langsung (backend POST mengizinkan admin/user).
const roleOptions = computed(() => allRoleOptions)

async function fetchUser() {
  if (!isEditing.value) return

  try {
    const response = await api.get(`/admin/users/${userId.value}`)
    const user = response.data.user
    form.username = user.username
    form.email = user.email
    form.full_name = user.full_name || ''
    form.role = user.role
    form.is_active = Boolean(user.is_active)
    // Password not fetched for security
  } catch (error: any) {
    console.error('Fetch user error:', error)
    ElMessage.error(error.response?.data?.error || 'Gagal memuat data user')
    router.push('/users')
  }
}

async function submitForm(formEl: any) {
  if (!formEl) return

  formEl.validate(async (valid: boolean) => {
    if (!valid) return

    loading.value = true
    try {
      if (isEditing.value) {
        // Backend update hanya menerima full_name, email, role, is_active.
        // Password diubah lewat Reset Password di halaman Users.
        const payload: any = {
          full_name: form.full_name,
          email: form.email,
          role: form.role,
          is_active: form.is_active,
        }
        await api.put(`/admin/users/${userId.value}`, payload)
        ElMessage.success('User berhasil diperbarui')
      } else {
        const payload = {
          username: form.username,
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
        }
        await api.post('/admin/users', payload)
        ElMessage.success('User berhasil dibuat')
      }
      router.push('/users')
    } catch (error: any) {
      console.error('Submit user error:', error)
      ElMessage.error(error.response?.data?.error || 'Gagal menyimpan user')
    } finally {
      loading.value = false
    }
  })
}

function handleCancel() {
  router.push('/users')
}

onMounted(() => {
  fetchUser()
})
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Page Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ isEditing ? 'Edit User' : 'Tambah User' }}
        </h1>
        <p class="text-gray-500 dark:text-gray-400 mt-1">
          {{ isEditing ? 'Perbarui data user' : 'Buat user baru' }}
        </p>
      </div>
      <el-button
        :icon="ArrowLeft"
        circle
        aria-label="Kembali ke daftar user"
        title="Kembali"
        @click="handleCancel"
      />
    </div>

    <!-- Form -->
    <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <el-form-item label="Username" prop="username">
        <el-input v-model="form.username" :disabled="isEditing" placeholder="Masukkan username" autocomplete="username" />
      </el-form-item>

      <el-form-item label="Email" prop="email">
        <el-input v-model="form.email" placeholder="Masukkan email" autocomplete="email" />
      </el-form-item>

      <el-form-item label="Password" prop="password" v-if="!isEditing">
        <el-input
          v-model="form.password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Masukkan password"
          autocomplete="new-password"
        >
          <template #suffix>
            <el-icon @click="showPassword = !showPassword">
              <svg v-if="!showPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L3 3m8.293 8.293l4.242 4.242" />
              </svg>
            </el-icon>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="Konfirmasi Password" prop="confirm_password" v-if="!isEditing">
        <el-input
          v-model="form.confirm_password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Konfirmasi password"
          autocomplete="new-password"
        />
      </el-form-item>

      <el-form-item v-if="isEditing">
        <p class="text-sm text-gray-500 dark:text-gray-400">Untuk mengubah password, gunakan fitur "Reset Password" di halaman Manajemen User.</p>
      </el-form-item>

      <el-form-item label="Nama Lengkap" prop="full_name">
        <el-input v-model="form.full_name" placeholder="Masukkan nama lengkap" autocomplete="name" />
      </el-form-item>

      <el-form-item label="Role" prop="role">
        <el-select v-model="form.role" placeholder="Pilih role" style="width: 100%">
          <el-option v-for="opt in roleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
      </el-form-item>

      <el-form-item label="Status">
        <el-switch v-model="form.is_active" active-text="Aktif" inactive-text="Nonaktif" />
      </el-form-item>

      <el-form-item>
        <div class="flex justify-end gap-3">
          <el-button
            :icon="Close"
            circle
            aria-label="Batal"
            title="Batal"
            @click="handleCancel"
          />
          <el-button
            type="primary"
            :icon="Check"
            circle
            :loading="loading"
            :aria-label="isEditing ? 'Perbarui user' : 'Simpan user'"
            :title="isEditing ? 'Perbarui' : 'Simpan'"
            @click="submitForm(formRef)"
          />
        </div>
      </el-form-item>
    </el-form>
  </div>
</template>