import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home' },
  { to: '/interview', label: 'Interview' },
  { to: '/settings', label: 'Settings' },
  { to: '/history', label: 'History' },
];

export default function NavBar() {
  const baseClass =
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors';
  const activeClass = 'bg-gray-100 text-gray-900';
  const inactiveClass = 'text-gray-600 hover:text-gray-900 hover:bg-gray-50';

  return (
    <nav className="flex items-center gap-1">
      {links.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `${baseClass} ${isActive ? activeClass : inactiveClass}`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
