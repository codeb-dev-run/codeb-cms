import { Link } from "@remix-run/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Switch } from "~/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { MoreHorizontal, User, Shield, Ban } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface UserData {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN';
  isActive: boolean;
  createdAt: string | Date;
  _count: {
    posts: number;
    comments: number;
  };
}

interface UserTableProps {
  users: UserData[];
  onRoleChange: (userId: string, role: 'USER' | 'ADMIN') => void;
  onActiveChange: (userId: string, isActive: boolean) => void;
}

export function UserTable({ users, onRoleChange, onActiveChange }: UserTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>사용자</TableHead>
            <TableHead>역할</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>게시글</TableHead>
            <TableHead>댓글</TableHead>
            <TableHead>가입일</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{user.name || '이름 없음'}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                  {user.role === 'ADMIN' ? '관리자' : '일반 사용자'}
                </Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={user.isActive}
                  onCheckedChange={(checked) => onActiveChange(user.id, checked)}
                />
              </TableCell>
              <TableCell>{user._count.posts}</TableCell>
              <TableCell>{user._count.comments}</TableCell>
              <TableCell>
                {format(user.createdAt, 'yyyy년 MM월 dd일', { locale: ko })}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>작업</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to={`/admin/users/${user.id}`}>
                        <User className="mr-2 h-4 w-4" />
                        상세 정보
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onRoleChange(user.id, user.role === 'ADMIN' ? 'USER' : 'ADMIN')}
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      {user.role === 'ADMIN' ? '일반 사용자로 변경' : '관리자로 변경'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onActiveChange(user.id, !user.isActive)}
                      className="text-red-600"
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      {user.isActive ? '계정 비활성화' : '계정 활성화'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}