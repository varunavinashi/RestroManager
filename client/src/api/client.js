import axios from 'axios'
import { addSqlRequest } from '../lib/sqlLog'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { 'Content-Type': 'application/json' },
})

const recordSql = (response) => {
  const meta = response && response.data && response.data.meta
  if (!meta || !Array.isArray(meta.queries)) return

  const config = response.config || {}
  addSqlRequest({
    method: config.method,
    url: config.url,
    queries: meta.queries,
  })
}

api.interceptors.response.use(
  (response) => {
    recordSql(response)
    return response
  },
  (error) => {
    if (error.response) recordSql(error.response)
    return Promise.reject(error)
  }
)

export default api
