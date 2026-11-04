import { useEffect, useState } from 'react'
import { getMetrics, getTopPairs } from '../api/mlApi'
import SqlPanel from '../components/SqlPanel'

const BAR_WIDTHS = {
  0: 'w-0',
  10: 'w-[10%]',
  20: 'w-[20%]',
  30: 'w-[30%]',
  40: 'w-[40%]',
  50: 'w-[50%]',
  60: 'w-[60%]',
  70: 'w-[70%]',
  80: 'w-[80%]',
  90: 'w-[90%]',
  100: 'w-full',
}

const barWidthClass = (value, max) => {
  if (!max) return 'w-0'
  const ratio = Number(value) / max
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 10) * 10))
  return BAR_WIDTHS[pct] || 'w-0'
}

const firstNumber = (...values) => {
  const found = values.find(
    (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
  )
  return found === undefined ? 0 : Number(found)
}

const getModelName = (model) => {
  if (!model) return 'Model'
  if (typeof model === 'string') return model
  return model.model_name || model.name || model.model || 'Model'
}

const getModelHit = (model) => {
  if (!model || typeof model !== 'object') return 0
  return firstNumber(
    model.hit_at_3,
    model.val_hit_at_3,
    model.validation_hit_at_3,
    model.test_hit_at_3,
    model.val?.hit_at_3,
    model.validation?.hit_at_3,
    model.test?.hit_at_3,
    model.metrics?.hit_at_3
  )
}

const formatMetric = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(3) : '—'
}

const formatCount = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString() : '—'
}

const formatScore = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(3) : '—'
}

const formatDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

export default function InsightsPage() {
  const [metrics, setMetrics] = useState(null)
  const [topPairs, setTopPairs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchInsights()
  }, [])

  const fetchInsights = async () => {
    try {
      setLoading(true)
      setError(null)
      const [metricsData, pairsData] = await Promise.all([getMetrics(), getTopPairs(10)])
      setMetrics(metricsData)
      setTopPairs(pairsData || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load recommendations insights')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <p className="p-6 text-slate-600">Loading insights…</p>
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>

  const models = metrics
    ? Array.isArray(metrics.models) && metrics.models.length > 0
      ? metrics.models
      : [metrics]
    : []
  const maxModelHit = models.reduce((max, model) => Math.max(max, getModelHit(model)), 0)

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Recommendation Insights</h1>
          <p className="mt-1 text-slate-600">Metrics and top item pairs from the latest training run.</p>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          Trained on synthetic data
        </span>
      </div>

      {!metrics ? (
        <section className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <h2 className="text-lg font-semibold text-slate-800">No model run yet</h2>
          <p className="mt-1 text-sm text-slate-600">Train the recommender first with npm run ml:train.</p>
        </section>
      ) : (
        <>
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-800">Latest model: {getModelName(metrics)}</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm text-slate-600">Hit@3</p>
                <p className="mt-2 text-3xl font-semibold text-slate-800">{formatMetric(metrics.hit_at_3)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm text-slate-600">MRR@3</p>
                <p className="mt-2 text-3xl font-semibold text-slate-800">{formatMetric(metrics.mrr_at_3)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm text-slate-600">Trained at</p>
                <p className="mt-2 text-base font-semibold text-slate-800">{formatDateTime(metrics.trained_at)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm text-slate-600">Train orders</p>
                <p className="mt-2 text-3xl font-semibold text-slate-800">{formatCount(metrics.n_train_orders)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm text-slate-600">Validation orders</p>
                <p className="mt-2 text-3xl font-semibold text-slate-800">{formatCount(metrics.n_val_orders)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm text-slate-600">Test orders</p>
                <p className="mt-2 text-3xl font-semibold text-slate-800">{formatCount(metrics.n_test_orders)}</p>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-800">Model comparison</h2>
            <p className="mt-1 text-sm text-slate-600">Hit@3 across the three candidate models.</p>

            <div className="mt-4 space-y-4">
              {models.map((model, index) => {
                const hit = getModelHit(model)

                return (
                  <div key={`${getModelName(model)}-${index}`}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{getModelName(model)}</span>
                      <span className="text-slate-600">{formatMetric(hit)}</span>
                    </div>
                    <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-3 rounded-full bg-amber-500 ${barWidthClass(hit, maxModelHit)}`} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-800">Top item pairs</h2>
        <p className="mt-1 text-sm text-slate-600">The strongest learned item-to-item recommendations.</p>

        {topPairs.length === 0 ? (
          <p className="mt-4 text-slate-600">No recommendation pairs yet</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Recommended item</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {topPairs.map((pair, index) => (
                  <tr
                    key={`${pair.item_id}-${pair.recommended_item_id}-${index}`}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{pair.item_name}</td>
                    <td className="px-4 py-3 text-slate-700">{pair.recommended_item_name}</td>
                    <td className="px-4 py-3 text-slate-700">{formatScore(pair.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-800">How it works</h2>
        <div className="mt-3 space-y-1 text-sm text-slate-600">
          <p>1. Each paid order is treated as a basket of menu items.</p>
          <p>2. The recommender learns which items appear together and scores every pair.</p>
          <p>3. For a cart, the API sums those scores and returns the strongest matches.</p>
        </div>
      </section>

      <SqlPanel />
    </div>
  )
}
