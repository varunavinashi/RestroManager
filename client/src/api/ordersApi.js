import api from './client'

// POST /api/orders
export const createOrder = async (order) => {
  const res = await api.post('/orders', order)
  return res.data.data
}

// GET /api/orders
export const getOrders = async () => {
  const res = await api.get('/orders')
  return res.data.data
}

// GET /api/orders/:id
export const getOrderById = async (id) => {
  const res = await api.get(`/orders/${id}`)
  return res.data.data
}

// PUT /api/orders/:id/status
export const updateOrderStatus = async (id, status) => {
  const res = await api.put(`/orders/${id}/status`, { status })
  return res.data.data
}