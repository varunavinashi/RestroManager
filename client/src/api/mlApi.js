import api from './client'

// GET /api/ml/recommendations?item_ids=1,2,3&limit=3
export const getRecommendations = async (itemIds, limit = 3) => {
  const res = await api.get('/ml/recommendations', {
    params: { item_ids: itemIds.join(','), limit },
  })
  return res.data.data
}

// GET /api/ml/metrics
export const getMetrics = async () => {
  const res = await api.get('/ml/metrics')
  return res.data.data
}

// GET /api/ml/top-pairs?limit=10
export const getTopPairs = async (limit = 10) => {
  const res = await api.get('/ml/top-pairs', { params: { limit } })
  return res.data.data
}
