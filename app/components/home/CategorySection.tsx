import { memo } from "react";
import { Link } from "@remix-run/react";
import { ChevronRight, MessageCircle, Eye, Calendar } from "lucide-react";

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
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* 헤더 - 심플하게 */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{title}</h2>
        <Link
          to={`/${slug}`}
          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1 text-sm font-medium transition-colors"
        >
          더보기
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* 게시물 목록 */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {posts.length > 0 ? (
          posts.map((post, index) => (
            <Link
              key={post.id}
              to={`/${slug}/${post.slug}`}
              className="block hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="p-4">
                <div className="flex gap-3 items-start">
                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1 line-clamp-2 text-sm hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      {post.title}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(post.publishedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {post.viewCount.toLocaleString()}
                      </span>
                      {post.commentCount !== undefined && post.commentCount > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {post.commentCount}
                        </span>
                      )}
                      <span className="ml-auto text-gray-600 dark:text-gray-300 font-medium">
                        {post.author.name}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
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