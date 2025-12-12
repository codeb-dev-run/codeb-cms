import { memo } from "react";
import { Link } from "@remix-run/react";
import { Eye } from "lucide-react";

interface CategorySectionProps {
  title: string;
  slug: string;
  posts: {
    id: string;
    title: string;
    slug: string;
    excerpt?: string | null;
    publishedAt: string;
    viewCount: number;
    commentCount?: number;
    author: {
      name: string;
    };
  }[];
  color?: string;
}

export const CategorySection = memo(function CategorySection({
  title,
  slug,
  posts,
}: CategorySectionProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="h-10 px-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
        <Link
          to={`/${slug}`}
          className="font-bold text-gray-900 dark:text-gray-100 text-base hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {title}
        </Link>
        <Link
          to={`/${slug}`}
          className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs transition-colors"
        >
          전체보기
        </Link>
      </div>

      {/* 게시물 목록 */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {posts.length > 0 ? (
          posts.slice(0, 4).map((post) => (
            <Link
              key={post.id}
              to={`/${slug}/${post.slug}`}
              className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
            >
              <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {post.title}
              </span>
              <span className="flex-shrink-0 flex items-center gap-0.5 text-xs text-gray-400 dark:text-gray-500">
                <Eye className="w-3 h-3" />
                {post.viewCount}
              </span>
              <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                {formatDate(post.publishedAt)}
              </span>
            </Link>
          ))
        ) : (
          <div className="py-2 px-3 text-center text-gray-500 dark:text-gray-400 text-xs">
            아직 게시물이 없습니다
          </div>
        )}
      </div>
    </div>
  );
});

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

  if (diffInHours < 24) {
    if (diffInHours === 0) {
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
      if (diffInMinutes < 60) {
        return `${diffInMinutes}분 전`;
      }
    }
    return `${diffInHours}시간 전`;
  }

  // 같은 연도면 월-일만 표시
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}.${date.getDate()}`;
  }

  // 다른 연도면 연-월-일 표시
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}