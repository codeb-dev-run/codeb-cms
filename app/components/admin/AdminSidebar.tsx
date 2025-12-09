import { Link, useLocation } from "@remix-run/react";
import { cn } from "~/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  Menu,
  Settings,
  ChevronLeft,
  ChevronRight,
  Palette,
  BarChart3,
  Globe,
  Blocks,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { useState } from "react";

const sidebarItems = [
  {
    title: "대시보드",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "게시판 관리",
    href: "/admin/boards",
    icon: LayoutDashboard,
  },
  {
    title: "사용자 관리",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "게시글 관리",
    href: "/admin/posts",
    icon: FileText,
  },
  {
    title: "메뉴 관리",
    href: "/admin/menus",
    icon: Menu,
  },
  {
    title: "페이지 빌더",
    href: "/admin/page-builder",
    icon: Blocks,
  },
  {
    title: "통계 분석",
    href: "/admin/analytics",
    icon: BarChart3,
  },
  {
    title: "사이트 설정",
    href: "/admin/settings",
    icon: Settings,
  },
  {
    title: "테마 설정",
    href: "/admin/theme",
    icon: Palette,
  },
  {
    title: "UI 구성 관리",
    href: "/admin/ui-config",
    icon: Globe,
    description: "메인 페이지 섹션 관리",
  },
];

export function AdminSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative border-r bg-gray-50/50 transition-all duration-300 h-full lg:h-auto",
        collapsed ? "w-16" : "w-full lg:w-64"
      )}
    >
      <div className="sticky top-0 h-full lg:h-screen">
        <div className="hidden lg:flex h-16 items-center justify-between border-b px-4">
          {!collapsed && (
            <h2 className="text-lg font-semibold">관리자 패널</h2>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        <nav className="space-y-1 p-2 overflow-y-auto">
          {sidebarItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 lg:py-2 text-sm transition-colors touch-manipulation",
                  isActive
                    ? "bg-gray-100 text-gray-900 font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  collapsed && "lg:justify-center"
                )}
              >
                <Icon className="h-5 w-5 lg:h-4 lg:w-4 flex-shrink-0" />
                {!collapsed && (
                  <span className={cn(collapsed && "lg:hidden")}>
                    {item.title}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}