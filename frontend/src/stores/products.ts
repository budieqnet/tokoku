import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'

export interface Product {
  id: number
  name: string
  sku: string | null
  buy_price: number
  price: number
  partner_price: number
  bundle_qty: number
  bundle_price: number
  stock: number
  supplier_id: number | null
  supplier_name: string | null
  created_at: string
}

export const useProductsStore = defineStore('products', () => {
  const products = ref<Product[]>([])
  const loading = ref(false)
  const initialized = ref(false)

  const getProductById = computed(() => (id: number) => 
    products.value.find(p => p.id === id)
  )

  const totalStock = computed(() => 
    products.value.reduce((sum, p) => sum + (p.stock || 0), 0)
  )

  const lowStockProducts = computed(() => 
    products.value.filter(p => (p.stock || 0) <= 5)
  )

  async function fetchAll(params?: { limit?: number; page?: number; search?: string }) {
    loading.value = true
    try {
      const queryParams = new URLSearchParams()
      if (params?.page) queryParams.append('page', String(params.page))
      if (params?.limit) queryParams.append('limit', String(params.limit))
      if (params?.search) queryParams.append('search', params.search)
      
      const res = await api.get(`/products?${queryParams.toString()}`)
      products.value = res.data.data
      initialized.value = true
      return res.data
    } catch (error) {
      console.error('Failed to fetch products:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function fetchForSelect() {
    try {
      const res = await api.get('/products?limit=1000')
      products.value = res.data.data
      initialized.value = true
      return res.data.data
    } catch (error) {
      console.error('Failed to fetch products for select:', error)
      throw error
    }
  }

  function updateStock(productId: number, quantityChange: number) {
    const product = products.value.find(p => p.id === productId)
    if (product) {
      product.stock = Math.max(0, (product.stock || 0) + quantityChange)
    }
  }

  function updateProduct(updatedProduct: Product) {
    const index = products.value.findIndex(p => p.id === updatedProduct.id)
    if (index !== -1) {
      products.value[index] = updatedProduct
    }
  }

  function addProduct(newProduct: Product) {
    products.value.unshift(newProduct)
  }

  function removeProduct(productId: number) {
    const index = products.value.findIndex(p => p.id === productId)
    if (index !== -1) {
      products.value.splice(index, 1)
    }
  }

  function reset() {
    products.value = []
    initialized.value = false
  }

  return {
    products,
    loading,
    initialized,
    getProductById,
    totalStock,
    lowStockProducts,
    fetchAll,
    fetchForSelect,
    updateStock,
    updateProduct,
    addProduct,
    removeProduct,
    reset,
  }
})