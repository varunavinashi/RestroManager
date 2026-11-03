import api from './client'

// GET /api/schema
export const getSchema = async () => {
  const res = await api.get('/schema')
  return res.data.data
}
