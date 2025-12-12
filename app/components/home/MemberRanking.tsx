import { Link } from "@remix-run/react";

interface MemberRankingProps {
    rankings: {
        id: string;
        name: string;
        username: string;
        postCount: number;
        rank: number;
    }[];
}

export function MemberRanking({ rankings }: MemberRankingProps) {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm overflow-hidden">
            {/* 헤더 */}
            <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-none">👑 회원 랭킹</h3>
                <Link to="/ranking" className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs transition-colors">전체보기</Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {rankings.length > 0 ? (
                    rankings.slice(0, 5).map((member) => (
                        <div key={member.id} className="flex items-center gap-2 px-3 py-1">
                            <span className={`flex-shrink-0 w-5 h-5 rounded text-xs font-bold flex items-center justify-center ${
                                member.rank === 1 ? 'bg-yellow-500 text-white' :
                                member.rank === 2 ? 'bg-gray-400 text-white' :
                                member.rank === 3 ? 'bg-orange-400 text-white' :
                                'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                            }`}>
                                {member.rank}
                            </span>
                            <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
                                {member.name || member.username}
                            </span>
                            <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                                {member.postCount}글
                            </span>
                        </div>
                    ))
                ) : (
                    <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        회원 정보가 없습니다
                    </div>
                )}
            </div>
        </div>
    );
}
