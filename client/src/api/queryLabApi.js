import api from './client'

export const getQueryLabQueries = async () => {
  const res = await api.get('/query-lab')
  return res.data.data
}

export const runQueryLabQuery = async (id) => {
  const res = await api.get(`/query-lab/${id}`)
  return res.data.data
}
