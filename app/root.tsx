import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Layout as AppLayout } from "~/components/layout/Layout";
import { db } from "~/lib/db.server";
import { getUser } from "~/lib/auth.server";
import { getThemeConfig, generateCSSVariables } from "~/lib/theme.server";

import tailwindStyles from "./tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStyles },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100..900&display=swap",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);

  // NavigationMenu와 MenuItem을 사용하여 메뉴 가져오기
  const navigationMenus = await db.navigationMenu.findMany({
    where: { position: 'header' },
    include: {
      items: {
        where: { parentId: null },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          url: true,
          order: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Header 컴포넌트에 맞는 형식으로 변환
  const menus = navigationMenus.flatMap(menu =>
    menu.items.map(item => ({
      id: item.id,
      name: item.title,
      slug: item.url.startsWith('/') ? item.url.substring(1) : item.url,
      order: item.order,
    }))
  ).sort((a, b) => a.order - b.order);

  const theme = await getThemeConfig();
  const themeCSS = generateCSSVariables(theme);

  // 사이트 설정 가져오기
  const settings = await db.setting.findMany({
    select: {
      key: true,
      value: true,
    }
  });

  const settingsMap = settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  // 인기 게시물 (조회수 기준) - 사이드바용
  const popularPosts = await db.post.findMany({
    where: {
      isPublished: true,
      publishedAt: { lte: new Date() },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      views: true,
      menu: { select: { slug: true } },
    },
    orderBy: { views: "desc" },
    take: 5,
  });

  // 회원 랭킹 - 사이드바용
  const memberRankings = await db.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      _count: {
        select: {
          posts: { where: { isPublished: true } },
        },
      },
    },
    orderBy: { posts: { _count: "desc" } },
    take: 5,
  });

  // 최근 댓글 - 사이드바용
  const recentComments = await db.comment.findMany({
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { name: true, username: true } },
      post: {
        select: {
          title: true,
          slug: true,
          menu: { select: { slug: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const sidebarData = {
    popularPosts: popularPosts.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      viewCount: post.views,
      category: post.menu ? { slug: post.menu.slug } : undefined,
    })),
    memberRankings: memberRankings.map((member, index) => ({
      id: member.id,
      name: member.name || "",
      username: member.username || "",
      postCount: member._count?.posts ?? 0,
      rank: index + 1,
    })),
    recentComments: recentComments.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: {
        name: comment.author.name || "",
        username: comment.author.username || "",
      },
      post: {
        title: comment.post.title,
        slug: comment.post.slug,
        category: comment.post.menu ? { slug: comment.post.menu.slug } : undefined,
      },
    })),
  };

  return json({ user, menus, theme, themeCSS, settings: settingsMap, sidebarData });
}

export default function App() {
  const { user, menus, theme, themeCSS, settings, sidebarData } = useLoaderData<typeof loader>();
  const location = useLocation();

  // 관리자 페이지에서는 커뮤니티 레이아웃 제외
  const isAdminPage = location.pathname.startsWith('/admin');
  // 홈페이지에서는 자체 사이드바 사용 (i-boss 스타일)
  const isHomePage = location.pathname === '/';

  return (
    <Document theme={theme} themeCSS={themeCSS} settings={settings} isAdminPage={isAdminPage}>
      {isAdminPage ? (
        <Outlet />
      ) : (
        <AppLayout
          user={user || undefined}
          menus={menus}
          settings={settings}
          themeMode={theme?.mode}
          popularPosts={sidebarData?.popularPosts}
          memberRankings={sidebarData?.memberRankings}
          recentComments={sidebarData?.recentComments}
          hideSidebar={isHomePage}
          fullWidth={isHomePage}
        >
          <Outlet />
        </AppLayout>
      )}
    </Document>
  );
}

function Document({ children, theme, themeCSS, settings, isAdminPage }: { children: React.ReactNode; theme?: any; themeCSS?: string; settings?: Record<string, string>; isAdminPage?: boolean }) {
  // 관리자 페이지에서는 다크모드 강제 해제
  const isDark = isAdminPage ? false : theme?.mode === "dark";

  return (
    <html lang="ko" className={isDark ? "dark" : ""}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {settings?.site_name && <title>{settings.site_name}</title>}
        {settings?.site_description && <meta name="description" content={settings.site_description} />}
        <Meta />
        <Links />
        {!isAdminPage && themeCSS && <style dangerouslySetInnerHTML={{ __html: themeCSS }} />}
      </head>
      <body
        className={isAdminPage
          ? "font-sans text-base bg-white text-gray-900 min-h-screen"
          : "font-[var(--font-family)] text-[var(--font-size-base)] bg-[var(--color-background)] text-[var(--color-text)] min-h-screen transition-colors duration-200"
        }
        suppressHydrationWarning
      >
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
