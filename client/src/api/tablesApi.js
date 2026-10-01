import api from './client'

// GET /api/tables
export const getTables = async () => {
  const res = await api.get('/tables')
  return res.data.data
}

// PUT /api/tables/:id/status (free or occupied)
export const updateTableStatus = async (id, status) => {
  const res = await api.put(`/tables/${id}/status`, { status })
  return res.data.data
}