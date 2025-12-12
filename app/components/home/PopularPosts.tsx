import { useState } from "react";
import { Link } from "@remix-run/react";
import { Eye, MessageCircle, Flame } from "lucide-react";

interface Post {
  id: string;
  title: string;
  slug: string;
  viewCount: number;
  commentCount?: number;
  category?: {
    slug: string;
    name: string;
  };
}

interface PopularPostsProps {
  dailyPosts: Post[];
  weeklyPosts: Post[];
  monthlyPosts: Post[];
}

type TabType = "daily" | "weekly" | "monthly";

export function PopularPosts({ dailyPosts, weeklyPosts, monthlyPosts }: PopularPostsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("daily");

  const tabs: { key: TabType; label: string }[] = [
    { key: "daily", label: "지금 인기" },
    { key: "weekly", label: "주간 인기" },
    { key: "monthly", label: "월간 인기" },
  ];

  const getActivePosts = () => {
    switch (activeTab) {
      case "daily":
        return dailyPosts;
      case "weekly":
        return weeklyPosts;
      case "monthly":
        return monthlyPosts;
      default:
        return dailyPosts;
    }
  };

  const activePosts = getActivePosts();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm overflow-hidden">
      {/* 탭 헤더 */}
      <div className="flex">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-red-600 dark:text-red-400 border-b-2 border-red-500 bg-red-50 dark:bg-red-950/30"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {tab.key === "daily" && <Flame className="inline-block w-3.5 h-3.5 mr-1" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 게시물 목록 */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {activePosts.length > 0 ? (
          activePosts.slice(0, 5).map((post, index) => (
            <Link
              key={post.id}
              to={post.category ? `/${post.category.slug}/${post.slug}` : `/post/${post.slug}`}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
            >
              {/* 순위 */}
              <span className={`flex-shrink-0 w-5 h-5 rounded text-xs font-bold flex items-center justify-center ${
                index === 0 ? "bg-red-500 text-white" :
                index === 1 ? "bg-orange-500 text-white" :
                index === 2 ? "bg-yellow-500 text-white" :
                "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              }`}>
                {index + 1}
              </span>

              {/* 제목 */}
              <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                {post.title}
              </span>

              {/* 댓글 수 */}
              {post.commentCount !== undefined && post.commentCount > 0 && (
                <span className="flex-shrink-0 flex items-center gap-0.5 text-xs text-blue-500">
                  <MessageCircle className="w-3 h-3" />
                  {post.commentCount}
                </span>
              )}

              {/* 조회수 */}
              <span className="flex-shrink-0 flex items-center gap-0.5 text-xs text-gray-400 dark:text-gray-500">
                <Eye className="w-3 h-3" />
                {post.viewCount}
              </span>
            </Link>
          ))
        ) : (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            인기 게시물이 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
