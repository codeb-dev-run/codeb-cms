import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";

interface VoteBoxProps {
  topicId: string;
  title: string;
  description?: string;
  initialLikeCount?: number;
  initialDislikeCount?: number;
  initialUserVote?: "LIKE" | "DISLIKE" | null;
}

export function VoteBox({
  topicId,
  title,
  description,
  initialLikeCount = 0,
  initialDislikeCount = 0,
  initialUserVote = null
}: VoteBoxProps) {
  if (description) {
    try {
      const parsed = JSON.parse(description);
      // 옵션이 있으면 사용 (향후 확장용)
      void parsed;
    } catch {
      // JSON 파싱 실패 시 기본값 사용
    }
  }

  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [dislikeCount, setDislikeCount] = useState(initialDislikeCount);
  const [userVote, setUserVote] = useState<"LIKE" | "DISLIKE" | null>(initialUserVote);
  const fetcher = useFetcher<{ success?: boolean; action?: string; voteType?: "LIKE" | "DISLIKE" }>();

  useEffect(() => {
    if (fetcher.data?.success) {
      const { action, voteType } = fetcher.data;

      if (action === "removed") {
        if (userVote === "LIKE") {
          setLikeCount(prev => prev - 1);
        } else if (userVote === "DISLIKE") {
          setDislikeCount(prev => prev - 1);
        }
        setUserVote(null);
      } else if (action === "changed") {
        if (userVote === "LIKE") {
          setLikeCount(prev => prev - 1);
          setDislikeCount(prev => prev + 1);
        } else if (userVote === "DISLIKE") {
          setDislikeCount(prev => prev - 1);
          setLikeCount(prev => prev + 1);
        }
        setUserVote(voteType ?? null);
      } else if (action === "added") {
        if (voteType === "LIKE") {
          setLikeCount(prev => prev + 1);
        } else {
          setDislikeCount(prev => prev + 1);
        }
        setUserVote(voteType ?? null);
      }
    }
  }, [fetcher.data, userVote]);

  const handleVote = (vote: "LIKE" | "DISLIKE") => {
    const formData = new FormData();
    formData.append("topicId", topicId);
    formData.append("voteType", vote);
    fetcher.submit(formData, { method: "post", action: "/api/vote" });
  };

  const totalVotes = likeCount + dislikeCount;
  const likePercentage = totalVotes > 0 ? (likeCount / totalVotes) * 100 : 50;
  const dislikePercentage = totalVotes > 0 ? (dislikeCount / totalVotes) * 100 : 50;
  const isLoading = fetcher.state === "submitting";

  return (
    <div className="overflow-hidden rounded-lg shadow-sm">
      {/* 제목 헤더 */}
      <div className="bg-white dark:bg-gray-900 px-3 py-2.5">
        <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{title}</h3>
      </div>

      {/* 투표 영역 */}
      <div className="flex h-[120px]">
        {/* 레드 영역 */}
        <button
          onClick={() => handleVote("LIKE")}
          disabled={isLoading}
          className={`py-2 px-3 text-center transition-all duration-500 ease-out flex flex-col items-center justify-center ${
            userVote === "LIKE"
              ? "bg-red-600 flex-[1.3]"
              : userVote === "DISLIKE"
                ? "bg-red-500 flex-[0.7]"
                : "bg-red-500 flex-1"
          } ${
            isLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-red-600 active:scale-95"
          }`}
          style={{ clipPath: "polygon(0 0, 100% 0, 95% 100%, 0 100%)" }}
        >
          <div className={`text-2xl font-black text-white transition-transform duration-300 ${userVote === "LIKE" ? "scale-110" : ""}`}>{likeCount}</div>
          <div className="text-white/90 text-sm font-bold">{likePercentage.toFixed(0)}%</div>
          {userVote === "LIKE" && (
            <span className="inline-block text-xs text-white animate-bounce mt-1">✓</span>
          )}
        </button>

        {/* 블루 영역 */}
        <button
          onClick={() => handleVote("DISLIKE")}
          disabled={isLoading}
          className={`py-2 px-3 text-center transition-all duration-500 ease-out flex flex-col items-center justify-center ${
            userVote === "DISLIKE"
              ? "bg-blue-600 flex-[1.3]"
              : userVote === "LIKE"
                ? "bg-blue-500 flex-[0.7]"
                : "bg-blue-500 flex-1"
          } ${
            isLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-blue-600 active:scale-95"
          }`}
          style={{ clipPath: "polygon(5% 0, 100% 0, 100% 100%, 0 100%)" }}
        >
          <div className={`text-2xl font-black text-white transition-transform duration-300 ${userVote === "DISLIKE" ? "scale-110" : ""}`}>{dislikeCount}</div>
          <div className="text-white/90 text-sm font-bold">{dislikePercentage.toFixed(0)}%</div>
          {userVote === "DISLIKE" && (
            <span className="inline-block text-xs text-white animate-bounce mt-1">✓</span>
          )}
        </button>
      </div>

      {/* 하단 정보 */}
      <div className="bg-white dark:bg-gray-900 px-3 py-1.5 text-center">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          총 {totalVotes}표 · {isLoading ? "투표 중..." : "클릭하여 투표"}
        </span>
      </div>
    </div>
  );
}
