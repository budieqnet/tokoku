import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export interface User {
  id: number
  username: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  created_at?: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(localStorage.getItem('accessToken'))
  const refreshToken = ref<string | null>(localStorage.getItem('refreshToken'))
  const loading = ref(false)

  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)

  async function login(username: string, password: string) {
     loading.value = true
     try {
       console.log('[DEBUG login] Mengirim request ke:', api.defaults.baseURL, '/auth/login')
       const response = await api.post('/auth/login', { username, password })
       console.log('[DEBUG login] Response:', response.data)
       const { user: userData, accessToken: access, refreshToken: refresh } = response.data
      
      user.value = userData
      accessToken.value = access
      refreshToken.value = refresh
      
      localStorage.setItem('accessToken', access)
      localStorage.setItem('refreshToken', refresh)
      api.defaults.headers.common['Authorization'] = `Bearer ${access}`
      
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Login gagal' }
    } finally {
      loading.value = false
    }
  }

  async function register(data: { username: string; email: string; password: string; full_name?: string }) {
    loading.value = true
    try {
      const response = await api.post('/auth/register', data)
      const { user: userData, accessToken: access, refreshToken: refresh } = response.data
      
      user.value = userData
      accessToken.value = access
      refreshToken.value = refresh
      
      localStorage.setItem('accessToken', access)
      localStorage.setItem('refreshToken', refresh)
      api.defaults.headers.common['Authorization'] = `Bearer ${access}`
      
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Register gagal' }
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout', { refreshToken: refreshToken.value })
    } catch {
      // ignore
    } finally {
      user.value = null
      accessToken.value = null
      refreshToken.value = null
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      delete api.defaults.headers.common['Authorization']
    }
  }

  async function fetchMe() {
    if (!accessToken.value) return false
    try {
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken.value}`
      const response = await api.get('/auth/me')
      user.value = response.data.user
      return true
    } catch {
      return false
    }
  }

  async function initAuth() {
    if (accessToken.value) {
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken.value}`
      await fetchMe()
    }
  }

  async function updateProfile(data: { full_name: string; email: string }) {
    try {
      const response = await api.put('/auth/profile', data)
      user.value = response.data.user
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal memperbarui profil' }
    }
  }

  async function changePassword(data: { current_password: string; new_password: string; confirm_password: string }) {
    try {
      await api.patch('/auth/profile', data)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || 'Gagal mengubah password' }
    }
  }

  return {
    user,
    accessToken,
    refreshToken,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    fetchMe,
    initAuth,
    updateProfile,
    changePassword,
  }
})