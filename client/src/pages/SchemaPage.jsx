import { useEffect, useState } from 'react'
import {
  getAuditLog,
  getIndexes,
  getRoutines,
  getSchema,
  getTriggers,
  getViewRows,
  getViews,
  tryRoutine,
} from '../api/schemaApi'
import SqlPanel from '../components/SqlPanel'

const TABS = ['Tables', 'Views', 'Triggers', 'Routines', 'Indexes']
const DIAGRAM_URL = '/er-diagram.png'

const formatDefault = (value) => {
  if (value === null || value === undefined) return '—'
  return String(value)
}

const formatCell = (value) => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const formatTimestamp = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

const copyToClipboard = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

function CopyButton({ text }) {
  const [status, setStatus] = useState('idle')

  const handleCopy = async () => {
    try {
      await copyToClipboard(text)
      setStatus('copied')
      window.setTimeout(() => setStatus('idle'), 1500)
    } catch {
      setStatus('failed')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white transition hover:bg-amber-600"
    >
      {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  )
}

function SqlBlock({ sql, compact = false }) {
  if (!sql) {
    return (
      <p
        className={`rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500 ${
          compact ? '' : 'mt-3'
        }`}
      >
        No definition available.
      </p>
    )
  }

  return (
    <div className={`relative ${compact ? '' : 'mt-3'}`}>
      <div className="absolute right-2 top-2">
        <CopyButton text={sql} />
      </div>
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 pr-24 text-xs leading-relaxed text-slate-100">
        <code>{sql}</code>
      </pre>
    </div>
  )
}

function EmptyState({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
      {children}
    </p>
  )
}

function DataTable({ columns, rows, emptyMessage = 'No rows returned.' }) {
  const effectiveColumns =
    columns && columns.length > 0
      ? columns
      : rows && rows.length > 0
        ? Object.keys(rows[0])
        : []

  if (effectiveColumns.length === 0) {
    return <EmptyState>{emptyMessage}</EmptyState>
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {effectiveColumns.map((column) => (
              <th key={column} className="px-3 py-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows && rows.length > 0 ? (
            rows.map((row, index) => (
              <tr key={index} className="border-b border-slate-100 last:border-0">
                {effectiveColumns.map((column) => (
                  <td key={column} className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {formatCell(row[column])}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={effectiveColumns.length} className="px-3 py-3 text-sm text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function RoutineTry({ routine }) {
  const isOrderTotal = routine.name === 'fn_order_total'
  const isDailySales = routine.name === 'sp_daily_sales'

  const [value, setValue] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  if (!isOrderTotal && !isDailySales) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const args = isOrderTotal ? [Number(value)] : [value]
      const data = await tryRoutine(routine.name, args)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not run this routine')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-700">Try it</p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        {isOrderTotal ? (
          <label className="text-sm text-slate-600">
            Order id
            <input
              type="number"
              min="1"
              step="1"
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="e.g. 1"
              className="ml-2 w-32 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800"
            />
          </label>
        ) : (
          <label className="text-sm text-slate-600">
            Date
            <input
              type="date"
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800"
            />
          </label>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Running…' : 'Run'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-3 space-y-3">
          {result.resultSets && result.resultSets.length > 0 ? (
            result.resultSets.map((set, index) => (
              <div key={index}>
                {result.resultSets.length > 1 && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Result set {index + 1}
                  </p>
                )}
                <DataTable columns={set.columns} rows={set.rows} />
              </div>
            ))
          ) : (
            <EmptyState>No rows returned.</EmptyState>
          )}
        </div>
      )}
    </form>
  )
}

export default function SchemaPage() {
  const [schema, setSchema] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('Tables')
  const [diagramMissing, setDiagramMissing] = useState(false)

  const [resources, setResources] = useState({})
  const [resourceLoading, setResourceLoading] = useState({})
  const [resourceErrors, setResourceErrors] = useState({})

  const [expandedViews, setExpandedViews] = useState({})
  const [viewRows, setViewRows] = useState({})
  const [viewRowLoading, setViewRowLoading] = useState({})
  const [viewRowErrors, setViewRowErrors] = useState({})

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

  const loadResource = async (key, fetcher) => {
    setResourceLoading((prev) => ({ ...prev, [key]: true }))
    setResourceErrors((prev) => ({ ...prev, [key]: null }))

    try {
      const data = await fetcher()
      setResources((prev) => ({ ...prev, [key]: Array.isArray(data) ? data : [] }))
    } catch (err) {
      setResources((prev) => ({ ...prev, [key]: [] }))
      setResourceErrors((prev) => ({
        ...prev,
        [key]: err.response?.data?.error || 'Could not load this section',
      }))
    } finally {
      setResourceLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  useEffect(() => {
    fetchSchema()
    loadResource('views', getViews)
    loadResource('triggers', getTriggers)
    loadResource('auditLog', getAuditLog)
    loadResource('routines', getRoutines)
    loadResource('indexes', getIndexes)
  }, [])

  const toggleViewRows = async (name) => {
    const isOpen = Boolean(expandedViews[name])
    setExpandedViews((prev) => ({ ...prev, [name]: !isOpen }))

    if (isOpen || viewRows[name]) return

    setViewRowLoading((prev) => ({ ...prev, [name]: true }))
    setViewRowErrors((prev) => ({ ...prev, [name]: null }))

    try {
      const data = await getViewRows(name)
      setViewRows((prev) => ({ ...prev, [name]: data }))
    } catch (err) {
      setViewRowErrors((prev) => ({
        ...prev,
        [name]: err.response?.data?.error || 'Could not load rows',
      }))
    } finally {
      setViewRowLoading((prev) => ({ ...prev, [name]: false }))
    }
  }

  if (loading) return <p className="p-6 text-slate-600">Loading schema…</p>
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>

  const tables = schema?.tables || []
  const foreignKeys = schema?.foreignKeys || []
  const views = resources.views || []
  const triggers = resources.triggers || []
  const auditLog = resources.auditLog || []
  const routines = resources.routines || []
  const indexes = resources.indexes || []

  const foreignKeysFor = (tableName) => foreignKeys.filter((fk) => fk.table === tableName)

  const resourceMessage = (key, label) => {
    if (resourceLoading[key] && !resources[key]) {
      return <p className="text-sm text-slate-500">Loading {label}…</p>
    }
    if (resourceErrors[key]) {
      return <p className="text-sm text-red-600">{resourceErrors[key]}</p>
    }
    return null
  }

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
          <div className="mt-6">
            <EmptyState>No tables found in this database yet.</EmptyState>
          </div>
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

      {activeTab === 'Views' && (
        <div className="mt-4">
          {resourceMessage('views', 'views') ||
            (views.length === 0 ? (
              <EmptyState>
                No views have been created yet. Add one in <code>server/sql/views.sql</code> to preview it here.
              </EmptyState>
            ) : (
              <div className="space-y-4">
                {views.map((view) => {
                  const isOpen = Boolean(expandedViews[view.name])
                  const preview = viewRows[view.name]

                  return (
                    <section key={view.name} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-800">{view.name}</h3>
                          {view.columns && view.columns.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {view.columns.map((column) => (
                                <span
                                  key={column.name}
                                  className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                                >
                                  {column.name} <span className="text-slate-400">· {column.type}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleViewRows(view.name)}
                          className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-600"
                        >
                          {isOpen ? 'Hide rows' : 'Show 10 rows'}
                        </button>
                      </div>

                      <SqlBlock sql={view.definition} />

                      {isOpen && (
                        <div className="mt-3">
                          {viewRowLoading[view.name] ? (
                            <p className="text-sm text-slate-500">Loading rows…</p>
                          ) : viewRowErrors[view.name] ? (
                            <p className="text-sm text-red-600">{viewRowErrors[view.name]}</p>
                          ) : preview ? (
                            <DataTable
                              columns={preview.columns}
                              rows={preview.rows}
                              emptyMessage="This view returned no rows."
                            />
                          ) : null}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            ))}
        </div>
      )}

      {activeTab === 'Triggers' && (
        <div className="mt-4 space-y-6">
          <div>
            {resourceMessage('triggers', 'triggers') ||
              (triggers.length === 0 ? (
                <EmptyState>
                  No triggers are installed yet. Add one in <code>server/sql/routines.sql</code> to see it here.
                </EmptyState>
              ) : (
                <div className="space-y-4">
                  {triggers.map((trigger) => (
                    <section key={trigger.name} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-800">{trigger.name}</h3>
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          {trigger.timing} {trigger.event}
                        </span>
                        <span className="text-xs text-slate-500">on {trigger.table}</span>
                      </div>

                      <SqlBlock sql={trigger.definition} />
                    </section>
                  ))}
                </div>
              ))}
          </div>

          <section>
            <h3 className="text-lg font-semibold text-slate-800">Recent status changes</h3>
            <p className="mt-1 text-sm text-slate-600">The last 10 writes to order_status_log.</p>

            <div className="mt-3">
              {resourceMessage('auditLog', 'the audit log') ||
                (auditLog.length === 0 ? (
                  <EmptyState>No status changes have been logged yet.</EmptyState>
                ) : (
                  <DataTable
                    columns={['order_id', 'old_status', 'new_status', 'changed_at']}
                    rows={auditLog.map((row) => ({
                      ...row,
                      changed_at: formatTimestamp(row.changed_at),
                    }))}
                    emptyMessage="No status changes have been logged yet."
                  />
                ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'Routines' && (
        <div className="mt-4">
          {resourceMessage('routines', 'routines') ||
            (routines.length === 0 ? (
              <EmptyState>
                No routines are installed yet. Add one in <code>server/sql/routines.sql</code> to see it here.
              </EmptyState>
            ) : (
              <div className="space-y-4">
                {routines.map((routine) => (
                  <section
                    key={`${routine.type}-${routine.name}`}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-800">{routine.name}</h3>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {routine.type}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-600">
                      {routine.params && routine.params.length > 0
                        ? routine.params
                            .map((param) => `${param.mode} ${param.name} ${param.type}`)
                            .join(', ')
                        : 'No parameters'}
                    </p>

                    <SqlBlock sql={routine.definition} />
                    <RoutineTry routine={routine} />
                  </section>
                ))}
              </div>
            ))}
        </div>
      )}

      {activeTab === 'Indexes' && (
        <div className="mt-4">
          {resourceMessage('indexes', 'indexes') ||
            (indexes.length === 0 ? (
              <EmptyState>No secondary indexes are defined yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Table</th>
                      <th className="px-4 py-3">Index</th>
                      <th className="px-4 py-3">Columns</th>
                      <th className="px-4 py-3">Unique</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Definition</th>
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
                        <td className="px-4 py-3 text-slate-600">{index.type}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="min-w-[22rem] max-w-xl">
                            <SqlBlock sql={index.createStatement} compact />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      )}

      <SqlPanel />
    </div>
  )
}
