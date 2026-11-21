<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const fullName = ref('')
const error = ref('')
const loading = ref(false)

const handleRegister = async () => {
  error.value = ''
  loading.value = true
  
  const result = await authStore.register({
    username: username.value,
    email: email.value,
    password: password.value,
    full_name: fullName.value || undefined,
  })
  
  if (result.success) {
    router.push('/dashboard')
  } else {
    error.value = result.error
  }
  
  loading.value = false
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
    <div class="w-full max-w-md">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">TokoKu</h1>
          <p class="text-gray-600 dark:text-gray-400 mt-2">Buat akun baru</p>
        </div>

        <div v-if="error" class="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 rounded">
          {{ error }}
        </div>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label class="label-field">Nama Lengkap</label>
            <input
              v-model="fullName"
              type="text"
              class="input-field"
              placeholder="Masukkan nama lengkap"
              autocomplete="name"
            />
          </div>

          <div>
            <label class="label-field">Username</label>
            <input
              v-model="username"
              type="text"
              class="input-field"
              placeholder="Masukkan username"
              required
              autocomplete="username"
            />
          </div>

          <div>
            <label class="label-field">Email</label>
            <input
              v-model="email"
              type="email"
              class="input-field"
              placeholder="Masukkan email"
              required
              autocomplete="email"
            />
          </div>

          <div>
            <label class="label-field">Password</label>
            <input
              v-model="password"
              type="password"
              class="input-field"
              placeholder="Masukkan password (min. 8 karakter)"
              required
              minlength="8"
              autocomplete="new-password"
            />
          </div>

          <button
            type="submit"
            class="btn-primary w-full"
            :disabled="loading"
          >
            <span v-if="loading" class="flex items-center justify-center gap-2">
              <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Memproses...
            </span>
            <span v-else>Daftar</span>
          </button>
        </form>

        <p class="mt-6 text-center text-gray-600 dark:text-gray-400">
          Sudah punya akun? 
          <router-link to="/login" class="text-blue-600 hover:text-blue-500 font-medium">Masuk</router-link>
        </p>
      </div>
    </div>
  </div>
</template>