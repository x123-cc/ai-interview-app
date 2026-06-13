import { Outlet } from 'react-router-dom';
import NavBar from '@/components/layout/NavBar';

export default function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f7]">
      {/* 毛玻璃导航栏 */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/72 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="text-lg font-semibold tracking-tight text-[#1d1d1f]">
            AI Interview
          </span>
          <NavBar />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-black/5 py-6 text-center">
        <p className="text-xs text-[#86868b]">
          AI 视觉对话助手 &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
