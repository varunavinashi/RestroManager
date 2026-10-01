import api from './client'

// GET /api/menu?search=&category= — items will be grouped with their categories in the response

export const getMenu = async (search = '', category = '') => {
  const res = await api.get('/menu', {
    params: { search: search || undefined, category: category || undefined },
  })
  return res.data.data
}

// POST /api/menu
export const createMenuItem = async (item) => {
  const res = await api.post('/menu', item)
  return res.data.data
}

// PUT /api/menu/:id
export const updateMenuItem = async (id, updates) => {
  const res = await api.put(`/menu/${id}`, updates)
  return res.data.data
}

// DELETE /api/menu/:id
export const deleteMenuItem = async (id) => {
  const res = await api.delete(`/menu/${id}`)
  return res.data.data
}