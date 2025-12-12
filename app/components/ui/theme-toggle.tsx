import { Moon, Sun } from "lucide-react";
import { useFetcher } from "@remix-run/react";
import { useEffect } from "react";
import { Button } from "~/components/ui/button";

interface ThemeToggleProps {
  currentMode?: "light" | "dark";
}

export function ThemeToggle({ currentMode = "light" }: ThemeToggleProps) {
  const fetcher = useFetcher<{ mode?: "light" | "dark" }>();
  const isDark = currentMode === "dark";

  // 테마 토글 핸들러
  const toggleTheme = () => {
    const newMode = isDark ? "light" : "dark";

    fetcher.submit(
      { mode: newMode },
      {
        method: "post",
        action: "/api/theme/toggle"
      }
    );
  };

  // 클라이언트 사이드에서 즉시 다크모드 적용
  useEffect(() => {
    if (fetcher.data?.mode) {
      const html = document.documentElement;
      if (fetcher.data.mode === "dark") {
        html.classList.add("dark");
      } else {
        html.classList.remove("dark");
      }
    }
  }, [fetcher.data]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {isDark ? (
        <Sun className="h-5 w-5 text-yellow-500" />
      ) : (
        <Moon className="h-5 w-5 text-slate-700" />
      )}
    </Button>
  );
}
