import { useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";
import type { ThemeConfig } from "~/lib/theme.server";

export function useTheme(initialTheme?: ThemeConfig) {
  const fetcher = useFetcher<{ theme?: ThemeConfig }>();
  const [theme, setTheme] = useState<ThemeConfig | undefined>(initialTheme);

  useEffect(() => {
    if (fetcher.data?.theme) {
      setTheme(fetcher.data.theme);
    }
  }, [fetcher.data]);

  const updateTheme = (newTheme: ThemeConfig) => {
    setTheme(newTheme);
    // admin.theme 라우트를 사용하도록 수정
    const formData = new FormData();
    formData.append("theme", JSON.stringify(newTheme));
    fetcher.submit(formData, { method: "post", action: "/admin/theme" });
  };

  const applyPreset = (preset: string) => {
    if (theme) {
      updateTheme({ ...theme, preset: preset as any });
    }
  };

  return {
    theme,
    updateTheme,
    applyPreset,
    isLoading: fetcher.state !== "idle"
  };
}

export function useColorPicker() {
  const [color, setColor] = useState("#000000");
  const [isOpen, setIsOpen] = useState(false);

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
  };

  return {
    color,
    isOpen,
    setColor,
    setIsOpen,
    handleColorChange
  };
}