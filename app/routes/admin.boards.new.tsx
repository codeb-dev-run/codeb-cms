import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { ArrowLeft } from "lucide-react";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  
  // 관리자 권한 확인
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    throw new Response("Unauthorized", { status: 403 });
  }

  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  
  // 관리자 권한 확인
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN") {
    throw new Response("Unauthorized", { status: 403 });
  }

  const formData = await request.formData();
  
  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const description = formData.get("description") as string;
  const boardType = formData.get("boardType") as string;
  const showInMain = formData.get("showInMain") === "on";
  const isActive = formData.get("isActive") === "on";
  const useComment = formData.get("useComment") === "on";
  const useAttachment = formData.get("useAttachment") === "on";
  const useNotice = formData.get("useNotice") === "on";
  const readPermission = formData.get("readPermission") as string;
  const writePermission = formData.get("writePermission") as string;
  const commentPermission = formData.get("commentPermission") as string;
  const postsPerPage = parseInt(formData.get("postsPerPage") as string) || 20;

  // 유효성 검사
  if (!name || !slug) {
    return json({ error: "게시판 이름과 슬러그는 필수입니다." }, { status: 400 });
  }

  // 슬러그 중복 확인
  const existingBoard = await db.boards.findUnique({
    where: { slug }
  });

  if (existingBoard) {
    return json({ error: "이미 사용 중인 슬러그입니다." }, { status: 400 });
  }

  try {
    // 게시판 생성
    const board = await db.boards.create({
      data: {
        id: crypto.randomUUID(),
        name,
        slug,
        description,
        board_type: boardType,
        show_in_main: showInMain,
        is_active: isActive,
        use_comment: useComment,
        use_attachment: useAttachment,
        use_notice: useNotice,
        read_permission: readPermission,
        write_permission: writePermission,
        comment_permission: commentPermission,
        posts_per_page: postsPerPage,
        order: 0,
        updated_at: new Date()
      }
    });

    // 메뉴에도 자동으로 추가
    await db.menu.create({
      data: {
        name,
        slug,
        description,
        isActive,
        board_id: board.id,
        order: 0
      }
    });

    return redirect("/admin/boards");
  } catch (error) {
    console.error("Board creation error:", error);
    return json({ error: "게시판 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export default function NewBoard() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Link to="/admin/boards">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">새 게시판 생성</h1>
          <p className="text-gray-600 mt-1">새로운 게시판을 생성합니다</p>
        </div>
      </div>

      {/* 폼 */}
      <Form method="post" className="space-y-6 bg-white rounded-lg shadow p-6">
        {actionData?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {actionData.error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 기본 정보 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">기본 정보</h3>
            
            <div>
              <Label htmlFor="name">게시판 이름 *</Label>
              <Input
                id="name"
                name="name"
                placeholder="예: 공지사항"
                required
              />
            </div>

            <div>
              <Label htmlFor="slug">URL 슬러그 *</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="예: notice"
                pattern="[a-z0-9-]+"
                required
              />
              <p className="text-xs text-gray-500 mt-1">영문 소문자, 숫자, 하이픈만 사용 가능</p>
            </div>

            <div>
              <Label htmlFor="description">설명</Label>
              <Input
                id="description"
                name="description"
                placeholder="게시판 설명"
              />
            </div>

            <div>
              <Label htmlFor="boardType">게시판 유형</Label>
              <Select name="boardType" defaultValue="general">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">일반 게시판</SelectItem>
                  <SelectItem value="notice">공지사항</SelectItem>
                  <SelectItem value="gallery">갤러리</SelectItem>
                  <SelectItem value="qna">Q&A</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="postsPerPage">페이지당 게시물 수</Label>
              <Input
                id="postsPerPage"
                name="postsPerPage"
                type="number"
                defaultValue="20"
                min="5"
                max="100"
              />
            </div>
          </div>

          {/* 권한 설정 */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">권한 설정</h3>
            
            <div>
              <Label htmlFor="readPermission">읽기 권한</Label>
              <Select name="readPermission" defaultValue="all">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 공개</SelectItem>
                  <SelectItem value="user">회원만</SelectItem>
                  <SelectItem value="admin">관리자만</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="writePermission">쓰기 권한</Label>
              <Select name="writePermission" defaultValue="user">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">회원</SelectItem>
                  <SelectItem value="admin">관리자만</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="commentPermission">댓글 권한</Label>
              <Select name="commentPermission" defaultValue="user">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">회원</SelectItem>
                  <SelectItem value="admin">관리자만</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* 기능 설정 */}
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-lg font-medium">기능 설정</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="isActive" className="cursor-pointer">
                게시판 활성화
              </Label>
              <Switch id="isActive" name="isActive" defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="showInMain" className="cursor-pointer">
                메인 페이지 노출
              </Label>
              <Switch id="showInMain" name="showInMain" defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="useComment" className="cursor-pointer">
                댓글 기능 사용
              </Label>
              <Switch id="useComment" name="useComment" defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="useNotice" className="cursor-pointer">
                공지사항 기능 사용
              </Label>
              <Switch id="useNotice" name="useNotice" defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="useAttachment" className="cursor-pointer">
                첨부파일 기능 사용
              </Label>
              <Switch id="useAttachment" name="useAttachment" />
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-4 border-t pt-6">
          <Link to="/admin/boards">
            <Button variant="outline" type="button">
              취소
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "생성 중..." : "게시판 생성"}
          </Button>
        </div>
      </Form>
    </div>
  );
}