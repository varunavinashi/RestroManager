import { useEffect, useState } from 'react'
import { getQueryLabQueries, runQueryLabQuery } from '../api/queryLabApi'

const groupQueriesByConcept = (queries) => {
  const groups = []

  for (const query of queries) {
    const concept = query.concepts.split(',')[0].trim() || 'Other'
    let group = groups.find((entry) => entry.concept === concept)

    if (!group) {
      group = { concept, queries: [] }
      groups.push(group)
    }

    group.queries.push(query)
  }

  return groups
}

const formatCell = (value) => {
  if (value === null || value === undefined) return 'NULL'
  return String(value)
}

export default function QueryLabPage() {
  const [queries, setQueries] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchQueries()
  }, [])

  useEffect(() => {
    if (selectedId !== null) runQuery(selectedId)
  }, [selectedId])

  const fetchQueries = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getQueryLabQueries()
      setQueries(data)
      if (data.length > 0) setSelectedId(data[0].id)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load query catalog')
    } finally {
      setLoading(false)
    }
  }

  const runQuery = async (id) => {
    try {
      setRunning(true)
      setError(null)
      setResult(null)
      const data = await runQueryLabQuery(id)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || `Failed to run query ${id}`)
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <p className="p-6 text-slate-600">Loading query catalog…</p>

  const groups = groupQueriesByConcept(queries)
  const selectedQuery = queries.find((query) => query.id === selectedId)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Query Lab</h1>
      <p className="mt-1 text-slate-600">
        Run the course queries against the live database. Results are capped at 100 rows.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {queries.length === 0 ? (
        <p className="mt-6 text-slate-600">No queries available</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr]">
          <aside className="rounded-lg border border-slate-200 bg-white p-3">
            {groups.map((group) => (
              <div key={group.concept} className="mb-4 last:mb-0">
                <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {group.concept}
                </h2>

                <ul className="mt-2 space-y-1">
                  {group.queries.map((query) => (
                    <li key={query.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(query.id)}
                        className={`w-full rounded px-2 py-1.5 text-left text-sm transition ${
                          selectedId === query.id
                            ? 'bg-amber-500 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="mr-1 font-mono text-xs opacity-75">Q{query.id}</span>
                        {query.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>

          <section className="min-w-0">
            {selectedQuery ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-800">{selectedQuery.title}</h2>
                  <span className="text-xs font-medium text-slate-500">
                    Q{selectedQuery.id} · {selectedQuery.concepts}
                  </span>
                </div>

                <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
                  <code>{selectedQuery.sql}</code>
                </pre>

                {running ? (
                  <p className="mt-4 text-sm text-slate-600">Running query…</p>
                ) : (
                  result &&
                  result.id === selectedQuery.id && (
                    <>
                      {result.rows.length === 0 ? (
                        <p className="mt-4 text-slate-600">No rows returned</p>
                      ) : (
                        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-left text-sm">
                            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                              <tr>
                                {result.columns.map((column) => (
                                  <th key={column} className="whitespace-nowrap px-4 py-3 font-medium">
                                    {column}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {result.rows.map((row, rowIndex) => (
                                <tr
                                  key={rowIndex}
                                  className="border-b border-slate-100 last:border-b-0"
                                >
                                  {result.columns.map((column) => (
                                    <td key={column} className="whitespace-nowrap px-4 py-2 text-slate-700">
                                      {formatCell(row[column])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-4 text-sm text-slate-600">
                        <span>
                          {result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'}
                        </span>
                        <span>{result.ms} ms</span>
                      </div>
                    </>
                  )
                )}
              </>
            ) : (
              <p className="text-slate-600">Select a query</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
