/**
 * 게시물 상세 페이지
 *
 * QPS 10K 최적화:
 * - 조회수: Redis 카운터 → 배치 DB 업데이트 (매 5분)
 * - DB 직접 UPDATE 제거
 */

import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useSubmit, useNavigate, Link, useFetcher } from "@remix-run/react";
import { useState } from "react";
import { db } from "~/lib/db.server";
import { getUser } from "~/lib/auth.server";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Textarea } from "~/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Eye,
  ThumbsUp,
  MessageSquare,
  ChevronLeft,
  MoreVertical,
  Edit,
  Trash2,
  Calendar,
  User
} from "lucide-react";
import { ShareBookmark } from "~/components/post/ShareBookmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import { incrementViewCount } from "~/lib/performance/qps-optimizer.server";
import { getClientIP } from "~/lib/middleware/rate-limiter.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { categorySlug, postId } = params;
  const user = await getUser(request);
  const clientIP = getClientIP(request);

  // ID 또는 slug로 게시글 찾기
  const post = await db.post.findFirst({
    where: {
      OR: [
        { id: postId },
        { slug: postId }
      ]
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          role: true
        }
      },
      menu: true,
      comments: {
        include: {
          author: {
            select: {
              id: true,
              username: true,
              name: true,
              email: true
            }
          },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { comments: true }
      }
    },
  });

  if (!post) {
    throw new Response("게시글을 찾을 수 없습니다", { status: 404 });
  }

  if (post.menu.slug !== categorySlug) {
    throw new Response("잘못된 카테고리입니다", { status: 404 });
  }

  // QPS 10K 최적화: Redis 카운터로 조회수 관리 (배치로 DB 업데이트)
  const viewKey = `view_${post.id}_${user?.id || clientIP}`;
  const cookieHeader = request.headers.get("Cookie") || "";
  const hasViewed = cookieHeader.includes(viewKey);

  let updatedViews = post.views;
  if (!hasViewed) {
    // Redis 카운터 증가 (DB 직접 업데이트 제거 - 5분마다 배치 처리)
    const redisCount = await incrementViewCount(post.id);
    updatedViews = post.views + redisCount;
  }

  // 사용자가 이미 추천했는지 확인 (PostVote 테이블 활용)
  let hasLiked = false;
  if (user) {
    const existingVote = await db.postVote.findFirst({
      where: {
        postId: post.id,
        userId: user.id,
        voteType: "LIKE",
      },
    });
    hasLiked = !!existingVote;
  } else {
    // 비로그인 사용자는 IP로 확인
    const existingVote = await db.postVote.findFirst({
      where: {
        postId: post.id,
        ipAddress: clientIP,
        voteType: "LIKE",
      },
    });
    hasLiked = !!existingVote;
  }

  const response = json({
    post: {
      ...post,
      views: updatedViews,
    },
    user,
    isAuthor: user?.id === post.authorId,
    isAdmin: user?.role === "ADMIN",
    hasLiked,
  });

  // 조회 쿠키 설정 (24시간 유효)
  if (!hasViewed) {
    response.headers.set(
      "Set-Cookie",
      `${viewKey}=1; Path=/; Max-Age=86400; SameSite=Lax`
    );
  }

  return response;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const actionType = formData.get("_action");
  const user = await getUser(request);
  const clientIP = getClientIP(request);

  const { postId } = params;
  const post = await db.post.findFirst({
    where: {
      OR: [
        { id: postId },
        { slug: postId }
      ]
    },
    select: { id: true, authorId: true, likes: true, menu: { select: { slug: true } } }
  });

  if (!post) {
    throw new Response("게시글을 찾을 수 없습니다", { status: 404 });
  }

  switch (actionType) {
    case "delete":
      if (!user) {
        return redirect("/auth/login");
      }
      if (user.id !== post.authorId && user.role !== "ADMIN") {
        throw new Response("권한이 없습니다", { status: 403 });
      }
      await db.post.delete({ where: { id: post.id } });
      return redirect(`/${post.menu.slug}`);

    case "like": {
      // PostVote를 활용한 중복 추천 방지
      const voteCondition = user
        ? { postId: post.id, userId: user.id }
        : { postId: post.id, ipAddress: clientIP };

      const existingVote = await db.postVote.findFirst({
        where: { ...voteCondition, voteType: "LIKE" },
      });

      if (existingVote) {
        // 이미 추천한 경우 추천 취소
        await db.$transaction([
          db.postVote.delete({ where: { id: existingVote.id } }),
          db.post.update({
            where: { id: post.id },
            data: { likes: { decrement: 1 } },
          }),
        ]);
        return json({ success: true, liked: false, likes: post.likes - 1 });
      } else {
        // 새로운 추천
        await db.$transaction([
          db.postVote.create({
            data: {
              postId: post.id,
              userId: user?.id || null,
              ipAddress: user ? null : clientIP,
              voteType: "LIKE",
            },
          }),
          db.post.update({
            where: { id: post.id },
            data: { likes: { increment: 1 } },
          }),
        ]);
        return json({ success: true, liked: true, likes: post.likes + 1 });
      }
    }

    case "comment": {
      if (!user) {
        return redirect("/auth/login");
      }
      const content = formData.get("content") as string;
      if (!content || content.trim().length === 0) {
        return json({ error: "댓글 내용을 입력하세요" }, { status: 400 });
      }

      await db.comment.create({
        data: {
          content: content.trim(),
          postId: post.id,
          authorId: user.id,
        },
      });
      return json({ success: true });
    }

    case "editComment": {
      if (!user) {
        return redirect("/auth/login");
      }
      const commentId = formData.get("commentId") as string;
      const content = formData.get("content") as string;

      if (!commentId || !content || content.trim().length === 0) {
        return json({ error: "댓글 내용을 입력하세요" }, { status: 400 });
      }

      const comment = await db.comment.findUnique({
        where: { id: commentId },
        select: { authorId: true },
      });

      if (!comment) {
        return json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
      }

      if (comment.authorId !== user.id && user.role !== "ADMIN") {
        return json({ error: "수정 권한이 없습니다" }, { status: 403 });
      }

      await db.comment.update({
        where: { id: commentId },
        data: { content: content.trim() },
      });
      return json({ success: true });
    }

    case "deleteComment": {
      if (!user) {
        return redirect("/auth/login");
      }
      const commentId = formData.get("commentId") as string;

      if (!commentId) {
        return json({ error: "댓글 ID가 필요합니다" }, { status: 400 });
      }

      const comment = await db.comment.findUnique({
        where: { id: commentId },
        select: { authorId: true },
      });

      if (!comment) {
        return json({ error: "댓글을 찾을 수 없습니다" }, { status: 404 });
      }

      if (comment.authorId !== user.id && user.role !== "ADMIN") {
        return json({ error: "삭제 권한이 없습니다" }, { status: 403 });
      }

      await db.comment.delete({ where: { id: commentId } });
      return json({ success: true });
    }

    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
}

export default function PostDetail() {
  const { post, user, isAuthor, isAdmin, hasLiked } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const handleLike = () => {
    submit({ _action: "like" }, { method: "post", replace: true });
  };

  const handleDelete = () => {
    if (confirm("정말 삭제하시겠습니까?")) {
      submit({ _action: "delete" }, { method: "post" });
    }
  };

  const handleEditComment = (commentId: string, currentContent: string) => {
    setEditingCommentId(commentId);
    setEditContent(currentContent);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditContent("");
  };

  const handleSaveEdit = (commentId: string) => {
    fetcher.submit(
      { _action: "editComment", commentId, content: editContent },
      { method: "post" }
    );
    setEditingCommentId(null);
    setEditContent("");
  };

  const handleDeleteComment = (commentId: string) => {
    if (confirm("댓글을 삭제하시겠습니까?")) {
      fetcher.submit(
        { _action: "deleteComment", commentId },
        { method: "post" }
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* 서브 히어로 섹션 */}
      <div className="bg-primary/5 dark:bg-primary/10 border-y border-primary/20 dark:border-primary/30 py-6 sm:py-8 px-4">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: '1450px' }}>
          <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 dark:text-gray-100">{post.menu.name}</h1>
          <p className="text-center text-sm sm:text-base text-muted-foreground dark:text-gray-400 mt-2">
            {post.menu.name} 관련 정보와 토론을 나누는 공간입니다
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: '1450px' }}>
        {/* 상단 네비게이션 */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            to={`/${post.menu.slug}`}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          >
            <ChevronLeft className="h-5 w-5" />
            <span>{post.menu.name} 게시판으로 돌아가기</span>
          </Link>
          
          {(isAuthor || isAdmin) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/${post.menu.slug}/${post.slug}/edit`)}>
                  <Edit className="h-4 w-4 mr-2" />
                  수정
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* 게시글 본문 */}
        <article className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
          {/* 헤더 */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {post.isNotice && (
                    <Badge variant="destructive" className="mr-2 align-middle">공지</Badge>
                  )}
                  {post.title}
                </h1>
                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    <span>{post.author.name || post.author.username || post.author.email.split('@')[0]}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <time>{formatDistanceToNow(new Date(post.publishedAt || post.createdAt), { addSuffix: true, locale: ko })}</time>
                  </div>
                  <div className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    <span>{post.views}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" />
                    <span>{post._count.comments}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 본문 */}
          <div className="p-6">
            <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300 leading-relaxed text-base sm:text-lg">
              {post.content || <span className="text-gray-500 dark:text-gray-400 italic">내용이 없습니다</span>}
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Button
                variant={hasLiked ? "default" : "outline"}
                size="sm"
                onClick={handleLike}
                disabled={!user}
              >
                <ThumbsUp className={cn("h-4 w-4 mr-2", hasLiked && "fill-current")} />
                추천 {post.likes > 0 && `(${post.likes})`}
              </Button>
              <ShareBookmark
                postId={post.id}
                postTitle={post.title}
                postUrl={`/${post.menu.slug}/${post.slug}`}
              />
            </div>
          </div>
        </article>

        {/* 댓글 섹션 */}
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">댓글 {post._count.comments}개</h2>
          </div>

          {/* 댓글 작성 */}
          {user ? (
            <Form method="post" className="p-6 border-b border-gray-200 dark:border-gray-800">
              <input type="hidden" name="_action" value="comment" />
              <Textarea
                name="content"
                placeholder="댓글을 작성하세요..."
                className="w-full mb-4"
                rows={3}
              />
              <div className="flex justify-end">
                <Button type="submit">댓글 작성</Button>
              </div>
            </Form>
          ) : (
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 text-center">
              <p className="text-gray-500 dark:text-gray-400 mb-4">댓글을 작성하려면 로그인이 필요합니다.</p>
              <Link to="/auth/login">
                <Button>로그인</Button>
              </Link>
            </div>
          )}

          {/* 댓글 목록 */}
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {post.comments.length > 0 ? (
              post.comments.map((comment) => {
                const isCommentAuthor = user?.id === comment.author.id;
                const canModify = isCommentAuthor || isAdmin;

                return (
                  <div key={comment.id} className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {comment.author.name || comment.author.username || comment.author.email.split('@')[0]}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ko })}
                            </span>
                          </div>
                          {canModify && editingCommentId !== comment.id && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditComment(comment.id, comment.content)}
                                className="h-7 px-2 text-xs"
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                수정
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteComment(comment.id)}
                                className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                삭제
                              </Button>
                            </div>
                          )}
                        </div>
                        {editingCommentId === comment.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancelEdit}
                              >
                                취소
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleSaveEdit(comment.id)}
                                disabled={!editContent.trim()}
                              >
                                저장
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{comment.content}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                아직 댓글이 없습니다. 첫 번째 댓글을 작성해보세요!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}