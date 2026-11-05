import api from './client'

// GET /api/schema
export const getSchema = async () => {
  const res = await api.get('/schema')
  return res.data.data
}

// GET /api/schema/views
export const getViews = async () => {
  const res = await api.get('/schema/views')
  return res.data.data
}

// GET /api/schema/views/:name/rows
export const getViewRows = async (name) => {
  const res = await api.get(`/schema/views/${encodeURIComponent(name)}/rows`)
  return res.data.data
}

// GET /api/schema/triggers
export const getTriggers = async () => {
  const res = await api.get('/schema/triggers')
  return res.data.data
}

// GET /api/schema/audit-log
export const getAuditLog = async () => {
  const res = await api.get('/schema/audit-log')
  return res.data.data
}

// GET /api/schema/routines
export const getRoutines = async () => {
  const res = await api.get('/schema/routines')
  return res.data.data
}

// POST /api/schema/routines/try
export const tryRoutine = async (name, args) => {
  const res = await api.post('/schema/routines/try', { name, args })
  return res.data.data
}

// GET /api/schema/indexes
export const getIndexes = async () => {
  const res = await api.get('/schema/indexes')
  return res.data.data
}
