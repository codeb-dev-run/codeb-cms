import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import Tilt from "react-parallax-tilt";

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
  // description에서 선택지 파싱
  let leftOption = "👍 좋아요";
  let rightOption = "👎 싫어요";

  if (description) {
    try {
      const parsed = JSON.parse(description);
      if (parsed.leftOption) leftOption = parsed.leftOption;
      if (parsed.rightOption) rightOption = parsed.rightOption;
    } catch (e) {
      // JSON 파싱 실패 시 기본값 사용
    }
  }
  const [hoveredSide, setHoveredSide] = useState<"like" | "dislike" | null>(null);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [dislikeCount, setDislikeCount] = useState(initialDislikeCount);
  const [userVote, setUserVote] = useState<"LIKE" | "DISLIKE" | null>(initialUserVote);
  const [showHighlight, setShowHighlight] = useState(false); // 시각적 강조 효과용
  const fetcher = useFetcher();

  // API 응답 처리
  useEffect(() => {
    if (fetcher.data && fetcher.data.success) {
      const { action, voteType } = fetcher.data;

      if (action === "removed") {
        // 투표 취소
        if (userVote === "LIKE") {
          setLikeCount(prev => prev - 1);
        } else if (userVote === "DISLIKE") {
          setDislikeCount(prev => prev - 1);
        }
        setUserVote(null);
        setShowHighlight(false);
      } else if (action === "changed") {
        // 투표 변경
        if (userVote === "LIKE") {
          setLikeCount(prev => prev - 1);
          setDislikeCount(prev => prev + 1);
        } else if (userVote === "DISLIKE") {
          setDislikeCount(prev => prev - 1);
          setLikeCount(prev => prev + 1);
        }
        setUserVote(voteType);
        setShowHighlight(true);
        // 2초 후 강조 효과만 제거 (투표 상태는 유지)
        setTimeout(() => setShowHighlight(false), 2000);
      } else if (action === "added") {
        // 새 투표
        if (voteType === "LIKE") {
          setLikeCount(prev => prev + 1);
        } else {
          setDislikeCount(prev => prev + 1);
        }
        setUserVote(voteType);
        setShowHighlight(true);
        // 2초 후 강조 효과만 제거 (투표 상태는 유지)
        setTimeout(() => setShowHighlight(false), 2000);
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

  // 로딩 상태
  const isLoading = fetcher.state === "submitting";

  return (
    <Tilt
      tiltMaxAngleX={5}
      tiltMaxAngleY={5}
      perspective={1000}
      scale={1.02}
      transitionSpeed={400}
      gyroscope={true}
      className="w-full"
    >
      <div className="relative h-64 rounded-xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-800 cursor-pointer group">
        {/* 제목 */}
        <div className="absolute top-0 left-0 right-0 z-20 p-6 bg-gradient-to-b from-black/60 to-transparent">
          <h3 className="text-xl font-bold text-white text-center drop-shadow-lg">
            {title}
          </h3>
        </div>

        {/* 대각선 분할 배경 */}
        <div className="absolute inset-0 z-0">
          {/* 좋아요 영역 (왼쪽 빨강) */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-red-500 via-red-600 to-red-700 dark:from-red-600 dark:via-red-700 dark:to-red-800"
            style={{
              clipPath: `polygon(0 0, ${likePercentage}% 0, ${Math.max(likePercentage - 10, 0)}% 100%, 0 100%)`,
              opacity: hoveredSide === "like" ? 1 : hoveredSide === "dislike" ? 0.6 : 0.85,
              transition: 'clip-path 0.8s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s ease'
            }}
            onMouseEnter={() => !isLoading && setHoveredSide("like")}
            onMouseLeave={() => setHoveredSide(null)}
            onClick={() => !isLoading && handleVote("LIKE")}
          />

          {/* 싫어요 영역 (오른쪽 파랑) */}
          <div
            className="absolute inset-0 bg-gradient-to-bl from-blue-500 via-blue-600 to-blue-700 dark:from-blue-600 dark:via-blue-700 dark:to-blue-800"
            style={{
              clipPath: `polygon(${Math.min(likePercentage + 10, 100)}% 0, 100% 0, 100% 100%, ${likePercentage}% 100%)`,
              opacity: hoveredSide === "dislike" ? 1 : hoveredSide === "like" ? 0.6 : 0.85,
              transition: 'clip-path 0.8s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s ease'
            }}
            onMouseEnter={() => !isLoading && setHoveredSide("dislike")}
            onMouseLeave={() => setHoveredSide(null)}
            onClick={() => !isLoading && handleVote("DISLIKE")}
          />
        </div>

        {/* 투표 버튼 및 카운트 */}
        <div className="absolute inset-0 z-10 flex items-center justify-between px-8">
          {/* 왼쪽 선택지 버튼 */}
          <button
            onClick={() => handleVote("LIKE")}
            onMouseEnter={() => !isLoading && setHoveredSide("like")}
            onMouseLeave={() => setHoveredSide(null)}
            disabled={isLoading}
            className={`flex flex-col items-center gap-2 transition-all duration-300 transform ${
              hoveredSide === "like" ? "scale-125" : hoveredSide === "dislike" ? "scale-90 opacity-50" : "scale-100"
            } ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            <div className={`px-6 py-3 rounded-full flex items-center justify-center bg-white/20 backdrop-blur-sm border-2 transition-all duration-300 ${
              hoveredSide === "like" ? "bg-white/40 shadow-2xl" : ""
            } ${userVote === "LIKE" && showHighlight ? "border-white border-4 shadow-[0_0_20px_rgba(255,255,255,0.8)]" : "border-white/50"}`}>
              <span className="text-2xl font-bold text-white drop-shadow-lg whitespace-nowrap">{leftOption}</span>
            </div>
            <span className="text-3xl font-bold text-white drop-shadow-lg">
              {likeCount}
            </span>
            <span className="text-sm font-medium text-white/90 drop-shadow">
              {likePercentage.toFixed(1)}%
            </span>
          </button>

          {/* 오른쪽 선택지 버튼 */}
          <button
            onClick={() => handleVote("DISLIKE")}
            onMouseEnter={() => !isLoading && setHoveredSide("dislike")}
            onMouseLeave={() => setHoveredSide(null)}
            disabled={isLoading}
            className={`flex flex-col items-center gap-2 transition-all duration-300 transform ${
              hoveredSide === "dislike" ? "scale-125" : hoveredSide === "like" ? "scale-90 opacity-50" : "scale-100"
            } ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            <div className={`px-6 py-3 rounded-full flex items-center justify-center bg-white/20 backdrop-blur-sm border-2 transition-all duration-300 ${
              hoveredSide === "dislike" ? "bg-white/40 shadow-2xl" : ""
            } ${userVote === "DISLIKE" && showHighlight ? "border-white border-4 shadow-[0_0_20px_rgba(255,255,255,0.8)]" : "border-white/50"}`}>
              <span className="text-2xl font-bold text-white drop-shadow-lg whitespace-nowrap">{rightOption}</span>
            </div>
            <span className="text-3xl font-bold text-white drop-shadow-lg">
              {dislikeCount}
            </span>
            <span className="text-sm font-medium text-white/90 drop-shadow">
              {dislikePercentage.toFixed(1)}%
            </span>
          </button>
        </div>

        {/* 호버 시 가이드 텍스트 */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <p className="text-center text-white text-sm font-medium drop-shadow">
            {hoveredSide === "like" ? `${leftOption} 선택!` : hoveredSide === "dislike" ? `${rightOption} 선택!` : "투표하려면 클릭하세요"}
          </p>
        </div>
      </div>
    </Tilt>
  );
}
