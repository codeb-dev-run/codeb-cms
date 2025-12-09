import { Link } from "@remix-run/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Button } from "~/components/ui/button";
import { Home, Info, Phone } from "lucide-react";

interface MobileMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menus?: {
    id: string;
    name: string;
    slug: string;
    order: number;
  }[];
  user?: {
    id: string;
    email: string;
    name?: string | null;
  };
}

export function MobileMenu({ open, onOpenChange, menus = [], user }: MobileMenuProps) {
  const handleLinkClick = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[300px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="text-left text-[#2563EB]">Blee CMS</SheetTitle>
        </SheetHeader>
        
        <nav className="mt-8 flex flex-col gap-2">
          <Link
            to="/"
            onClick={handleLinkClick}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium hover:bg-gray-100"
          >
            <Home className="h-5 w-5" />
            홈
          </Link>

          {menus
            .sort((a, b) => a.order - b.order)
            .map((menu) => (
              <Link
                key={menu.id}
                to={`/board/${menu.slug}`}
                onClick={handleLinkClick}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium hover:bg-gray-100"
              >
                {menu.name}
              </Link>
            ))}

          <Link
            to="/about"
            onClick={handleLinkClick}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium hover:bg-gray-100"
          >
            <Info className="h-5 w-5" />
            소개
          </Link>

          <Link
            to="/contact"
            onClick={handleLinkClick}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium hover:bg-gray-100"
          >
            <Phone className="h-5 w-5" />
            문의
          </Link>
        </nav>

        <div className="absolute bottom-8 left-6 right-6">
          {user ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                {user.name || user.email}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/profile" onClick={handleLinkClick}>
                    프로필
                  </Link>
                </Button>
                <form action="/logout" method="post">
                  <Button variant="outline" size="sm" type="submit">
                    로그아웃
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" asChild>
                <Link to="/login" onClick={handleLinkClick}>
                  로그인
                </Link>
              </Button>
              <Button className="flex-1" asChild>
                <Link to="/register" onClick={handleLinkClick}>
                  회원가입
                </Link>
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}