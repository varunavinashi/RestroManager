import api from './client'

// GET /api/reports/summary
export const getReportSummary = async () => {
  const res = await api.get('/reports/summary')
  return res.data.data
}
