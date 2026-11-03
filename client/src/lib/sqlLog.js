import { useSyncExternalStore } from 'react'

const MAX_REQUESTS = 20

let entries = []
let nextId = 1
const listeners = new Set()

const notify = () => {
  for (const listener of listeners) {
    listener()
  }
}

export const addSqlRequest = ({ method, url, queries }) => {
  const entry = {
    id: nextId,
    method: (method || 'GET').toUpperCase(),
    url: url || '',
    queries: Array.isArray(queries) ? queries : [],
    time: new Date().toISOString(),
  }

  nextId += 1
  entries = [entry, ...entries].slice(0, MAX_REQUESTS)
  notify()
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => entries


export const useSqlLog = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
