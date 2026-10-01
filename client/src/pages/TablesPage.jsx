import { useEffect, useState } from 'react'
import { getTables, updateTableStatus } from '../api/tablesApi'

const NEXT_STATUS = { free: 'occupied', occupied: 'free' }

export default function TablesPage() {
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pendingId, setPendingId] = useState(null)

  useEffect(() => {
    fetchTables()
  }, [])

  const fetchTables = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getTables()
      setTables(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tables')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (table) => {
    try {
      setPendingId(table.table_id)
      setError(null)
      await updateTableStatus(table.table_id, NEXT_STATUS[table.status])
      await fetchTables()
    } catch (err) {
      setError(err.response?.data?.error || `Failed to update table ${table.table_number}`)
    } finally {
      setPendingId(null)
    }
  }

  if (loading) return <p className="p-6 text-slate-600">Loading tables…</p>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Tables</h1>
      <p className="mt-1 text-slate-600">Click a table to toggle its status.</p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {tables.length === 0 ? (
        <p className="mt-6 text-slate-600">No tables found</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tables.map((table) => {
            const isFree = table.status === 'free'
            return (
              <button
                key={table.table_id}
                type="button"
                onClick={() => handleToggle(table)}
                disabled={pendingId === table.table_id}
                className={`rounded-lg border p-4 text-left transition disabled:opacity-60 ${
                  isFree
                    ? 'border-green-300 bg-green-50 hover:bg-green-100'
                    : 'border-red-300 bg-red-50 hover:bg-red-100'
                }`}
              >
                <p className={`text-lg font-semibold ${isFree ? 'text-green-800' : 'text-red-800'}`}>
                  Table {table.table_number}
                </p>
                <p className="mt-1 text-sm text-slate-600">Capacity {table.capacity}</p>
                <span
                  className={`mt-3 inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    isFree ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                  }`}
                >
                  {pendingId === table.table_id ? 'Updating…' : isFree ? 'Free' : 'Occupied'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}