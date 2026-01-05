import { Link } from "@remix-run/react";
import { Facebook, Twitter, Instagram, Github } from "lucide-react";

interface FooterProps {
  menus?: {
    id: string;
    name: string;
    slug: string;
  }[];
  settings?: Record<string, string>;
}

export function Footer({ menus = [], settings }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <div className="container mx-auto px-4 py-12" style={{ maxWidth: '1450px' }}>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* 브랜드 섹션 */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-[#2563EB] dark:text-blue-400">{settings?.site_name || 'CodeB CMS'}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {settings?.site_description || '현대적이고 강력한 콘텐츠 관리 시스템으로 여러분의 아이디어를 실현하세요.'}
            </p>
            <div className="flex space-x-4">
              {settings?.footer_facebook && (
                <a
                  href={settings.footer_facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 dark:text-gray-500 hover:text-[#2563EB] dark:hover:text-blue-400"
                  aria-label="Facebook"
                >
                  <Facebook className="h-5 w-5" />
                </a>
              )}
              {settings?.footer_twitter && (
                <a
                  href={settings.footer_twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 dark:text-gray-500 hover:text-[#2563EB] dark:hover:text-blue-400"
                  aria-label="Twitter"
                >
                  <Twitter className="h-5 w-5" />
                </a>
              )}
              {settings?.footer_instagram && (
                <a
                  href={settings.footer_instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 dark:text-gray-500 hover:text-[#2563EB] dark:hover:text-blue-400"
                  aria-label="Instagram"
                >
                  <Instagram className="h-5 w-5" />
                </a>
              )}
              {settings?.footer_github && (
                <a
                  href={settings.footer_github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 dark:text-gray-500 hover:text-[#2563EB] dark:hover:text-blue-400"
                  aria-label="GitHub"
                >
                  <Github className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>

          {/* 카테고리 */}
          {menus.length > 0 && (
            <div>
              <h4 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">카테고리</h4>
              <ul className="space-y-2">
                {menus.slice(0, 5).map((menu) => (
                  <li key={menu.id}>
                    <Link
                      to={`/${menu.slug}`}
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#2563EB] dark:hover:text-blue-400"
                    >
                      {menu.name}
                    </Link>
                  </li>
                ))}
                {menus.length > 5 && (
                  <li>
                    <Link
                      to="/"
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#2563EB] dark:hover:text-blue-400"
                    >
                      모든 게시판 보기
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* 서비스 */}
          <div>
            <h4 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">서비스</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/about"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#2563EB] dark:hover:text-blue-400"
                >
                  소개
                </Link>
              </li>
              <li>
                <Link
                  to="/contact"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#2563EB] dark:hover:text-blue-400"
                >
                  문의하기
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#2563EB] dark:hover:text-blue-400"
                >
                  개인정보처리방침
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#2563EB] dark:hover:text-blue-400"
                >
                  이용약관
                </Link>
              </li>
            </ul>
          </div>

          {/* 연락처 */}
          <div>
            <h4 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">연락처</h4>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              {settings?.footer_email && <li>이메일: {settings.footer_email}</li>}
              {settings?.footer_phone && <li>전화: {settings.footer_phone}</li>}
              {settings?.footer_address && <li>주소: {settings.footer_address}</li>}
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-8">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            © {currentYear} {settings?.site_name || 'CodeB CMS'}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}