import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { db } from "~/lib/db.server";
import { getUser } from "~/lib/auth.server";
import { CategorySection } from "~/components/home/CategorySection";
import { VoteBox } from "~/components/home/VoteBox";
import { MemberRanking } from "~/components/home/MemberRanking";
import { PopularPosts } from "~/components/home/PopularPosts";
import { RecentComments } from "~/components/home/RecentComments";
import { User, LogIn } from "lucide-react";

export const meta: MetaFunction = () => {
  return [
    { title: "CodeB CMS - 현대적인 콘텐츠 관리 시스템" },
    { name: "description", content: "CodeB CMS로 콘텐츠를 효율적으로 관리하세요" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);

  // Menu 테이블에서 메인 페이지에 표시할 카테고리 가져오기
  const menus = await db.menu.findMany({
    where: {
      isActive: true,
    },
    orderBy: { order: "asc" },
    take: 8,
  });

  // N+1 최적화: 모든 메뉴의 게시물을 한 번에 가져옴
  const menuIds = menus.map(m => m.id);
  const allPosts = await db.post.findMany({
    where: {
      menuId: { in: menuIds },
      isPublished: true,
      publishedAt: { lte: new Date() },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      publishedAt: true,
      views: true,
      menuId: true,
      author: {
        select: {
          name: true,
          email: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  // 메뉴별로 게시물 그룹핑 (각 메뉴당 최대 6개)
  const postsByMenu = new Map<string, typeof allPosts>();
  for (const post of allPosts) {
    const menuPosts = postsByMenu.get(post.menuId) || [];
    if (menuPosts.length < 6) {
      menuPosts.push(post);
      postsByMenu.set(post.menuId, menuPosts);
    }
  }

  // 카테고리별 게시물 매핑
  const categoryPosts = menus.map((menu) => {
    const posts = postsByMenu.get(menu.id) || [];
    return {
      category: {
        id: menu.id,
        name: menu.name,
        slug: menu.slug,
        order: menu.order
      },
      posts: posts.map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt || "",
        publishedAt: post.publishedAt?.toISOString() ?? new Date().toISOString(),
        viewCount: post.views,
        commentCount: post._count.comments,
        author: {
          name: post.author.name || post.author.email,
        },
      })),
    };
  });

  // 인기 게시물 (조회수 기준) - 기간별
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const popularPostSelect = {
    id: true,
    title: true,
    slug: true,
    views: true,
    menu: {
      select: {
        slug: true,
        name: true,
      },
    },
    _count: {
      select: {
        comments: true,
      },
    },
  };

  // 오늘 인기 (24시간)
  const dailyPopularPosts = await db.post.findMany({
    where: {
      isPublished: true,
      publishedAt: {
        gte: oneDayAgo,
        lte: now,
      },
    },
    select: popularPostSelect,
    orderBy: { views: "desc" },
    take: 5,
  });

  // 주간 인기
  const weeklyPopularPosts = await db.post.findMany({
    where: {
      isPublished: true,
      publishedAt: {
        gte: oneWeekAgo,
        lte: now,
      },
    },
    select: popularPostSelect,
    orderBy: { views: "desc" },
    take: 5,
  });

  // 월간 인기
  const monthlyPopularPosts = await db.post.findMany({
    where: {
      isPublished: true,
      publishedAt: {
        gte: oneMonthAgo,
        lte: now,
      },
    },
    select: popularPostSelect,
    orderBy: { views: "desc" },
    take: 5,
  });

  // 전체 인기 게시물 (기존)
  const popularPosts = await db.post.findMany({
    where: {
      isPublished: true,
      publishedAt: {
        lte: new Date(),
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      views: true,
      menu: {
        select: {
          slug: true,
        },
      },
    },
    orderBy: { views: "desc" },
    take: 10,
  });

  // 회원 랭킹 (게시글 수 기준)
  const memberRankings = await db.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      _count: {
        select: {
          posts: {
            where: {
              isPublished: true,
            },
          },
        },
      },
    },
    orderBy: {
      posts: {
        _count: "desc",
      },
    },
    take: 10,
  });

  // 오늘의 투표 주제 가져오기 (2개)
  const todayVoteTopics = await db.voteTopic.findMany({
    where: {
      isActive: true,
      startDate: {
        lte: new Date()
      },
      OR: [
        { endDate: null },
        { endDate: { gte: new Date() } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 2
  });

  // 투표 통계 (복수)
  const voteStatsArray = await Promise.all(
    todayVoteTopics.map(async (topic) => {
      const [likeCount, dislikeCount] = await Promise.all([
        db.vote.count({
          where: { topicId: topic.id, voteType: "LIKE" }
        }),
        db.vote.count({
          where: { topicId: topic.id, voteType: "DISLIKE" }
        })
      ]);

      return {
        topicId: topic.id,
        title: topic.title,
        description: topic.description,
        likeCount,
        dislikeCount,
        userVote: null
      };
    })
  );

  // 최근 댓글
  const recentComments = await db.comment.findMany({
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: {
        select: {
          name: true,
          username: true,
        },
      },
      post: {
        select: {
          title: true,
          slug: true,
          menu: {
            select: {
              slug: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // 인기 게시물 매핑 함수
  const mapPopularPost = (post: typeof dailyPopularPosts[0]) => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    viewCount: post.views,
    commentCount: post._count.comments,
    category: post.menu ? { slug: post.menu.slug, name: post.menu.name } : undefined,
  });

  return json({
    user,
    voteStatsArray,
    categoryPosts,
    dailyPopularPosts: dailyPopularPosts.map(mapPopularPost),
    weeklyPopularPosts: weeklyPopularPosts.map(mapPopularPost),
    monthlyPopularPosts: monthlyPopularPosts.map(mapPopularPost),
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
      postCount: member._count.posts,
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
  });
}

export default function Index() {
  const {
    user,
    voteStatsArray,
    categoryPosts,
    dailyPopularPosts,
    weeklyPopularPosts,
    monthlyPopularPosts,
    memberRankings,
    recentComments
  } = useLoaderData<typeof loader>();

  // 첫 번째 투표 주제 사용
  const voteStats = voteStatsArray && voteStatsArray.length > 0 ? voteStatsArray[0] : null;

  // 게시판이 없는 경우
  if (categoryPosts.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-950 min-h-full">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              아직 게시판이 없습니다
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              관리자 페이지에서 메뉴와 게시판을 생성해 주세요
            </p>
            {user?.role === "ADMIN" && (
              <Link
                to="/admin/menus"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
              >
                메뉴 관리로 이동
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-950 min-h-full">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 상단 유저 정보 */}
        <div className="flex justify-end mb-6">
          {user ? (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <User className="w-4 h-4" />
              <span>{user.name || user.username}</span>
            </div>
          ) : (
            <Link
              to="/auth/login"
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              <LogIn className="w-4 h-4" />
              <span>로그인</span>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 메인 콘텐츠 영역 */}
          <div className="lg:col-span-3 space-y-6">
            {/* 투표 박스 */}
            {voteStats && (
              <VoteBox
                topicId={voteStats.topicId}
                title={voteStats.title}
                {...(voteStats.description ? { description: voteStats.description } : {})}
                initialLikeCount={voteStats.likeCount}
                initialDislikeCount={voteStats.dislikeCount}
                initialUserVote={voteStats.userVote}
              />
            )}

            {/* 카테고리별 게시물 */}
            {categoryPosts.map((item) => (
              <CategorySection
                key={item.category.id}
                title={item.category.name}
                slug={item.category.slug}
                posts={item.posts}
              />
            ))}
          </div>

          {/* 사이드바 */}
          <div className="lg:col-span-1 space-y-6">
            {/* 인기 게시물 */}
            <PopularPosts
              dailyPosts={dailyPopularPosts}
              weeklyPosts={weeklyPopularPosts}
              monthlyPosts={monthlyPopularPosts}
            />

            {/* 회원 랭킹 */}
            <MemberRanking rankings={memberRankings} />

            {/* 최근 댓글 */}
            <RecentComments comments={recentComments} />
          </div>
        </div>
      </div>
    </div>
  );
}
