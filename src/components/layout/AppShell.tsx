import { Outlet } from 'react-router-dom';
import NavBar from '@/components/layout/NavBar';

export default function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold text-gray-900">
            AI Interview
          </span>
          <NavBar />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-gray-200 py-4 text-center text-sm text-gray-500">
        <p>AI 视觉对话助手 &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
