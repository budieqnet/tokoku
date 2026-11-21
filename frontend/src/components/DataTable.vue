<script setup lang="ts">
import { ref, computed, watch } from 'vue'

export interface Column {
  key: string
  label: string
  // slot name untuk render custom cell; default langsung akses row[key]
  slot?: string
  // tambahan class untuk th
  thClass?: string
  // tambahan class untuk td
  tdClass?: string
  // sembunyikan kolom ini pada tampilan kartu HP
  hideOnMobile?: boolean
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

const props = withDefaults(defineProps<{
  columns: Column[]
  rows: any[]
  loading?: boolean
  pagination?: PaginationMeta | null
  searchPlaceholder?: string
  searchValue?: string
  emptyText?: string
  rowKey?: string
  hideSearch?: boolean
}>(), {
  loading: false,
  pagination: null,
  searchPlaceholder: 'Cari...',
  searchValue: '',
  emptyText: 'Tidak ada data',
  rowKey: 'id',
  hideSearch: false,
})

const emit = defineEmits<{
  (e: 'search'): void
  (e: 'update:searchValue', value: string): void
  (e: 'page', page: number): void
}>()

const search = ref(props.searchValue)

watch(() => props.searchValue, (val) => {
  search.value = val
})

// Kolom data untuk kartu HP: sembunyikan 'actions', dan kolom hideOnMobile
const mobileDataColumns = computed(() =>
  props.columns.filter((c) => c.key !== 'actions' && !c.hideOnMobile)
)
const mobileActionsColumn = computed(() =>
  props.columns.find((c) => c.key === 'actions')
)

function getCellValue(row: any, key: string) {
  // support nested key seperti 'user.name' via path traversal
  return key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), row)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Search -->
    <div v-if="!hideSearch" class="card p-3 sm:p-4">
      <div class="flex flex-col sm:flex-row gap-2 sm:gap-4">
        <input
          v-model="search"
          type="text"
          class="input-field flex-1 w-full sm:max-w-md"
          :placeholder="searchPlaceholder"
          @keyup.enter="emit('search')"
          @input="emit('update:searchValue', search)"
        />
        <button @click="emit('search')" class="btn-primary p-2 min-h-[44px] sm:w-auto w-full flex items-center justify-center gap-2" aria-label="Cari">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span class="sm:hidden text-sm font-medium">Cari</span>
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="card overflow-hidden">
      <!-- Desktop / tablet: tabel -->
      <div class="hidden md:block overflow-x-auto">
        <table class="w-full min-w-[640px]">
          <thead>
            <tr class="table-light">
              <th
                v-for="col in columns"
                :key="col.key"
                class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                :class="col.thClass"
              >
                {{ col.label }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr
              v-for="(row, i) in rows"
              :key="row[rowKey] ?? i"
              class="hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <td
                v-for="col in columns"
                :key="col.key"
                class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400"
                :class="col.tdClass"
              >
                <slot v-if="col.slot" :name="col.slot" :row="row" :index="i">
                  {{ getCellValue(row, col.key) ?? '-' }}
                </slot>
                <template v-else>
                  {{ getCellValue(row, col.key) ?? '-' }}
                </template>
              </td>
            </tr>
            <tr v-if="loading">
              <td :colspan="columns.length" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                <span class="inline-flex items-center gap-2">
                  <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Memuat data...
                </span>
              </td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td :colspan="columns.length" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                {{ emptyText }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- HP: kartu per baris agar tidak perlu scroll horizontal -->
      <div class="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
        <div
          v-for="(row, i) in rows"
          :key="row[rowKey] ?? i"
          class="p-4 space-y-2 active:bg-gray-50 dark:active:bg-gray-800/50"
        >
          <div
            v-for="col in mobileDataColumns"
            :key="col.key"
            class="flex items-start justify-between gap-3 text-sm"
          >
            <span class="shrink-0 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 pt-0.5">
              {{ col.label }}
            </span>
            <span class="text-right text-gray-700 dark:text-gray-300 break-words min-w-0" :class="col.tdClass">
              <slot v-if="col.slot" :name="col.slot" :row="row" :index="i">
                {{ getCellValue(row, col.key) ?? '-' }}
              </slot>
              <template v-else>
                {{ getCellValue(row, col.key) ?? '-' }}
              </template>
            </span>
          </div>
          <div v-if="mobileActionsColumn" class="flex items-center justify-end gap-2 pt-2">
            <slot name="actions" :row="row" :index="i" />
          </div>
        </div>
        <div v-if="loading" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
          <span class="inline-flex items-center gap-2">
            <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Memuat data...
          </span>
        </div>
        <div v-else-if="rows.length === 0" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
          {{ emptyText }}
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="pagination && pagination.totalPages > 1"
        class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between"
      >
        <span class="text-sm text-gray-500 dark:text-gray-400 text-center sm:text-left">
          Halaman {{ pagination.page }} dari {{ pagination.totalPages }} (Total: {{ pagination.total }})
        </span>
        <div class="grid grid-cols-2 sm:flex gap-2">
          <button
            @click="emit('page', pagination.page - 1)"
            :disabled="pagination.page === 1"
            class="btn-secondary text-sm px-3 py-2 min-h-[44px] disabled:opacity-50"
          >
            Sebelumnya
          </button>
          <button
            @click="emit('page', pagination.page + 1)"
            :disabled="pagination.page === pagination.totalPages"
            class="btn-secondary text-sm px-3 py-2 min-h-[44px] disabled:opacity-50"
          >
            Selanjutnya
          </button>
        </div>
      </div>
    </div>
  </div>
</template>