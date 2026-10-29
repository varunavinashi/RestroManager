import { useEffect, useState } from 'react'
import { getReportSummary, getDailySales } from '../api/reportsApi'

export default function ReportPage() {
  const [summary, setSummary] = useState({
    total_orders_today: 0,
    total_revenue_today: 0,
    top_items: [],
  })
  const [dailySales, setDailySales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchSummary()
  }, [])

  const fetchSummary = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getReportSummary()
      const daily = await getDailySales()
      setSummary({
        total_orders_today: data.total_orders_today,
        total_revenue_today: data.total_revenue_today,
        top_items: data.top_items,
      })
      setDailySales(daily)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <p className="p-6 text-slate-600">Loading report…</p>

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sales Report</h1>
          <p className="mt-1 text-slate-600">Today's totals, plus the best sellers of all time.</p>
        </div>
        <button
          type="button"
          onClick={fetchSummary}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Total Orders Today</p>
          <p className="mt-2 text-3xl font-semibold text-slate-800">{summary.total_orders_today}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Total Revenue Today</p>
          <p className="mt-2 text-3xl font-semibold text-slate-800">
            ₹{Number(summary.total_revenue_today).toFixed(2)}
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-800">Top 3 Items</h2>
      <p className="mt-1 text-sm text-slate-600">By total quantity ordered across all orders.</p>

      {summary.top_items.length === 0 ? (
        <p className="mt-4 text-slate-600">No items have been ordered yet</p>
      ) : (
        <ol className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {summary.top_items.map((item, index) => (
            <li key={item.item_id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                  {index + 1}
                </span>
                <span className="font-medium text-slate-800">{item.item_name}</span>
              </span>
              <span className="text-slate-600">{item.total_quantity} ordered</span>
            </li>
          ))}
        </ol>
      )}

      <h2 className="mt-8 text-lg font-semibold text-slate-800">Daily sales (last 14 days)</h2>
      <p className="mt-1 text-sm text-slate-600">Based on synthetic order data.</p>

      {dailySales.length === 0 ? (
        <p className="mt-4 text-slate-600">No daily sales yet</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Orders</th>
                <th className="px-4 py-3 font-medium">Revenue</th>
                <th className="px-4 py-3 font-medium">Avg order</th>
              </tr>
            </thead>
            <tbody>
              {dailySales.map((day) => (
                <tr key={day.sale_date} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3 text-slate-800">{day.sale_date}</td>
                  <td className="px-4 py-3 text-slate-700">{day.order_count}</td>
                  <td className="px-4 py-3 text-slate-800">₹{Number(day.revenue).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-700">₹{Number(day.avg_order_value).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
