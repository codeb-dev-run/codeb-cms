import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, Link } from "@remix-run/react";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db.server";
import { Button } from "~/components/ui/button";
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Image,
  ArrowUp,
  ArrowDown
} from "lucide-react";

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

  // 모든 게시판 가져오기
  const boards = await db.boards.findMany({
    orderBy: { order: "asc" },
    include: {
      _count: {
        select: { posts: true }
      }
    }
  });

  return json({ boards });
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
  const action = formData.get("_action");
  const boardId = formData.get("boardId") as string;

  if (action === "delete" && boardId) {
    await db.boards.delete({
      where: { id: boardId }
    });
    return json({ success: true });
  }

  if (action === "toggle" && boardId) {
    const board = await db.boards.findUnique({
      where: { id: boardId }
    });

    if (board) {
      await db.boards.update({
        where: { id: boardId },
        data: { is_active: !board.is_active }
      });
    }
    return json({ success: true });
  }

  if (action === "move-up" && boardId) {
    const currentBoard = await db.boards.findUnique({
      where: { id: boardId }
    });

    if (currentBoard) {
      const previousBoard = await db.boards.findFirst({
        where: { order: { lt: currentBoard.order } },
        orderBy: { order: "desc" }
      });

      if (previousBoard) {
        await db.boards.update({
          where: { id: currentBoard.id },
          data: { order: previousBoard.order }
        });
        await db.boards.update({
          where: { id: previousBoard.id },
          data: { order: currentBoard.order }
        });
      }
    }
    return json({ success: true });
  }

  if (action === "move-down" && boardId) {
    const currentBoard = await db.boards.findUnique({
      where: { id: boardId }
    });

    if (currentBoard) {
      const nextBoard = await db.boards.findFirst({
        where: { order: { gt: currentBoard.order } },
        orderBy: { order: "asc" }
      });

      if (nextBoard) {
        await db.boards.update({
          where: { id: currentBoard.id },
          data: { order: nextBoard.order }
        });
        await db.boards.update({
          where: { id: nextBoard.id },
          data: { order: currentBoard.order }
        });
      }
    }
    return json({ success: true });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function AdminBoards() {
  const { boards } = useLoaderData<typeof loader>();

  const getBoardTypeIcon = (type: string) => {
    switch (type) {
      case 'notice':
        return <MessageSquare className="h-4 w-4" />;
      case 'gallery':
        return <Image className="h-4 w-4" />;
      case 'qna':
        return <FileText className="h-4 w-4" />;
      default:
        return <LayoutDashboard className="h-4 w-4" />;
    }
  };

  const getBoardTypeName = (type: string) => {
    switch (type) {
      case 'notice':
        return '공지사항';
      case 'gallery':
        return '갤러리';
      case 'qna':
        return 'Q&A';
      case 'general':
      default:
        return '일반';
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">게시판 관리</h1>
          <p className="text-gray-600 mt-1">게시판을 생성하고 관리합니다</p>
        </div>
        <Link to="/admin/boards/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            새 게시판
          </Button>
        </Link>
      </div>

      {/* 게시판 목록 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                순서
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                게시판
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                유형
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                게시물
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                메인 노출
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                상태
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                권한
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {boards.map((board, index) => (
              <tr key={board.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{board.order}</span>
                    <div className="flex flex-col gap-1">
                      <Form method="post" className="inline">
                        <input type="hidden" name="_action" value="move-up" />
                        <input type="hidden" name="boardId" value={board.id} />
                        <Button
                          variant="ghost"
                          size="icon"
                          type="submit"
                          className="h-6 w-6"
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                      </Form>
                      <Form method="post" className="inline">
                        <input type="hidden" name="_action" value="move-down" />
                        <input type="hidden" name="boardId" value={board.id} />
                        <Button
                          variant="ghost"
                          size="icon"
                          type="submit"
                          className="h-6 w-6"
                          disabled={index === boards.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </Form>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      {getBoardTypeIcon(board.board_type)}
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900">
                        {board.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        /{board.slug}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                    {getBoardTypeName(board.board_type)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {board._count.posts}개
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {board.show_in_main ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      노출
                    </span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                      숨김
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {board.is_active ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      활성
                    </span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                      비활성
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="text-xs">
                    <div>읽기: {board.read_permission}</div>
                    <div>쓰기: {board.write_permission}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <Link to={`/admin/boards/${board.id}/edit`}>
                      <Button variant="ghost" size="icon">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Form method="post" className="inline">
                      <input type="hidden" name="_action" value="toggle" />
                      <input type="hidden" name="boardId" value={board.id} />
                      <Button variant="ghost" size="icon" type="submit">
                        {board.is_active ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </Form>
                    <Form method="post" className="inline" 
                      onSubmit={(e) => {
                        if (!confirm('정말 삭제하시겠습니까? 게시판의 모든 게시물도 함께 삭제됩니다.')) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="_action" value="delete" />
                      <input type="hidden" name="boardId" value={board.id} />
                      <Button variant="ghost" size="icon" type="submit">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </Form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {boards.length === 0 && (
          <div className="text-center py-12">
            <LayoutDashboard className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">게시판이 없습니다</h3>
            <p className="mt-1 text-sm text-gray-500">새 게시판을 생성해주세요</p>
            <div className="mt-6">
              <Link to="/admin/boards/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  새 게시판 생성
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}