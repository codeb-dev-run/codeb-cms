import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Plus, Edit2, Trash2, GripVertical } from "lucide-react";
import { db } from "~/lib/db.server";
import { requireUser } from "~/lib/auth.server";
import { useState } from "react";
import { z } from "zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

const menuItemSchema = z.object({
  title: z.string().min(1, "제목은 필수입니다"),
  url: z.string().min(1, "URL은 필수입니다"),
  order: z.number().int().min(0),
  parentId: z.string().optional().nullable(),
});

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);

  const menus = await db.navigationMenu.findMany({
    include: {
      items: {
        where: { parentId: null },
        orderBy: { order: 'asc' },
        include: {
          children: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const boards = await db.boards.findMany({
    where: { is_active: true },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  return json({ menus, boards });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);

  const formData = await request.formData();
  const intent = formData.get('intent');

  try {
    if (intent === 'createMenu') {
      const name = formData.get('name') as string;
      const position = formData.get('position') as string;
      
      await db.navigationMenu.create({
        data: { name, position },
      });
    } else if (intent === 'deleteMenu') {
      const menuId = formData.get('menuId') as string;
      await db.navigationMenu.delete({ where: { id: menuId } });
    } else if (intent === 'createMenuItem') {
      const menuId = formData.get('menuId') as string;
      const title = formData.get('title') as string;
      const urlType = formData.get('urlType') as string;
      const parentId = formData.get('parentId') as string | null;

      let url: string;

      if (urlType === 'board') {
        const boardId = formData.get('boardId') as string;
        const board = await db.boards.findUnique({
          where: { id: boardId },
          select: { slug: true },
        });
        url = board ? `/${board.slug}` : '/';
      } else {
        url = formData.get('url') as string;
      }

      const lastItem = await db.menuItem.findFirst({
        where: { menuId, parentId },
        orderBy: { order: 'desc' },
      });

      await db.menuItem.create({
        data: {
          menuId,
          title,
          url,
          parentId,
          order: lastItem ? lastItem.order + 1 : 0,
        },
      });
    } else if (intent === 'updateMenuItem') {
      const itemId = formData.get('itemId') as string;
      const title = formData.get('title') as string;
      const url = formData.get('url') as string;
      
      await db.menuItem.update({
        where: { id: itemId },
        data: { title, url },
      });
    } else if (intent === 'deleteMenuItem') {
      const itemId = formData.get('itemId') as string;
      await db.menuItem.delete({ where: { id: itemId } });
    } else if (intent === 'reorderMenuItems') {
      const items = JSON.parse(formData.get('items') as string);
      
      await db.$transaction(
        items.map((item: { id: string; order: number }) =>
          db.menuItem.update({
            where: { id: item.id },
            data: { order: item.order },
          })
        )
      );
    }

    return json({ success: true });
  } catch (error) {
    return json({ error: '작업 중 오류가 발생했습니다.' }, { status: 400 });
  }
}

export default function AdminMenus() {
  const { menus, boards } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [urlTypeByMenu, setUrlTypeByMenu] = useState<Record<string, 'board' | 'custom'>>({});

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">메뉴 관리</h2>
        <p className="text-muted-foreground">사이트 메뉴를 관리합니다.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>새 메뉴 추가</CardTitle>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="flex gap-4">
            <input type="hidden" name="intent" value="createMenu" />
            <div className="flex-1">
              <Label htmlFor="name">메뉴 이름</Label>
              <Input
                id="name"
                name="name"
                placeholder="메인 메뉴"
                required
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="position">위치</Label>
              <Input
                id="position"
                name="position"
                placeholder="header"
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit">추가</Button>
            </div>
          </fetcher.Form>
        </CardContent>
      </Card>

      <Tabs defaultValue={menus[0]?.id || ''}>
        <TabsList>
          {menus.map((menu) => (
            <TabsTrigger key={menu.id} value={menu.id}>
              {menu.name}
              <Badge variant="secondary" className="ml-2">
                {menu.position}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {menus.map((menu) => (
          <TabsContent key={menu.id} value={menu.id}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{menu.name} 메뉴 항목</CardTitle>
                  <fetcher.Form method="post" className="inline">
                    <input type="hidden" name="intent" value="deleteMenu" />
                    <input type="hidden" name="menuId" value={menu.id} />
                    <Button
                      variant="destructive"
                      size="sm"
                      type="submit"
                      onClick={(e) => {
                        if (!confirm('이 메뉴를 삭제하시겠습니까?')) {
                          e.preventDefault();
                        }
                      }}
                    >
                      메뉴 삭제
                    </Button>
                  </fetcher.Form>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <fetcher.Form method="post" className="space-y-4 border-b pb-4">
                    <input type="hidden" name="intent" value="createMenuItem" />
                    <input type="hidden" name="menuId" value={menu.id} />
                    <input type="hidden" name="urlType" value={urlTypeByMenu[menu.id] || 'custom'} />

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`title-${menu.id}`}>제목</Label>
                        <Input
                          id={`title-${menu.id}`}
                          name="title"
                          placeholder="메뉴 항목"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor={`urlType-${menu.id}`}>URL 타입</Label>
                        <Select
                          value={urlTypeByMenu[menu.id] || 'custom'}
                          onValueChange={(value) => {
                            setUrlTypeByMenu({
                              ...urlTypeByMenu,
                              [menu.id]: value as 'board' | 'custom'
                            });
                          }}
                        >
                          <SelectTrigger id={`urlType-${menu.id}`}>
                            <SelectValue placeholder="URL 타입 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="board">게시판</SelectItem>
                            <SelectItem value="custom">직접입력</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {urlTypeByMenu[menu.id] === 'board' ? (
                      <div>
                        <Label htmlFor={`boardId-${menu.id}`}>게시판 선택</Label>
                        <Select name="boardId" required>
                          <SelectTrigger id={`boardId-${menu.id}`}>
                            <SelectValue placeholder="게시판을 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            {boards.map((board) => (
                              <SelectItem key={board.id} value={board.id}>
                                {board.name} (/{board.slug})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor={`url-${menu.id}`}>URL</Label>
                        <Input
                          id={`url-${menu.id}`}
                          name="url"
                          placeholder="/about"
                          required={urlTypeByMenu[menu.id] !== 'board'}
                        />
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button type="submit">
                        <Plus className="h-4 w-4 mr-1" />
                        추가
                      </Button>
                    </div>
                  </fetcher.Form>

                  <div className="space-y-2">
                    {menu.items
                      .filter((item) => !item.parentId)
                      .map((item) => (
                        <div key={item.id} className="rounded-lg border p-3">
                          {editingItem === item.id ? (
                            <fetcher.Form
                              method="post"
                              className="flex gap-2"
                              onSubmit={() => setEditingItem(null)}
                            >
                              <input type="hidden" name="intent" value="updateMenuItem" />
                              <input type="hidden" name="itemId" value={item.id} />
                              <Input
                                name="title"
                                defaultValue={item.title}
                                required
                              />
                              <Input
                                name="url"
                                defaultValue={item.url}
                                required
                              />
                              <Button type="submit" size="sm">저장</Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingItem(null)}
                              >
                                취소
                              </Button>
                            </fetcher.Form>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-gray-400" />
                                <span className="font-medium">{item.title}</span>
                                <span className="text-sm text-muted-foreground">
                                  ({item.url})
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setEditingItem(item.id)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <fetcher.Form method="post" className="inline">
                                  <input type="hidden" name="intent" value="deleteMenuItem" />
                                  <input type="hidden" name="itemId" value={item.id} />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    type="submit"
                                    onClick={(e) => {
                                      if (!confirm('이 메뉴 항목을 삭제하시겠습니까?')) {
                                        e.preventDefault();
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                </fetcher.Form>
                              </div>
                            </div>
                          )}

                          {item.children.length > 0 && (
                            <div className="mt-2 ml-6 space-y-1">
                              {item.children.map((child) => (
                                <div
                                  key={child.id}
                                  className="flex items-center justify-between rounded border bg-gray-50 p-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">{child.title}</span>
                                    <span className="text-xs text-muted-foreground">
                                      ({child.url})
                                    </span>
                                  </div>
                                  <fetcher.Form method="post" className="inline">
                                    <input type="hidden" name="intent" value="deleteMenuItem" />
                                    <input type="hidden" name="itemId" value={child.id} />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      type="submit"
                                      onClick={(e) => {
                                        if (!confirm('이 메뉴 항목을 삭제하시겠습니까?')) {
                                          e.preventDefault();
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3 text-red-600" />
                                    </Button>
                                  </fetcher.Form>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}