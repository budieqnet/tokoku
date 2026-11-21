<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox, ElUpload } from 'element-plus'
import api from '@/services/api'

const authStore = useAuthStore()

// Form state
const profileForm = reactive({
  full_name: '',
  email: '',
})

const passwordForm = reactive({
  current_password: '',
  new_password: '',
  confirm_password: '',
})

const loading = ref(false)
const passwordLoading = ref(false)
const avatarLoading = ref(false)
const avatarUrl = ref<string | null>(null)
const showPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

// Fetch user profile on mount
onMounted(async () => {
  await fetchProfile()
})

async function fetchProfile() {
  try {
    const response = await authStore.fetchMe()
    if (response && authStore.user) {
      profileForm.full_name = authStore.user.full_name || ''
      profileForm.email = authStore.user.email || ''
      avatarUrl.value = (authStore.user as any).avatar_url || null
    }
  } catch (error) {
    console.error('Fetch profile error:', error)
    ElMessage.error('Gagal memuat profil')
  }
}

async function updateProfile() {
  loading.value = true
  try {
    const response = await authStore.updateProfile({
      full_name: profileForm.full_name,
      email: profileForm.email,
    })
    if (response.success) {
      ElMessage.success('Profil berhasil diperbarui')
      await fetchProfile()
    } else {
      ElMessage.error(response.error || 'Gagal memperbarui profil')
    }
  } catch (error) {
    console.error('Update profile error:', error)
    ElMessage.error('Terjadi kesalahan server')
  } finally {
    loading.value = false
  }
}

async function changePassword() {
  if (passwordForm.new_password !== passwordForm.confirm_password) {
    ElMessage.error('Konfirmasi password tidak cocok')
    return
  }

  passwordLoading.value = true
  try {
    const response = await authStore.changePassword({
      current_password: passwordForm.current_password,
      new_password: passwordForm.new_password,
      confirm_password: passwordForm.confirm_password,
    })
    if (response.success) {
      ElMessage.success('Password berhasil diubah')
      passwordForm.current_password = ''
      passwordForm.new_password = ''
      passwordForm.confirm_password = ''
    } else {
      ElMessage.error(response.error || 'Gagal mengubah password')
    }
  } catch (error) {
    console.error('Change password error:', error)
    ElMessage.error('Terjadi kesalahan server')
  } finally {
    passwordLoading.value = false
  }
}

async function uploadAvatar(options: any) {
  const file = options.file
  avatarLoading.value = true
  try {
    const formData = new FormData()
    formData.append('avatar', file)
    
    const response = await api.post('/auth/profile', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    
    if (response.data.avatar_url) {
      ElMessage.success(response.data.message || 'Avatar berhasil diupload')
      avatarUrl.value = response.data.avatar_url
      // Update user in store
      if (authStore.user) {
        authStore.user.avatar_url = response.data.avatar_url
      }
      options.onSuccess?.(response.data)
    } else {
      ElMessage.error(response.data.error || 'Gagal upload avatar')
      options.onError?.(new Error(response.data.error || 'Gagal upload avatar'))
    }
  } catch (error: any) {
    console.error('Upload avatar error:', error)
    ElMessage.error(error.response?.data?.error || 'Gagal upload avatar')
    options.onError?.(error)
  } finally {
    avatarLoading.value = false
  }
}

function handleAvatarError() {
  ElMessage.error('Gagal upload avatar')
  avatarLoading.value = false
}

function beforeAvatarUpload(file: File) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    ElMessage.error('Format file tidak didukung. Gunakan JPEG, PNG, WebP, atau GIF')
    return false
  }
  const maxSize = 5 * 1024 * 1024 // 5MB
  if (file.size > maxSize) {
    ElMessage.error('Ukuran file terlalu besar. Maksimal 5MB')
    return false
  }
  avatarLoading.value = true
  return true
}

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function getAvatarUrl() {
  const raw = avatarUrl.value
  if (raw) {
    if (/^https?:\/\//i.test(raw)) return raw
    const apiBase = import.meta.env.VITE_API_URL as string | undefined
    if (apiBase) {
      // VITE_API_URL biasanya berakhiran /api; aset disajikan dari root backend.
      const base = apiBase.replace(/\/api\/?$/, '').replace(/\/$/, '')
      return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`
    }
    return raw
  }
  return 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (authStore.user?.username || 'user')
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Profil Saya</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-1">Kelola informasi profil, password, dan foto profil Anda</p>
      </div>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Avatar Section -->
      <div class="lg:col-span-1">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
          <div class="relative w-32 h-32 mx-auto mb-4">
            <img
              :src="getAvatarUrl()"
              alt="Avatar"
              class="w-full h-full rounded-full object-cover border-4 border-gray-100 dark:border-gray-700"
            />
            <el-upload
              class="absolute bottom-0 right-0"
              action="#"
              :http-request="uploadAvatar"
              :before-upload="beforeAvatarUpload"
              :on-error="handleAvatarError"
              :show-file-list="false"
            >
              <div class="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center cursor-pointer text-white shadow-lg hover:bg-primary-700 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </el-upload>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400">Klik ikon kamera untuk mengganti foto</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Maksimal 5MB • JPG, PNG, WebP, GIF</p>
        </div>

        <!-- User Info Card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Informasi Akun</h3>
          <dl class="space-y-3">
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Username</dt>
              <dd class="text-gray-900 dark:text-white font-mono">{{ authStore.user?.username }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Role</dt>
              <dd class="text-gray-900 dark:text-white capitalize">{{ authStore.user?.role }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500 dark:text-gray-400">Terdaftar sejak</dt>
              <dd class="text-gray-900 dark:text-white">{{ formatDate(authStore.user?.created_at) }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Profile Form & Password Form -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Profile Form -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Informasi Profil</h2>
          <form @submit.prevent="updateProfile" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Lengkap</label>
              <input
                v-model="profileForm.full_name"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Masukkan nama lengkap"
                required
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                v-model="profileForm.email"
                type="email"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Masukkan email"
                required
              />
            </div>
            <div class="flex justify-end pt-2">
              <el-button type="primary" :loading="loading" native-type="submit">
                Simpan Perubahan
              </el-button>
            </div>
          </form>
        </div>

        <!-- Change Password Form -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Ubah Password</h2>
          <form @submit.prevent="changePassword" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password Saat Ini</label>
              <div class="relative">
                <input
                  v-model="passwordForm.current_password"
                  :type="showPassword ? 'text' : 'password'"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent pr-10"
                  placeholder="Masukkan password saat ini"
                  required
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg v-if="!showPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L3 3m8.293 8.293l4.242 4.242" />
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password Baru</label>
              <div class="relative">
                <input
                  v-model="passwordForm.new_password"
                  :type="showNewPassword ? 'text' : 'password'"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent pr-10"
                  placeholder="Masukkan password baru (min. 8 karakter)"
                  required
                  minlength="8"
                />
                <button
                  type="button"
                  @click="showNewPassword = !showNewPassword"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg v-if="!showNewPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L3 3m8.293 8.293l4.242 4.242" />
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Konfirmasi Password Baru</label>
              <div class="relative">
                <input
                  v-model="passwordForm.confirm_password"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent pr-10"
                  placeholder="Konfirmasi password baru"
                  required
                />
                <button
                  type="button"
                  @click="showConfirmPassword = !showConfirmPassword"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg v-if="!showConfirmPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L3 3m8.293 8.293l4.242 4.242" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="flex justify-end pt-2">
              <el-button type="primary" :loading="passwordLoading" native-type="submit">
                Ubah Password
              </el-button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Element Plus upload override */
:deep(.el-upload) {
  display: inline-block;
}
:deep(.el-upload__input) {
  display: none;
}
</style>