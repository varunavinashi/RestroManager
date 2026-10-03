import { useEffect, useState } from 'react'
import { createMenuItem, deleteMenuItem, getMenu, updateMenuItem } from '../api/menuApi'
import { getCategories } from '../api/categoriesApi'

const EMPTY_FORM = { name: '', category_id: '', price: '', is_available: true }

// Groups by category of items
function groupByCategory(items) {
  const groups = []
  for (const item of items) {
    const existing = groups.find((group) => group.category_id === item.category_id)
    if (existing) {
      existing.items.push(item)
    } else {
      groups.push({
        category_id: item.category_id,
        name: item.category_name,
        items: [item],
      })
    }
  }
  return groups
}

export default function MenuPage() {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    fetchItems()
  }, [search])

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchItems = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getMenu(search)
      setItems(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load menu')
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const data = await getCategories()
      setCategories(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load categories')
    }
  }

  const handleFieldChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleCancel = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setFormError(null)
    setShowForm(false)
  }

  const handleEdit = (item) => {
    setForm({
      name: item.name,
      category_id: String(item.category_id),
      price: String(Number(item.price)),
      is_available: item.is_available,
    })
    setEditingId(item.item_id)
    setFormError(null)
    setShowForm(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.name.trim() || !form.category_id || form.price === '') {
      setFormError('Name, category and price are all required.')
      return
    }

    const isEditing = editingId !== null

    try {
      setSaving(true)
      setFormError(null)
      const payload = {
        name: form.name.trim(),
        category_id: Number(form.category_id),
        price: Number(form.price),
        is_available: form.is_available,
      }

      if (isEditing) {
        await updateMenuItem(editingId, payload)
      } else {
        await createMenuItem(payload)
      }

      handleCancel()
      await fetchItems()
    } catch (err) {
      setFormError(err.response?.data?.error || (isEditing ? 'Failed to update menu item' : 'Failed to add menu item'))
    } finally {
      setSaving(false)
    }
  }

  // 409 arrives when the item is still referenced by an order, so the server's
  // message is shown rather than a generic failure
  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}" from the menu?`)) return

    try {
      setDeletingId(item.item_id)
      setError(null)
      await deleteMenuItem(item.item_id)
      if (editingId === item.item_id) handleCancel()
      await fetchItems()
    } catch (err) {
      setError(err.response?.data?.error || `Failed to delete ${item.name}`)
    } finally {
      setDeletingId(null)
    }
  }

  // Modified such that it renders the entire text then renders the menu items after

  if (loading && items.length === 0) return <p className="p-6 text-slate-600">Loading menu…</p>

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Menu</h1>
          <p className="mt-1 text-slate-600">Browse and manage menu items.</p>
        </div>
        <button
          type="button"
          onClick={showForm ? handleCancel : () => setShowForm(true)}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
        >
          {showForm ? 'Cancel' : 'Add item'}
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name…"
        className="mt-4 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
      />

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            {editingId === null ? 'Add item' : `Edit item #${editingId}`}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={form.name}
              onChange={handleFieldChange('name')}
              placeholder="Item name"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            <select
              value={form.category_id}
              onChange={handleFieldChange('category_id')}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="">Category…</option>
              {categories.map((category) => (
                <option key={category.category_id} value={category.category_id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={handleFieldChange('price')}
              placeholder="Price"
              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_available}
                onChange={handleFieldChange('is_available')}
                className="h-4 w-4 rounded border-slate-300 accent-amber-500 focus:ring-amber-500"
              />
              Available
            </label>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {saving ? 'Saving…' : editingId === null ? 'Save item' : 'Save changes'}
            </button>
          </div>

          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
        </form>
      )}

      {items.length === 0 ? (
        <p className="mt-6 text-slate-600">No menu items found</p>
      ) : (
        groupByCategory(items).map((group) => (
          <section key={group.category_id} className="mt-6">
            <h2 className="text-lg font-semibold text-slate-800">{group.name}</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <div key={item.item_id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-800">{item.name}</h3>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        item.is_available ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {item.is_available ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">₹{Number(item.price).toFixed(2)}</p>
                  <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      disabled={deletingId === item.item_id}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.item_id}
                      className="rounded-lg px-3 py-1 text-xs font-medium text-red-600 transition hover:text-red-800 disabled:opacity-60"
                    >
                      {deletingId === item.item_id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}