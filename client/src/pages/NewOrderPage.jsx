import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMenu } from '../api/menuApi'
import { getTables } from '../api/tablesApi'
import { createOrder } from '../api/ordersApi'

export default function NewOrderPage() {
  const navigate = useNavigate()

  const [tables, setTables] = useState([])
  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState([])
  const [tableId, setTableId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [tableData, menuData] = await Promise.all([getTables(), getMenu()])
      setTables(tableData)
      setMenu(menuData)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tables and menu')
    } finally {
      setLoading(false)
    }
  }

  const freeTables = tables.filter((table) => table.status === 'free')
  const availableItems = menu.filter((item) => item.is_available)

  const quantityInCart = (itemId) => {
    const line = cart.find((entry) => entry.item_id === itemId)
    return line ? line.quantity : 0
  }

  
  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((entry) => entry.item_id === item.item_id)
      if (existing) {
        return prev.map((entry) =>
          entry.item_id === item.item_id ? { ...entry, quantity: entry.quantity + 1 } : entry
        )
      }
      return [...prev, { item_id: item.item_id, name: item.name, price: Number(item.price), quantity: 1 }]
    })
  }

  const changeQuantity = (itemId, delta) => {
    setCart((prev) =>
      prev
        .map((entry) =>
          entry.item_id === itemId ? { ...entry, quantity: entry.quantity + delta } : entry
        )
        .filter((entry) => entry.quantity > 0)
    )
  }

  const removeFromCart = (itemId) => {
    setCart((prev) => prev.filter((entry) => entry.item_id !== itemId))
  }

  // Totals are summed in cents
  const grandTotal = cart.reduce((cents, entry) => cents + Math.round(entry.price * 100) * entry.quantity, 0) / 100

  const handlePlaceOrder = async () => {
    if (!tableId) {
      setError('Select a table before placing the order.')
      return
    }
    if (cart.length === 0) {
      setError('Add at least one menu item before placing the order.')
      return
    }

    try {
      setPlacing(true)
      setError(null)
      const created = await createOrder({
        table_id: Number(tableId),
        items: cart.map((entry) => ({ item_id: entry.item_id, quantity: entry.quantity })),
      })
      navigate('/orders', { state: { placedOrder: created } })
    } catch (err) {
      
      setError(err.response?.data?.error || 'Could not place the order. Please try again.')
    } finally {
      setPlacing(false)
    }
  }

  if (loading) return <p className="p-6 text-slate-600">Loading menu…</p>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">New Order</h1>
      <p className="mt-1 text-slate-600">Pick a free table and add items to the order.</p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label htmlFor="table" className="text-sm font-medium text-slate-700">
              Table
            </label>
            <select
              id="table"
              value={tableId}
              onChange={(event) => setTableId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="">Select a free table…</option>
              {freeTables.map((table) => (
                <option key={table.table_id} value={table.table_id}>
                  Table {table.table_number} — capacity {table.capacity}
                </option>
              ))}
            </select>
            {freeTables.length === 0 && (
              <p className="mt-2 text-sm text-red-600">No free tables available right now.</p>
            )}
          </div>

          <h2 className="mt-6 text-lg font-semibold text-slate-800">Menu</h2>

          {availableItems.length === 0 ? (
            <p className="mt-3 text-slate-600">No available menu items</p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {availableItems.map((item) => {
                const inCart = quantityInCart(item.item_id)
                return (
                  <div key={item.item_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
                    <div>
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <p className="text-sm text-slate-600">{item.category_name}</p>
                      <p className="text-sm text-slate-800">₹{Number(item.price).toFixed(2)}</p>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-amber-600"
                      >
                        Add to order
                      </button>
                      {inCart > 0 && <span className="text-xs text-slate-600">In order: {inCart}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-lg font-semibold text-slate-800">Current order</h2>

          {cart.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No items added yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {cart.map((entry) => (
                <li key={entry.item_id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800">{entry.name}</p>
                    <p className="text-sm text-slate-800">
                      ₹{(Math.round(entry.price * 100) * entry.quantity / 100).toFixed(2)}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeQuantity(entry.item_id, -1)}
                        className="h-7 w-7 rounded border border-slate-200 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm text-slate-800">{entry.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(entry.item_id, 1)}
                        className="h-7 w-7 rounded border border-slate-200 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(entry.item_id)}
                      className="text-xs text-red-600 transition hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
            <span className="font-medium text-slate-700">Grand total</span>
            <span className="text-lg font-semibold text-slate-800">₹{grandTotal.toFixed(2)}</span>
          </div>

          <button
            type="button"
            onClick={handlePlaceOrder}
            disabled={placing}
            className="mt-4 w-full rounded-lg bg-amber-500 px-4 py-2 font-medium text-white transition hover:bg-amber-600 disabled:opacity-60"
          >
            {placing ? 'Placing order…' : 'Place Order'}
          </button>
        </aside>
      </div>
    </div>
  )
}