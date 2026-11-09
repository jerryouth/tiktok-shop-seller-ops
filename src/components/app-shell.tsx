'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  Compass,
  FlaskConical,
  Images,
  LayoutDashboard,
  Menu,
  PackageSearch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { AiChat } from '@/components/ai-chat';

const NAV_ITEMS = [
  { href: '/', label: '市场趋势看板', icon: LayoutDashboard },
  { href: '/products', label: '选品库', icon: PackageSearch },
  { href: '/testing', label: '内容测试', icon: FlaskConical },
  { href: '/image-studio', label: '主图工作台', icon: Images },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
              active
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100',
            )}
          >
            <span
              className={cn(
                'h-5 w-1 rounded-full transition-colors',
                active ? 'bg-[#25f4ee]' : 'bg-transparent',
              )}
            />
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent() {
  return (
    <div className="flex h-full flex-col bg-[#101014]">
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-7">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#25f4ee]/15">
          <Compass className="h-5 w-5 text-[#25f4ee]" />
        </span>
        <div>
          <p className="text-[15px] font-semibold text-white">选品参谋</p>
          <p className="text-[11px] text-zinc-500">TikTok Shop 跨境选品</p>
        </div>
      </div>
      <NavLinks />
      <div className="mt-auto px-5 pb-5">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <BarChart3 className="h-3.5 w-3.5 text-[#25f4ee]" />
            演示数据环境
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            当前展示内置演示数据，接口已预留，可平滑对接真实数据源。
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      {/* 桌面端固定侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <SidebarContent />
      </aside>

      {/* 移动端顶栏 */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="打开菜单">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 border-0 p-0">
            <SheetTitle className="sr-only">导航菜单</SheetTitle>
            <div className="flex h-full flex-col bg-[#101014]">
              <div className="flex items-center gap-2.5 px-5 pt-6 pb-7">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#25f4ee]/15">
                  <Compass className="h-5 w-5 text-[#25f4ee]" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">选品参谋</p>
                  <p className="text-[11px] text-zinc-500">TikTok Shop 跨境选品</p>
                </div>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <p className="text-sm font-semibold text-zinc-900">选品参谋</p>
      </div>

      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <AiChat />
      <Toaster position="top-center" richColors />
    </div>
  );
}
