import { Link, Form } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Menu, User, LogOut, Shield, PenSquare, Search, Bell } from "lucide-react";
import { Navigation } from "./Navigation";
import { ThemeToggle } from "~/components/ui/theme-toggle";
interface HeaderProps {
  user?: {
    id: string;
    email: string;
    name?: string | null;
    username?: string | null;
    role?: string;
  } | null;
  menus?: {
    id: string;
    name: string;
    slug: string;
    order: number;
  }[];
  onMenuClick?: () => void;
  siteName?: string;
  themeMode?: "light" | "dark";
}

export function Header({ user, menus = [], onMenuClick, siteName, themeMode = "light" }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 dark:bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-gray-900/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: '1450px' }}>
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6">
            {/* 모바일 메뉴 버튼 */}
            <button
              onClick={onMenuClick}
              className="md:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-manipulation"
              aria-label="메뉴 열기"
            >
              <Menu className="h-5 w-5 dark:text-gray-200" />
            </button>

            {/* 로고 */}
            <Link to="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold text-[#2563EB] dark:text-blue-400">{siteName || 'Blee CMS'}</span>
            </Link>

            {/* 데스크톱 네비게이션 */}
            <div className="hidden md:block">
              <Navigation menus={menus} />
            </div>
          </div>

          {/* 우측 메뉴 */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* 테마 토글 버튼 */}
            <ThemeToggle currentMode={themeMode} />

            {/* 검색 버튼 */}
            <button
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="검색"
            >
              <Search className="h-5 w-5 dark:text-gray-200" />
            </button>

            {user ? (
              <>
                {/* 알림 버튼 */}
                <button
                  className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors relative"
                  aria-label="알림"
                >
                  <Bell className="h-5 w-5 dark:text-gray-200" />
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500"></span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={undefined} alt={user.name || user.email} />
                        <AvatarFallback className="text-sm">
                          {user.name?.charAt(0) || user.username?.charAt(0) || user.email.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name || user.username}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                      {user.role === 'ADMIN' && (
                        <p className="text-xs text-primary flex items-center gap-1 mt-1">
                          <Shield className="h-3 w-3" />
                          관리자
                        </p>
                      )}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/write" className="flex items-center">
                      <PenSquare className="mr-2 h-4 w-4" />
                      <span>글쓰기</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      <span>프로필</span>
                    </Link>
                  </DropdownMenuItem>
                  {user.role === 'ADMIN' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="flex items-center text-primary">
                          <Shield className="mr-2 h-4 w-4" />
                          <span>관리자 페이지</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Form action="/auth/logout" method="post" className="w-full">
                      <button type="submit" className="flex w-full items-center text-destructive">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>로그아웃</span>
                      </button>
                    </Form>
                  </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" asChild size="sm">
                  <Link to="/auth/login">로그인</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth/register">회원가입</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}