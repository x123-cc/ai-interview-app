import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home' },
  { to: '/settings', label: 'Settings' },
  { to: '/history', label: 'History' },
];

export default function NavBar() {
  return (
    <nav className="flex items-center gap-0.5">
      {links.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `rounded-full px-4 py-1.5 text-[0.8125rem] font-medium tracking-tight transition-colors ${
              isActive
                ? 'bg-black/5 text-[#1d1d1f]'
                : 'text-[#86868b] hover:bg-black/5 hover:text-[#1d1d1f]'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
