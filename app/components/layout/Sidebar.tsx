import { Link, Form, useNavigation } from "@remix-run/react";
import { TrendingUp, Eye, User } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export interface SidebarProps {
  popularPosts?: {
    id: string;
    title: string;
    slug: string;
    viewCount: number;
    category?: {
      slug: string;
    };
  }[];
  memberRankings?: any[];
  recentComments?: any[];
  position?: "left" | "right";
  user?: {
    id: string;
    name?: string | null;
    email: string;
  } | null;
}

export function Sidebar({ popularPosts = [], position = "right", user }: SidebarProps) {
  const navigation = useNavigation();
  return (
    <aside className={cn(
      "w-full lg:w-80 space-y-6",
      position === "left" ? "lg:pr-6" : "lg:pl-6"
    )}>
      {/* 로그인 폼 - 로그인하지 않은 경우 */}
      {!user && (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-gray-500 to-gray-600 dark:from-gray-700 dark:to-gray-800">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <User className="h-4 w-4" />
              로그인
            </h3>
          </div>
          <Form method="post" action="/auth/login" className="p-4 space-y-3">
            <div>
              <Input
                type="email"
                name="emailOrUsername"
                placeholder="이메일"
                required
                className="w-full"
                disabled={navigation.state === "submitting"}
              />
            </div>
            <div>
              <Input
                type="password"
                name="password"
                placeholder="비밀번호"
                required
                className="w-full"
                disabled={navigation.state === "submitting"}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="remember"
                id="remember"
                className="rounded border-gray-300"
              />
              <label htmlFor="remember" className="text-sm text-gray-600 dark:text-gray-400">
                로그인 상태 유지
              </label>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={navigation.state === "submitting"}
            >
              {navigation.state === "submitting" ? "로그인 중..." : "로그인"}
            </Button>
            <div className="space-y-2">
              <div className="text-center">
                <Link to="/auth/register" className="text-sm text-blue-600 hover:underline">
                  회원가입
                </Link>
                <span className="text-gray-400 mx-2">|</span>
                <Link to="/auth/forgot-password" className="text-sm text-blue-600 hover:underline">
                  비밀번호 찾기
                </Link>
              </div>
              <div className="border-t pt-2">
                <p className="text-xs text-center text-gray-500 mb-2">테스트 계정</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const form = document.querySelector('form[action="/auth/login"]') as HTMLFormElement;
                      if (form) {
                        const emailInput = form.querySelector('input[name="emailOrUsername"]') as HTMLInputElement;
                        const passwordInput = form.querySelector('input[name="password"]') as HTMLInputElement;
                        if (emailInput && passwordInput) {
                          emailInput.value = 'admin@vsvs.kr';
                          passwordInput.value = 'admin123';
                          form.requestSubmit();
                        }
                      }
                    }}
                    className="text-xs"
                    disabled={navigation.state === "submitting"}
                  >
                    관리자
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const form = document.querySelector('form[action="/auth/login"]') as HTMLFormElement;
                      if (form) {
                        const emailInput = form.querySelector('input[name="emailOrUsername"]') as HTMLInputElement;
                        const passwordInput = form.querySelector('input[name="password"]') as HTMLInputElement;
                        if (emailInput && passwordInput) {
                          emailInput.value = 'user1@example.com';
                          passwordInput.value = 'password123';
                          form.requestSubmit();
                        }
                      }
                    }}
                    className="text-xs"
                    disabled={navigation.state === "submitting"}
                  >
                    일반 사용자
                  </Button>
                </div>
              </div>
            </div>
          </Form>
        </div>
      )}

      {/* 로그인한 경우 사용자 정보 */}
      {user && (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 dark:from-green-700 dark:to-green-800">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <User className="h-4 w-4" />
              내 정보
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-3 flex items-center justify-center">
                <User className="h-10 w-10 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {user.name || user.email.split('@')[0]}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/profile"
                className="text-center py-2 px-3 bg-gray-100 dark:bg-gray-800 rounded text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                내 정보
              </Link>
              <Link
                to="/my-posts"
                className="text-center py-2 px-3 bg-gray-100 dark:bg-gray-800 rounded text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                내 글
              </Link>
            </div>
            <Form method="post" action="/auth/logout">
              <Button
                type="submit"
                variant="outline"
                className="w-full"
              >
                로그아웃
              </Button>
            </Form>
          </div>
        </div>
      )}

      {/* 실시간 인기 게시물 */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-700 dark:to-blue-800">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            실시간 인기 게시물
          </h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {popularPosts.length > 0 ? (
            popularPosts.map((post, index) => (
              <Link
                key={post.id}
                to={post.category ? `/${post.category.slug}/${post.slug}` : `/post/${post.slug}`}
                className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white",
                    index === 0 ? "bg-red-500" :
                      index === 1 ? "bg-orange-500" :
                        index === 2 ? "bg-yellow-500" : "bg-gray-400"
                  )}>
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {post.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                      <Eye className="h-3 w-3" />
                      {post.viewCount.toLocaleString()}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              아직 인기 게시물이 없습니다
            </div>
          )}
        </div>
      </div>

      {/* 회원 랭킹 - 숨김 (요청사항: 로그인/인기게시물만 표시) */}
      {/* 
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        ...
      </div>
      */}

      {/* 최근 댓글 - 숨김 (요청사항: 로그인/인기게시물만 표시) */}
      {/* 
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        ...
      </div>
      */}
    </aside>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "방금 전";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일 전`;

  return date.toLocaleDateString();
}