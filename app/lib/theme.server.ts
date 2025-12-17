import { db } from "~/lib/db.server";
import { json } from "@remix-run/node";

export interface ThemeConfig {
  mode?: "light" | "dark";
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: "pretendard" | "noto-sans-kr" | "malgun-gothic" | "custom" | string;
  fontSize: "small" | "medium" | "large";
  preset?: "salary-man" | "modern" | "nature" | "rose" | "dark-modern" | "dark-nature" | "custom" | string;
  customFontCSS?: string;
  customFonts?: Array<{id: string, name: string, css: string}>;
  savedColorPalettes?: Array<{id: string, name: string, colors: string[]}>;
  customPresets?: Array<{
    id: string;
    name: string;
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
  }>;
}

export const defaultTheme: ThemeConfig = {
  mode: "light",
  primaryColor: "#3B82F6",
  secondaryColor: "#6366F1",
  backgroundColor: "#FFFFFF",
  textColor: "#1F2937",
  fontFamily: "pretendard",
  fontSize: "medium",
  preset: "salary-man",
  customFonts: [],
  savedColorPalettes: [],
  customPresets: []
};

export const presetThemes: Record<string, Partial<ThemeConfig>> = {
  "salary-man": {
    mode: "light",
    primaryColor: "#3B82F6",
    secondaryColor: "#6366F1",
    backgroundColor: "#FFFFFF",
    textColor: "#1F2937",
  },
  "modern": {
    mode: "light",
    primaryColor: "#6B7280",
    secondaryColor: "#4B5563",
    backgroundColor: "#FFFFFF",
    textColor: "#111827",
  },
  "nature": {
    mode: "light",
    primaryColor: "#10B981",
    secondaryColor: "#059669",
    backgroundColor: "#FFFFFF",
    textColor: "#064E3B",
  },
  "rose": {
    mode: "light",
    primaryColor: "#F43F5E",
    secondaryColor: "#E11D48",
    backgroundColor: "#FFFFFF",
    textColor: "#881337",
  },
  "dark-modern": {
    mode: "dark",
    primaryColor: "#60A5FA",
    secondaryColor: "#818CF8",
    backgroundColor: "#111827",
    textColor: "#F9FAFB",
  },
  "dark-nature": {
    mode: "dark",
    primaryColor: "#34D399",
    secondaryColor: "#10B981",
    backgroundColor: "#064E3B",
    textColor: "#ECFDF5",
  }
};

export async function getThemeConfig(): Promise<ThemeConfig> {
  try {
    const setting = await db.setting.findFirst({
      where: { key: "theme" }
    });

    if (setting && setting.value) {
      const savedTheme = JSON.parse(setting.value as string) as ThemeConfig;
      return { ...defaultTheme, ...savedTheme };
    }
  } catch (error) {
    console.error("테마 로드 실패:", error);
    return defaultTheme;
  }

  return defaultTheme;
}

export async function saveThemeConfig(config: ThemeConfig): Promise<void> {
  console.log("Saving theme config to database:", config);
  
  await db.setting.upsert({
    where: { key: "theme" },
    update: {
      value: JSON.stringify(config)
    },
    create: {
      key: "theme",
      value: JSON.stringify(config),
      type: "json",
      category: "theme"
    }
  });
  
  console.log("Theme config saved successfully");
}

export function generateCSSVariables(theme: ThemeConfig): string {
  const fontSizes = {
    small: { base: "14px", h1: "2rem", h2: "1.75rem", h3: "1.5rem" },
    medium: { base: "16px", h1: "2.5rem", h2: "2rem", h3: "1.75rem" },
    large: { base: "18px", h1: "3rem", h2: "2.5rem", h3: "2rem" }
  };

  const fontFamilies: Record<string, string> = {
    "pretendard": "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "noto-sans-kr": "'Noto Sans KR', sans-serif",
    "malgun-gothic": "'Malgun Gothic', '맑은 고딕', sans-serif",
    "custom": "var(--custom-font-family, 'Pretendard')"
  };

  // 커스텀 폰트 ID로 시작하는 경우 처리
  let selectedFontFamily = fontFamilies[theme.fontFamily] || fontFamilies["pretendard"];
  if (theme.fontFamily.startsWith("custom-") && theme.customFonts) {
    const fontId = theme.fontFamily.replace("custom-", "");
    const customFont = theme.customFonts.find(f => f.id === fontId);
    if (customFont) {
      selectedFontFamily = `'${customFont.name}', sans-serif`;
    }
  }

  const sizes = fontSizes[theme.fontSize];
  const fontFamily = selectedFontFamily;

  // Convert hex to RGB for opacity support
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`
      : "0 0 0";
  };

  // 커스텀 폰트 추출
  let customFontFamily = "'Pretendard'";
  let customFontFaces = "";
  
  if (theme.customFonts && theme.customFonts.length > 0) {
    // 모든 커스텀 폰트의 @font-face CSS 추가
    customFontFaces = theme.customFonts.map(font => font.css).join('\n');
    
    // 현재 선택된 폰트가 커스텀 폰트인 경우
    if (theme.fontFamily.startsWith("custom-")) {
      const fontId = theme.fontFamily.replace("custom-", "");
      const selectedFont = theme.customFonts.find(f => f.id === fontId);
      if (selectedFont) {
        customFontFamily = `'${selectedFont.name}'`;
      }
    }
  }
  
  // 구버전 호환성을 위한 처리
  if (theme.fontFamily === "custom" && theme.customFontCSS) {
    const fontFamilyMatch = theme.customFontCSS.match(/font-family:\s*['"]([^'"]+)['"]/);
    if (fontFamilyMatch) {
      customFontFamily = `'${fontFamilyMatch[1]}'`;
      customFontFaces = theme.customFontCSS;
    }
  }

  // 다크모드 색상 자동 생성 (다크모드 프리셋이 아닌 경우)
  const isDarkMode = theme.mode === "dark";
  let darkBackground = theme.backgroundColor;
  let darkText = theme.textColor;

  if (isDarkMode && !theme.preset?.includes("dark")) {
    // 라이트 테마를 다크모드로 자동 변환
    darkBackground = "#111827"; // gray-900
    darkText = "#F9FAFB"; // gray-50
  }

  const cssVars = `
    ${customFontFaces}

    :root {
      --color-primary: ${theme.primaryColor};
      --color-primary-rgb: ${hexToRgb(theme.primaryColor)};
      --color-secondary: ${theme.secondaryColor};
      --color-secondary-rgb: ${hexToRgb(theme.secondaryColor)};
      --color-background: ${theme.backgroundColor};
      --color-background-rgb: ${hexToRgb(theme.backgroundColor)};
      --color-text: ${theme.textColor};
      --color-text-rgb: ${hexToRgb(theme.textColor)};

      --custom-font-family: ${customFontFamily};
      --font-family: ${fontFamily};
      --font-size-base: ${sizes.base};
      --font-size-h1: ${sizes.h1};
      --font-size-h2: ${sizes.h2};
      --font-size-h3: ${sizes.h3};
    }

    .dark {
      --color-background: ${darkBackground};
      --color-background-rgb: ${hexToRgb(darkBackground)};
      --color-text: ${darkText};
      --color-text-rgb: ${hexToRgb(darkText)};
    }
  `;

  return cssVars;
}

