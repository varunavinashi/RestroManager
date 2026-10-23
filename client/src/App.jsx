import { NavLink, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import MenuPage from './pages/MenuPage'
import TablesPage from './pages/TablesPage'
import OrdersPage from './pages/OrdersPage'
import NewOrderPage from './pages/NewOrderPage'
import ReportPage from './pages/ReportPage'
import QueryLabPage from './pages/QueryLabPage'
// import { getMenu } from "./api/menuApi";
// import {useEffect} from 'react'

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Menu' },
  { to: '/tables', label: 'Tables' },
  { to: '/orders', label: 'Orders', end: true },
  { to: '/orders/new', label: 'New Order' },
  { to: '/reports', label: 'Reports' },
  { to: '/query-lab', label: 'Query Lab' },
]

function NavBar() {
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="text-lg font-bold text-slate-800">RestroManager</span>

        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `rounded px-2 py-1 text-sm font-medium transition ${
                  isActive
                    ? 'bg-amber-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}

function App() {
  // Uncomment the following code to test the getMenu API function

  // useEffect(() => {
  //   getMenu()
  //     .then((data) => console.log("MENU API RESPONSE:", data))
  //     .catch((err) => console.error("MENU API ERROR:", err));
  // }, []);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <NavBar />
      <main className="mx-auto max-w-6xl">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/tables" element={<TablesPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/reports" element={<ReportPage />} />
          <Route path="/query-lab" element={<QueryLabPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App