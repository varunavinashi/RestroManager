import { useEffect, useState } from 'react'
import { getSchema } from '../api/schemaApi'
import SqlPanel from '../components/SqlPanel'

const TABS = ['Tables', 'Views', 'Triggers', 'Routines', 'Indexes']
const DIAGRAM_URL = '/er-diagram.png'

const formatDefault = (value) => {
  if (value === null || value === undefined) return '—'
  return String(value)
}

export default function SchemaPage() {
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('Tables')
  const [diagramMissing, setDiagramMissing] = useState(false)

  useEffect(() => {
    fetchSchema()
  }, [])

  const fetchSchema = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getSchema()
      setSchema(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load schema')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <p className="p-6 text-slate-600">Loading schema…</p>
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>

  const tables = schema?.tables || []
  const foreignKeys = schema?.foreignKeys || []
  const indexes = schema?.indexes || []
  const views = schema?.views || []
  const triggers = schema?.triggers || []
  const routines = schema?.routines || []

  const foreignKeysFor = (tableName) => foreignKeys.filter((fk) => fk.table === tableName)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Database Schema</h1>
      <p className="mt-1 text-slate-600">Live metadata read from INFORMATION_SCHEMA.</p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">ER diagram</h2>
          <a
            href={DIAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600"
          >
            Open image in new tab
          </a>
        </div>

        {diagramMissing ? (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            ER diagram not available. Add <code className="rounded bg-slate-200 px-1">er-diagram.png</code> to{' '}
            <code className="rounded bg-slate-200 px-1">client/public</code>.
          </p>
        ) : (
          <img
            src={DIAGRAM_URL}
            alt="Entity relationship diagram"
            className="mt-3 w-full rounded-lg border border-slate-200"
            onError={() => setDiagramMissing(true)}
          />
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              activeTab === tab
                ? 'bg-amber-500 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Tables' &&
        (tables.length === 0 ? (
          <p className="mt-6 text-slate-600">No tables found</p>
        ) : (
          <div className="mt-4 space-y-4">
            {tables.map((table) => {
              const tableForeignKeys = foreignKeysFor(table.name)

              return (
                <section key={table.name} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-lg font-semibold text-slate-800">{table.name}</h3>

                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-2 py-2">Column</th>
                          <th className="px-2 py-2">Type</th>
                          <th className="px-2 py-2">Nullable</th>
                          <th className="px-2 py-2">Key</th>
                          <th className="px-2 py-2">Default</th>
                          <th className="px-2 py-2">Extra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.columns.map((column) => (
                          <tr key={column.name} className="border-b border-slate-100 last:border-0">
                            <td className="px-2 py-2 font-medium text-slate-800">{column.name}</td>
                            <td className="px-2 py-2 text-slate-600">{column.type}</td>
                            <td className="px-2 py-2 text-slate-600">{column.nullable ? 'YES' : 'NO'}</td>
                            <td className="px-2 py-2 text-slate-600">{column.key || '—'}</td>
                            <td className="px-2 py-2 text-slate-600">{formatDefault(column.default)}</td>
                            <td className="px-2 py-2 text-slate-600">{column.extra || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h4 className="mt-4 text-sm font-semibold text-slate-700">Foreign keys</h4>
                  {tableForeignKeys.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-500">No foreign keys</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-sm text-slate-600">
                      {tableForeignKeys.map((fk) => (
                        <li key={`${fk.column}-${fk.referenced_table}-${fk.referenced_column}`}>
                          <span className="font-medium text-slate-800">{fk.column}</span>
                          {' → '}
                          {fk.referenced_table}.{fk.referenced_column}
                          <span className="ml-2 text-slate-500">
                            ON DELETE {fk.delete_rule} · ON UPDATE {fk.update_rule}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        ))}

      {activeTab === 'Views' &&
        (views.length === 0 ? (
          <p className="mt-6 text-slate-600">No views found</p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {views.map((view) => (
              <li
                key={view.name}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800"
              >
                {view.name}
              </li>
            ))}
          </ul>
        ))}

      {activeTab === 'Triggers' &&
        (triggers.length === 0 ? (
          <p className="mt-6 text-slate-600">No triggers found</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Timing</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Table</th>
                </tr>
              </thead>
              <tbody>
                {triggers.map((trigger) => (
                  <tr key={trigger.name} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">{trigger.name}</td>
                    <td className="px-4 py-3 text-slate-600">{trigger.timing}</td>
                    <td className="px-4 py-3 text-slate-600">{trigger.event}</td>
                    <td className="px-4 py-3 text-slate-600">{trigger.table}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {activeTab === 'Routines' &&
        (routines.length === 0 ? (
          <p className="mt-6 text-slate-600">No routines found</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Routine</th>
                  <th className="px-4 py-3">Type</th>
                </tr>
              </thead>
              <tbody>
                {routines.map((routine) => (
                  <tr key={`${routine.type}-${routine.name}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">{routine.name}</td>
                    <td className="px-4 py-3 text-slate-600">{routine.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {activeTab === 'Indexes' &&
        (indexes.length === 0 ? (
          <p className="mt-6 text-slate-600">No indexes found</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Table</th>
                  <th className="px-4 py-3">Index</th>
                  <th className="px-4 py-3">Columns</th>
                  <th className="px-4 py-3">Unique</th>
                </tr>
              </thead>
              <tbody>
                {indexes.map((index) => (
                  <tr
                    key={`${index.table}-${index.name}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{index.table}</td>
                    <td className="px-4 py-3 text-slate-600">{index.name}</td>
                    <td className="px-4 py-3 text-slate-600">{index.columns.join(', ')}</td>
                    <td className="px-4 py-3 text-slate-600">{index.unique ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <SqlPanel />
    </div>
  )
}
