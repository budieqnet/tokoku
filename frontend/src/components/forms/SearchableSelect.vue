<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

interface Props {
  modelValue: number | null
  options: Array<{ id: number; name: string }>
  placeholder?: string
  disabled?: boolean
  label?: string
  error?: string
}

interface Emits {
  (e: 'update:modelValue', value: number | null): void
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '-- Pilih --',
  disabled: false,
  label: '',
})

const emit = defineEmits<Emits>()

const isOpen = ref(false)
const searchQuery = ref('')
const selectedOption = ref<{ id: number; name: string } | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options
  const query = searchQuery.value.toLowerCase()
  return props.options.filter(opt => opt.name.toLowerCase().includes(query))
})

watch(() => props.modelValue, (val) => {
  if (val === null) {
    selectedOption.value = null
  } else {
    const opt = props.options.find(o => o.id === val)
    selectedOption.value = opt || null
  }
}, { immediate: true })

const selectOption = (opt: { id: number; name: string }) => {
  selectedOption.value = opt
  emit('update:modelValue', opt.id)
  searchQuery.value = ''
  isOpen.value = false
  inputRef.value?.blur()
}

const clearSelection = (e: MouseEvent) => {
  e.stopPropagation()
  selectedOption.value = null
  emit('update:modelValue', null)
  searchQuery.value = ''
  isOpen.value = false
}

const toggleDropdown = () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    searchQuery.value = ''
    nextTick(() => inputRef.value?.focus())
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    isOpen.value = false
    inputRef.value?.blur()
  } else if (e.key === 'ArrowDown' && !isOpen.value) {
    e.preventDefault()
    isOpen.value = true
  }
}

const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

const handleInput = (e: Event) => {
  const target = e.target as HTMLInputElement
  searchQuery.value = target.value
  // If user types something that matches an option, pre-select it
  const match = props.options.find(o => o.name.toLowerCase() === target.value.toLowerCase())
  if (match) {
    selectedOption.value = match
  }
}

const handleFocus = () => {
  if (!props.disabled) isOpen.value = true
}

const handleBlur = () => {
  // Delay to allow click on dropdown item
  setTimeout(() => {
    isOpen.value = false
    // If input doesn't match any option, clear
    if (searchQuery.value && !props.options.find(o => o.name.toLowerCase() === searchQuery.value.toLowerCase())) {
      searchQuery.value = selectedOption.value?.name || ''
    }
  }, 200)
}
</script>

<template>
  <div class="relative" ref="dropdownRef">
    <label v-if="label" class="label-field">{{ label }} <span class="text-red-500" v-if="error">*</span></label>
    
    <div class="relative">
      <input
        ref="inputRef"
        type="text"
        :value="selectedOption?.name || ''"
        @input="handleInput"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
        @click="toggleDropdown"
        :placeholder="placeholder"
        :disabled="props.disabled"
        :class="[
          'input-field pr-10',
          { 'border-red-500': error }
        ]"
        autocomplete="off"
        readonly
      />
      
      <!-- Clear button -->
      <button
        v-if="selectedOption && !props.disabled"
        @click="clearSelection"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        aria-label="Hapus pilihan"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      
      <!-- Dropdown arrow -->
      <svg
        v-if="!props.disabled"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform"
        :class="{ 'rotate-180': isOpen }"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>

    <!-- Dropdown -->
    <div
      v-if="isOpen && !props.disabled"
      class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto"
    >
      <div class="px-3 py-1 border-b border-gray-200 dark:border-gray-700">
        <input
          type="text"
          v-model="searchQuery"
          @click.stop
          @keydown.esc="isOpen = false"
          placeholder="Cari..."
          class="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autocomplete="off"
        />
      </div>
      
      <div v-if="filteredOptions.length === 0" class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
        Tidak ada data
      </div>
      
      <div
        v-else
        v-for="opt in filteredOptions"
        :key="opt.id"
        @click="selectOption(opt)"
        @mousedown.prevent
        class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b last:border-b-0 flex items-center justify-between"
      >
        <span :class="{ 'font-medium bg-blue-50 dark:bg-blue-900/30': selectedOption?.id === opt.id }">
          {{ opt.name }}
        </span>
        <svg
          v-if="selectedOption?.id === opt.id"
          class="w-4 h-4 text-blue-600 dark:text-blue-400 ml-2 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    </div>
    
    <p v-if="error" class="mt-1 text-sm text-red-500">{{ error }}</p>
  </div>
</template>