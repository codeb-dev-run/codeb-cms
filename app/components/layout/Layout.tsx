import { useState } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { MobileMenu } from "./MobileMenu";
import { Sidebar, SidebarProps } from "./Sidebar";

interface LayoutProps {
  children: React.ReactNode;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    username?: string | null;
    role?: string;
    avatar?: string | null;
  };
  menus?: {
    id: string;
    name: string;
    slug: string;
    order: number;
  }[];
  settings?: Record<string, string>;
  themeMode?: "light" | "dark";
  popularPosts?: SidebarProps['popularPosts'];
  memberRankings?: SidebarProps['memberRankings'];
  recentComments?: SidebarProps['recentComments'];
  hideSidebar?: boolean; // 홈페이지 등에서 사이드바 숨기기
  fullWidth?: boolean; // 전체 너비 사용
}

export function Layout({
  children,
  user,
  menus = [],
  settings,
  themeMode = "light",
  popularPosts,
  memberRankings,
  recentComments,
  hideSidebar = false,
  fullWidth = false
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        user={user}
        menus={menus}
        onMenuClick={() => setMobileMenuOpen(true)}
        siteName={settings?.['site_name']}
        themeMode={themeMode}
      />

      <MobileMenu
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        menus={menus}
        user={user || undefined}
      />

      {/* Grid Layout Container */}
      <div className={`flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-6 ${fullWidth ? 'max-w-[1440px]' : 'max-w-[1440px]'}`}>
        {hideSidebar ? (
          // 전체 너비 레이아웃 (홈페이지용)
          <main className="w-full min-w-0">
            {children}
          </main>
        ) : (
          // 사이드바 포함 레이아웃
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Main Content Area */}
            <main className="order-1 lg:col-span-3 w-full min-w-0">
              {children}
            </main>

            {/* Right Sidebar */}
            <div className="hidden lg:block order-2 lg:col-span-1">
              <Sidebar
                user={user || null}
                position="right"
                popularPosts={popularPosts}
                memberRankings={memberRankings}
                recentComments={recentComments}
              />
            </div>
          </div>
        )}
      </div>

      <Footer menus={menus} settings={settings || {}} />
    </div>
  );
}