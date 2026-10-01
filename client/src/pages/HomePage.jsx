import { Link } from 'react-router-dom'

// Dashboard link page
export default function HomePage() {
  const links = [
    { to: '/menu', label: 'Menu', description: 'Browse and manage menu items.' },
    { to: '/tables', label: 'Tables', description: 'See which tables are free or occupied.' },
    { to: '/orders', label: 'Orders', description: 'Track placed orders and their status.' },
    { to: '/orders/new', label: 'New Order', description: 'Build a cart and place an order.' },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">RestroManager</h1>
      <p className="mt-1 text-slate-600">Restaurant &amp; Food Service Management System</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-amber-500"
          >
            <h2 className="font-semibold text-slate-800">{link.label}</h2>
            <p className="mt-1 text-sm text-slate-600">{link.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}