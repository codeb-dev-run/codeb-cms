import { Link } from "@remix-run/react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "~/components/ui/navigation-menu";
import { cn } from "~/lib/utils";
import React from "react";

interface NavigationProps {
  menus?: {
    id: string;
    name: string;
    slug: string;
    order: number;
  }[];
}

export function Navigation({ menus = [] }: NavigationProps) {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link to="/" className={navigationMenuTriggerStyle()}>
              홈
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>

        {menus
          .sort((a, b) => a.order - b.order)
          .map((menu) => {
            // slug가 이미 /로 시작하면 그대로 사용, 아니면 / 추가
            const url = menu.slug.startsWith('/') ? menu.slug : `/${menu.slug}`;
            return (
              <NavigationMenuItem key={menu.id}>
                <NavigationMenuLink asChild>
                  <Link to={url} className={navigationMenuTriggerStyle()}>
                    {menu.name}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & { title: string }
>(({ className, title, children, href, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          ref={ref}
          to={href || "/"}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";