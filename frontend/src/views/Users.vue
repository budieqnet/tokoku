<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElTable, ElTableColumn, ElButton, ElInput, ElSelect, ElOption, ElTag, ElPagination, ElIcon } from 'element-plus'
import { Plus, Edit, Delete, Lock, Unlock, Search, Refresh, Key } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'
import { alertNotify } from '@/utils/alert'
import Swal from 'sweetalert2'

const router = useRouter()
const authStore = useAuthStore()

interface User {
  id: number
  username: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const users = ref<User[]>([])
const loading = ref(false)
const pagination = ref<Pagination>({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
})

const searchForm = ref({
  search: '',
  role: '',
  is_active: '',
})

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
]

const statusOptions = [
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Nonaktif' },
]

async function fetchUsers() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.append('page', String(pagination.value.page))
    params.append('limit', String(pagination.value.limit))
    if (searchForm.value.search) params.append('search', searchForm.value.search)
    if (searchForm.value.role) params.append('role', searchForm.value.role)
    if (searchForm.value.is_active !== '') params.append('is_active', searchForm.value.is_active)

    const response = await api.get(`/admin/users?${params.toString()}`)
    users.value = response.data.users
    pagination.value = response.data.pagination
  } catch (error: any) {
    console.error('Fetch users error:', error)
    alertNotify.error(error.response?.data?.error || 'Gagal memuat data user')
  } finally {
    loading.value = false
  }
}

async function handleSearch() {
  pagination.value.page = 1
  await fetchUsers()
}

async function handleReset() {
  searchForm.value = { search: '', role: '', is_active: '' }
  pagination.value.page = 1
  await fetchUsers()
}

async function handlePageChange(page: number) {
  pagination.value.page = page
  await fetchUsers()
}

async function handleSizeChange(size: number) {
  pagination.value.limit = size
  pagination.value.page = 1
  await fetchUsers()
}

function handleCreate() {
  router.push('/users/new')
}

function handleEdit(user: User) {
  router.push(`/users/${user.id}/edit`)
}

async function handleToggleStatus(user: User) {
  const confirmed = await alertNotify.confirm(
    `Yakin ingin ${user.is_active ? 'menonaktifkan' : 'mengaktifkan'} user "${user.username}"?`,
    'Konfirmasi'
  )
  if (!confirmed) return

  try {
    await api.put(`/admin/users/${user.id}`, { is_active: !user.is_active })
    alertNotify.success(`User berhasil ${user.is_active ? 'dinonaktifkan' : 'diaktifkan'}`)
    await fetchUsers()
  } catch (error: any) {
    alertNotify.error(error.response?.data?.error || 'Gagal mengubah status')
  }
}

async function handleResetPassword(user: User) {
  try {
    const { value: newPassword } = await Swal.fire({
      title: 'Reset Password',
      html: `Masukkan password baru untuk user "${user.username}" (min. 8 karakter):`,
      input: 'password',
      inputPlaceholder: 'Password baru',
      inputAttributes: {
        minlength: 8,
        required: true,
      },
      confirmButtonText: 'Reset',
      cancelButtonText: 'Batal',
      showCancelButton: true,
      confirmButtonColor: '#3B82F6',
      cancelButtonColor: '#6B7280',
      inputValidator: (value: string) => {
        if (!value || value.length < 8) {
          return 'Password minimal 8 karakter'
        }
        return undefined
      },
    } as any)

    if (!newPassword) return

    const { value: confirmPassword } = await Swal.fire({
      title: 'Konfirmasi Password',
      input: 'password',
      inputPlaceholder: 'Konfirmasi password',
      confirmButtonText: 'Konfirmasi',
      cancelButtonText: 'Batal',
      showCancelButton: true,
      confirmButtonColor: '#3B82F6',
      cancelButtonColor: '#6B7280',
      inputValidator: (value: string) => {
        if (!value) {
          return 'Password wajib diisi'
        }
        return undefined
      },
    } as any)

    if (!confirmPassword) return

    if (newPassword !== confirmPassword) {
      alertNotify.error('Konfirmasi password tidak cocok')
      return
    }

    await api.patch(`/admin/users/${user.id}/reset-password`, {
      new_password: newPassword,
      confirm_password: confirmPassword,
    })

    alertNotify.success('Password berhasil direset')
  } catch (error: any) {
    if (error !== 'cancel' && !error.isDismissed) {
      alertNotify.error(error.response?.data?.error || 'Gagal reset password')
    }
  }
}

async function handleDelete(user: User) {
  const confirmed = await alertNotify.confirm(
    `Yakin ingin menghapus user "${user.username}"? Tindakan ini tidak dapat dibatalkan.`,
    'Konfirmasi Hapus'
  )
  if (!confirmed) return

  try {
    await api.delete(`/admin/users/${user.id}`)
    alertNotify.success('User berhasil dihapus')
    await fetchUsers()
  } catch (error: any) {
    alertNotify.error(error.response?.data?.error || 'Gagal menghapus user')
  }
}

function formatRole(role: string) {
  const labels: Record<string, string> = {
    admin: 'Admin',
    user: 'User',
  }
  return labels[role] || role
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

onMounted(() => {
  fetchUsers()
})

function getRoleType(role: string) {
  const types: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
    admin: 'danger',
    user: 'primary',
  }
  return types[role] || 'primary'
}
</script>

<template>
  <div class="users-page">
    <!-- Page Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Manajemen User</h1>
        <p class="page-subtitle">Kelola user, role, dan akses sistem</p>
      </div>
      <el-button
        type="primary"
        :icon="Plus"
        circle
        aria-label="Tambah user"
        title="Tambah User"
        @click="handleCreate"
      />
    </div>

    <!-- Search & Filter -->
    <el-card class="filter-card" shadow="never">
      <form @submit.prevent="handleSearch" class="filter-form">
        <div class="filter-field">
          <label class="filter-label">Cari</label>
          <el-input
            v-model="searchForm.search"
            placeholder="Username, email, atau nama..."
            clearable
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        <div class="filter-field">
          <label class="filter-label">Role</label>
          <el-select v-model="searchForm.role" placeholder="Semua Role" clearable style="width: 100%">
            <el-option v-for="opt in roleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </div>
        <div class="filter-field">
          <label class="filter-label">Status</label>
          <el-select v-model="searchForm.is_active" placeholder="Semua Status" clearable style="width: 100%">
            <el-option v-for="opt in statusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </div>
        <div class="filter-actions">
          <el-button type="primary" :icon="Search" circle aria-label="Cari user" title="Cari" @click="handleSearch" />
          <el-button :icon="Refresh" circle aria-label="Reset filter" title="Reset" @click="handleReset" />
        </div>
      </form>
    </el-card>

    <!-- User Table -->
    <el-card class="table-card" shadow="never">
      <el-table
        :data="users"
        v-loading="loading"
        style="width: 100%"
        empty-text="Tidak ada data user"
        border
        stripe
      >
        <el-table-column prop="username" label="Username" min-width="140" show-overflow-tooltip />
        <el-table-column prop="email" label="Email" min-width="200" show-overflow-tooltip />
        <el-table-column prop="full_name" label="Nama Lengkap" min-width="170" show-overflow-tooltip />
        <el-table-column prop="role" label="Role" width="130">
          <template #default="scope">
            <el-tag :type="getRoleType(scope.row.role)" effect="dark">{{ formatRole(scope.row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="Status" width="110">
          <template #default="scope">
            <el-tag :type="scope.row.is_active ? 'success' : 'danger'" effect="dark">
              {{ scope.row.is_active ? 'Aktif' : 'Nonaktif' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_login_at" label="Login Terakhir" width="170">
          <template #default="scope">
            {{ formatDate(scope.row.last_login_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="Dibuat" width="170">
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="Aksi" width="150" fixed="right" align="center">
          <template #default="scope">
            <div class="flex items-center justify-center gap-1">
              <el-button
                type="primary"
                link
                :icon="Edit"
                class="!ml-0"
                aria-label="Edit user"
                title="Edit user"
                @click="handleEdit(scope.row as User)"
              />
              <el-button
                :type="scope.row.is_active ? 'warning' : 'success'"
                link
                :icon="scope.row.is_active ? Lock : Unlock"
                class="!ml-0"
                :aria-label="scope.row.is_active ? 'Nonaktifkan user' : 'Aktifkan user'"
                :title="scope.row.is_active ? 'Nonaktifkan user' : 'Aktifkan user'"
                :disabled="scope.row.id === authStore.user?.id"
                @click="handleToggleStatus(scope.row as User)"
              />
              <el-button
                type="warning"
                link
                :icon="Key"
                class="!ml-0"
                aria-label="Reset password"
                title="Reset password"
                @click="handleResetPassword(scope.row as User)"
              />
              <el-button
                type="danger"
                link
                :icon="Delete"
                class="!ml-0"
                aria-label="Hapus user"
                title="Hapus user"
                :disabled="scope.row.id === authStore.user?.id || scope.row.role === 'admin'"
                @click="handleDelete(scope.row as User)"
              />
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.limit"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          :total="pagination.total"
          small
          background
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.users-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}
.page-subtitle {
  color: var(--el-text-color-secondary);
  margin: 4px 0 0;
  font-size: 0.875rem;
}
.filter-card,
.table-card {
  overflow: hidden;
}
.filter-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-items: end;
}
@media (min-width: 768px) {
  .filter-form {
    grid-template-columns: 1fr 200px 180px auto;
  }
}
.filter-field {
  min-width: 0;
}
.filter-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 4px;
}
.filter-actions {
  display: flex;
  gap: 8px;
}
.table-card :deep(.el-card__body) {
  padding: 0;
}
.table-card :deep(.el-table) {
  border-radius: 0;
}
.pagination-wrap {
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  overflow-x: auto;
  display: flex;
  justify-content: flex-end;
}
</style>