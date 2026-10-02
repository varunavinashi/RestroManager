import { useEffect, useState } from 'react'
import { getOrders, getOrderById, updateOrderStatus } from '../api/ordersApi'

const ORDER_STATUSES = ['pending', 'preparing', 'served', 'paid']

const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-800',
  preparing: 'bg-blue-100 text-blue-800',
  served: 'bg-indigo-100 text-indigo-800',
  paid: 'bg-green-100 text-green-800',
}

// For later query display
const ORDERS_LIST_SQL = `SELECT
  o.order_id,
  o.table_id,
  t.table_number,
  o.customer_id,
  c.name AS customer_name,
  o.staff_id,
  s.name AS staff_name,
  o.order_time,
  o.status,
  o.total_amount,
  COUNT(oi.order_item_id) AS item_count
FROM orders o
JOIN restaurant_tables t ON t.table_id = o.table_id
LEFT JOIN customers c ON c.customer_id = o.customer_id
LEFT JOIN staff s ON s.staff_id = o.staff_id
LEFT JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY o.order_id, o.table_id, t.table_number, o.customer_id, c.name,
         o.staff_id, s.name, o.order_time, o.status, o.total_amount
ORDER BY o.order_time DESC, o.order_id DESC;`

const formatTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [expandedId, setExpandedId] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  const [showSql, setShowSql] = useState(false)

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getOrders()
      setOrders(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleRow = async (orderId) => {
    if (expandedId === orderId) {
      setExpandedId(null)
      setSelectedOrder(null)
      return
    }

    try {
      setExpandedId(orderId)
      setDetailLoading(true)
      setError(null)
      const data = await getOrderById(orderId)
      setSelectedOrder(data)
    } catch (err) {
      setExpandedId(null)
      setError(err.response?.data?.error || `Failed to load order ${orderId}`)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStatusChange = async (orderId, status) => {
    try {
      setUpdatingId(orderId)
      setError(null)
      const updated = await updateOrderStatus(orderId, status)
      setOrders((prev) => prev.map((order) => (order.order_id === orderId ? { ...order, ...updated } : order)))
      setSelectedOrder((prev) => (prev && prev.order_id === orderId ? { ...prev, ...updated } : prev))
    } catch (err) {
      setError(err.response?.data?.error || `Failed to update order ${orderId}`)
      await fetchOrders()
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) return <p className="p-6 text-slate-600">Loading orders…</p>

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
          <p className="mt-1 text-slate-600">Newest first. Click a row to see its items.</p>
        </div>
        <button
          type="button"
          onClick={fetchOrders}
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

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowSql((prev) => !prev)}
          className="text-sm font-medium text-amber-600 transition hover:text-amber-700"
        >
          {showSql ? 'Hide SQL query' : 'View SQL query'}
        </button>

        {showSql && (
          <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
            <code>{ORDERS_LIST_SQL}</code>
          </pre>
        )}
      </div>

      {orders.length === 0 ? (
        <p className="mt-6 text-slate-600">No orders placed yet</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Table</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Order time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const isExpanded = expandedId === order.order_id
                return (
                  <tr
                    key={order.order_id}
                    onClick={() => handleToggleRow(order.order_id)}
                    className="cursor-pointer border-b border-slate-100 align-top transition last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">Table {order.table_number}</td>
                    <td className="px-4 py-3 text-slate-700">{order.item_count}</td>
                    <td className="px-4 py-3 text-slate-800">₹{Number(order.total_amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[order.status] || 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatTime(order.order_time)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {expandedId !== null && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-800">Order #{expandedId}</h2>

            <select
              value={selectedOrder ? selectedOrder.status : ''}
              onChange={(event) => handleStatusChange(expandedId, event.target.value)}
              disabled={updatingId === expandedId || !selectedOrder}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none disabled:opacity-60"
            >
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          {detailLoading ? (
            <p className="mt-3 text-sm text-slate-600">Loading items…</p>
          ) : (
            selectedOrder && (
              <table className="mt-3 w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Item</th>
                    <th className="py-2 pr-4 font-medium">Qty</th>
                    <th className="py-2 pr-4 font-medium">Price</th>
                    <th className="py-2 font-medium">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) => (
                    <tr key={item.order_item_id} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-2 pr-4 text-slate-800">{item.item_name}</td>
                      <td className="py-2 pr-4 text-slate-700">{item.quantity}</td>
                      <td className="py-2 pr-4 text-slate-700">₹{Number(item.price_at_order).toFixed(2)}</td>
                      <td className="py-2 text-slate-800">₹{Number(item.line_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {selectedOrder && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-sm">
              <span className="font-medium text-slate-700">Order total</span>
              <span className="text-lg font-semibold text-slate-800">
                ₹{Number(selectedOrder.total_amount).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}