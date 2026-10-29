import api from './client'

// GET /api/reports/summary
export const getReportSummary = async () => {
  const res = await api.get('/reports/summary')
  return res.data.data
}

// GET /api/reports/daily-sales
export const getDailySales = async () => {
  const res = await api.get('/reports/daily-sales')
  return res.data.data
}
