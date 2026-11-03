import { useState } from 'react'
import { useSqlLog } from '../lib/sqlLog'

const formatTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString()
}

export default function SqlPanel() {
  const requests = useSqlLog()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="mt-8">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 text-sm font-medium text-amber-600 transition hover:text-amber-700"
      >
        {isOpen ? 'Hide SQL executed' : 'SQL executed'}
        {requests.length > 0 && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {requests.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="mt-2 space-y-3">
          {requests.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
              No SQL captured yet. Start the server with SHOW_SQL=true to record queries.
            </p>
          ) : (
            requests.map((request) => (
              <div key={request.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">
                    <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-700">
                      {request.method}
                    </span>
                    {request.url}
                  </p>
                  <span className="text-xs text-slate-500">{formatTime(request.time)}</span>
                </div>

                <div className="mt-3 space-y-2">
                  {request.queries.length === 0 ? (
                    <p className="text-sm text-slate-600">No statements recorded for this request.</p>
                  ) : (
                    request.queries.map((query, index) => (
                      <pre
                        key={`${request.id}-${index}`}
                        className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100"
                      >
                        <code>{query.sql}</code>
                        <span className="mt-2 block text-slate-400">
                          params: {query.params && query.params.length > 0 ? JSON.stringify(query.params) : 'none'}
                        </span>
                        <span className="mt-1 block text-slate-400">
                          {query.ms} ms · {query.rowCount === null || query.rowCount === undefined ? '—' : query.rowCount} rows
                        </span>
                      </pre>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
