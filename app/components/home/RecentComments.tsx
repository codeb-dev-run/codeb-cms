import { useState } from "react";
import { Link } from "@remix-run/react";

interface Comment {
    id: string;
    content: string;
    author: {
        name: string;
        username: string;
    };
    post: {
        title: string;
        slug: string;
        category?: {
            slug: string;
        };
    };
    createdAt: string;
}

interface RecentCommentsProps {
    comments: Comment[];
}

function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "방금";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일`;

    return `${date.getMonth() + 1}.${date.getDate()}`;
}

// 가상 데이터 생성
const mockComments: Record<string, Comment[]> = {
    realEstate: [
        {
            id: "re-1",
            content: "이 물건 낙찰가 예상이 어떻게 될까요?",
            author: { name: "부동산왕", username: "realestate_king" },
            post: { title: "서울 강남구 아파트 경매 분석", slug: "gangnam-apt-auction", category: { slug: "real-estate" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString()
        },
        {
            id: "re-2",
            content: "권리분석 꼼꼼히 해야합니다",
            author: { name: "경매전문가", username: "auction_pro" },
            post: { title: "경매 초보자 가이드", slug: "auction-guide", category: { slug: "real-estate" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
        },
        {
            id: "re-3",
            content: "좋은 정보 감사합니다!",
            author: { name: "투자자A", username: "investor_a" },
            post: { title: "2024년 경매 시장 전망", slug: "2024-market", category: { slug: "real-estate" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
        },
        {
            id: "re-4",
            content: "명도 비용은 얼마나 예상하시나요?",
            author: { name: "신입경매러", username: "newbie_auction" },
            post: { title: "빌라 경매 후기", slug: "villa-auction-review", category: { slug: "real-estate" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
        },
        {
            id: "re-5",
            content: "이 지역 개발 호재가 있어서 주목해야 합니다",
            author: { name: "지역분석가", username: "area_analyst" },
            post: { title: "경기도 신도시 경매 물건", slug: "gyeonggi-newcity", category: { slug: "real-estate" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString()
        }
    ],
    auction: [
        {
            id: "au-1",
            content: "이 차량 시세 대비 괜찮은 가격이네요",
            author: { name: "중고차달인", username: "used_car_master" },
            post: { title: "BMW 520d 경매 출품", slug: "bmw-520d-auction", category: { slug: "auction" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString()
        },
        {
            id: "au-2",
            content: "공장 기계류는 전문가 동반 필수입니다",
            author: { name: "공장장", username: "factory_manager" },
            post: { title: "산업용 기계 경매 안내", slug: "industrial-machine", category: { slug: "auction" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString()
        },
        {
            id: "au-3",
            content: "명품 경매는 정품 감정이 제일 중요해요",
            author: { name: "명품감정사", username: "luxury_appraiser" },
            post: { title: "롤렉스 시계 경매", slug: "rolex-auction", category: { slug: "auction" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString()
        },
        {
            id: "au-4",
            content: "미술품 경매 첫 참여인데 떨리네요",
            author: { name: "아트콜렉터", username: "art_collector" },
            post: { title: "현대미술 경매전", slug: "modern-art-auction", category: { slug: "auction" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString()
        },
        {
            id: "au-5",
            content: "온라인 경매 수수료가 더 저렴하더라구요",
            author: { name: "경매초보", username: "auction_newbie" },
            post: { title: "온라인 경매 플랫폼 비교", slug: "online-auction-compare", category: { slug: "auction" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
        }
    ],
    appTech: [
        {
            id: "at-1",
            content: "이번 달 토스 만보기로 5만원 모았어요!",
            author: { name: "앱테크고수", username: "apptech_master" },
            post: { title: "토스 만보기 꿀팁", slug: "toss-walking-tips", category: { slug: "apptech" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString()
        },
        {
            id: "at-2",
            content: "캐시워크랑 같이 쓰면 더 좋아요",
            author: { name: "돈버는습관", username: "money_habit" },
            post: { title: "걷기 앱 총정리", slug: "walking-apps-guide", category: { slug: "apptech" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
        },
        {
            id: "at-3",
            content: "설문조사 앱은 패널나우가 제일 낫더라구요",
            author: { name: "설문왕", username: "survey_king" },
            post: { title: "설문조사 앱 수익 비교", slug: "survey-app-compare", category: { slug: "apptech" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString()
        },
        {
            id: "at-4",
            content: "리워드 앱 출석체크 꼭 하세요",
            author: { name: "출첵러", username: "daily_checker" },
            post: { title: "하루 10분 앱테크 루틴", slug: "10min-apptech-routine", category: { slug: "apptech" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()
        },
        {
            id: "at-5",
            content: "네이버 클로바 광고 보기 추천합니다",
            author: { name: "광고시청러", username: "ad_watcher" },
            post: { title: "광고 시청 앱 순위", slug: "ad-watching-apps", category: { slug: "apptech" } },
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString()
        }
    ]
};

type TabType = "realEstate" | "auction" | "appTech";

export function RecentComments({ comments }: RecentCommentsProps) {
    const [activeTab, setActiveTab] = useState<TabType>("realEstate");

    const tabs: { key: TabType; label: string }[] = [
        { key: "realEstate", label: "부동산 경매" },
        { key: "auction", label: "경매" },
        { key: "appTech", label: "앱테크" },
    ];

    // 실제 댓글이 있으면 사용하고, 없으면 가상 데이터 사용
    const getActiveComments = () => {
        if (comments.length > 0) {
            return comments;
        }
        return mockComments[activeTab] || [];
    };

    const activeComments = getActiveComments();

    return (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm overflow-hidden">
            {/* 탭 헤더 */}
            <div className="flex">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                            activeTab === tab.key
                                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 댓글 목록 */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {activeComments.length > 0 ? (
                    activeComments.slice(0, 5).map((comment) => (
                        <Link
                            key={comment.id}
                            to={comment.post.category ? `/${comment.post.category.slug}/${comment.post.slug}` : `/post/${comment.post.slug}`}
                            className="block px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                        >
                            <p className="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                {comment.content}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                                <span className="font-medium">{comment.author.name || comment.author.username}</span>
                                <span>·</span>
                                <span>{formatRelativeTime(comment.createdAt)}</span>
                            </div>
                        </Link>
                    ))
                ) : (
                    <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
                        아직 댓글이 없습니다
                    </div>
                )}
            </div>
        </div>
    );
}
