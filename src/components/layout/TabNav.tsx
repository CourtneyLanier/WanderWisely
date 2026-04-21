import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/overview', label: 'Overview', icon: '🗺️' },
  { to: '/days', label: 'Days', icon: '📅' },
  { to: '/wallet', label: 'Wallet', icon: '🎫' },
  { to: '/budget', label: 'Budget', icon: '💰' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function TabNav() {
  return (
    <nav className="tab-nav">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `tab-nav-item${isActive ? ' active' : ''}`
          }
        >
          <span className="text-xl">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
