import api from './client'

// GET /api/categories
export const getCategories = async () => {
  const res = await api.get('/categories')
  return res.data.data
}