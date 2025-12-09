import { type LoaderFunctionArgs, type ActionFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, Form, useNavigation, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireUser } from "~/lib/auth.server";
import { 
  getThemeConfig, 
  saveThemeConfig,
  type ThemeConfig 
} from "~/lib/theme.server";
import { useTheme } from "~/hooks/useTheme";

// Client-safe preset themes
const presetThemes = {
  "salary-man": {
    primaryColor: "#3B82F6",
    secondaryColor: "#6366F1",
    backgroundColor: "#FFFFFF",
    textColor: "#1F2937",
  },
  "modern": {
    primaryColor: "#6B7280",
    secondaryColor: "#4B5563",
    backgroundColor: "#FFFFFF",
    textColor: "#111827",
  },
  "nature": {
    primaryColor: "#10B981",
    secondaryColor: "#059669",
    backgroundColor: "#FFFFFF",
    textColor: "#064E3B",
  },
  "rose": {
    primaryColor: "#F43F5E",
    secondaryColor: "#E11D48",
    backgroundColor: "#FFFFFF",
    textColor: "#881337",
  }
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request, ["ADMIN", "MANAGER"]);
  const theme = await getThemeConfig();
  return json({ theme });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request, ["ADMIN", "MANAGER"]);
  
  const formData = await request.formData();
  const intent = formData.get("intent");
  
  if (intent === "generateColors") {
    console.log("Generating colors request received");
    
    // 다양한 색상 팔레트 컬렉션
    const testPalettes = [
      // 밝고 활기찬 팔레트
      ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"],
      ["#FF7675", "#74B9FF", "#81ECEC", "#A29BFE", "#FDCB6E"],
      ["#E17055", "#00B894", "#0984E3", "#6C5CE7", "#FDCB6E"],
      
      // 자연스러운 팔레트
      ["#F8F9F8", "#76BD58", "#4597AE", "#796D54", "#2B2A37"],
      ["#2D3436", "#636E72", "#DDD", "#74B9FF", "#00B894"],
      ["#DFE6E9", "#00CEC9", "#55A3FF", "#5F3DC4", "#FD79A8"],
      
      // 파스텔 톤
      ["#FAB1A0", "#FF7675", "#FD79A8", "#FDCB6E", "#A29BFE"],
      ["#74B9FF", "#A29BFE", "#FD79A8", "#FDCB6E", "#55EFC4"],
      ["#E17055", "#FDCB6E", "#FAB1A0", "#FF7675", "#FD79A8"],
      
      // 모던한 팔레트
      ["#2D3436", "#636E72", "#B2BEC3", "#DFE6E9", "#FFFFFF"],
      ["#130F40", "#30336B", "#535C68", "#95AFC0", "#C7ECEE"],
      ["#F0F3BD", "#02C39A", "#00A896", "#028090", "#05668D"],
      
      // 대비가 강한 팔레트
      ["#2C3E50", "#E74C3C", "#ECF0F1", "#3498DB", "#2ECC71"],
      ["#1A1A2E", "#16213E", "#0F3460", "#533483", "#E94560"],
      ["#222831", "#393E46", "#00ADB5", "#EEEEEE", "#FFD369"],
      
      // 따뜻한 톤
      ["#FF6B6B", "#FE4A49", "#FED766", "#E6E6EA", "#4ECDC4"],
      ["#F8B195", "#F67280", "#C06C84", "#6C5B7B", "#355C7D"],
      ["#FFE66D", "#FF6B6B", "#FD4E5D", "#5D2E8C", "#2A1A5E"],
      
      // 차가운 톤
      ["#D4E6F1", "#A9CCE3", "#7FB3D5", "#5499C7", "#2980B9"],
      ["#EBF5FB", "#D6EAF8", "#AED6F1", "#85C1E2", "#5DADE2"],
      ["#E8F8F5", "#D1F2EB", "#A3E4D7", "#76D7C4", "#48C9B0"]
    ];
    
    // 현재 시간을 시드로 사용하여 더 랜덤하게
    const now = new Date().getTime();
    const randomIndex = (now + Math.floor(Math.random() * 1000)) % testPalettes.length;
    const randomPalette = testPalettes[randomIndex];
    
    console.log("Generated palette index:", randomIndex, "palette:", randomPalette);
    return json({ success: true, palette: randomPalette });
  }
  
  const themeData = formData.get("theme");
  if (themeData) {
    const theme = JSON.parse(themeData as string) as ThemeConfig;
    await saveThemeConfig(theme);
    return json({ success: true, theme });
  }
  
  return json({ success: false });
}

export default function AdminTheme() {
  const { theme: initialTheme } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const { theme, updateTheme } = useTheme(initialTheme);
  const [localTheme, setLocalTheme] = useState<ThemeConfig>(initialTheme);
  const [showPreview, setShowPreview] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [colorPalette, setColorPalette] = useState<string[]>([]);
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [customFonts, setCustomFonts] = useState<Array<{id: string, name: string, css: string}>>(
    initialTheme.customFonts || []
  );
  const [savedColorPalettes, setSavedColorPalettes] = useState<Array<{id: string, name: string, colors: string[]}>>(
    initialTheme.savedColorPalettes || []
  );
  const [customPresets, setCustomPresets] = useState<Array<{
    id: string;
    name: string;
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    textColor: string;
  }>>(initialTheme.customPresets || []);
  const [newFontCSS, setNewFontCSS] = useState("");
  const fetcher = useFetcher<typeof action>();

  useEffect(() => {
    console.log("Loading theme from server:", initialTheme);
    setLocalTheme(initialTheme);
    if (initialTheme.customFonts) {
      setCustomFonts(initialTheme.customFonts);
    }
    if (initialTheme.savedColorPalettes) {
      setSavedColorPalettes(initialTheme.savedColorPalettes);
    }
    if (initialTheme.customPresets) {
      setCustomPresets(initialTheme.customPresets);
    }
  }, [initialTheme]);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.theme) {
      console.log("Theme saved, updating local state:", fetcher.data.theme);
      setLocalTheme(fetcher.data.theme);
      if (fetcher.data.theme.customFonts) {
        setCustomFonts(fetcher.data.theme.customFonts);
      }
      if (fetcher.data.theme.savedColorPalettes) {
        setSavedColorPalettes(fetcher.data.theme.savedColorPalettes);
      }
      if (fetcher.data.theme.customPresets) {
        setCustomPresets(fetcher.data.theme.customPresets);
      }
    }
  }, [fetcher.data]);

  const handleColorChange = (field: "primaryColor" | "secondaryColor" | "backgroundColor" | "textColor", value: string) => {
    const newTheme = { ...localTheme, [field]: value, preset: "custom" as const };
    setLocalTheme(newTheme);
  };

  const handlePresetChange = (preset: string) => {
    const presetTheme = presetThemes[preset];
    if (presetTheme) {
      const newTheme = { 
        ...localTheme, 
        ...presetTheme, 
        preset: preset as any 
      };
      setLocalTheme(newTheme);
    }
  };

  const handleSave = () => {
    const themeToSave = { ...localTheme, customFonts, savedColorPalettes, customPresets };
    console.log("Saving theme:", themeToSave);
    
    // 직접 fetcher로 저장 (updateTheme은 제거)
    const formData = new FormData();
    formData.append("theme", JSON.stringify(themeToSave));
    fetcher.submit(formData, { method: "post" });
  };

  const generateColorPalette = async () => {
    console.log("Generating color palette...");
    setIsGenerating(true);
    try {
      const formData = new FormData();
      formData.append("intent", "generateColors");
      
      const response = await fetch("/admin/theme", {
        method: "POST",
        body: formData,
      });

      console.log("Client response status:", response.status);
      console.log("Response headers:", response.headers.get("content-type"));
      
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          console.log("Client received data:", data);
          if (data.success && data.palette) {
            setColorPalette(data.palette);
            console.log("Color palette set:", data.palette);
          } else {
            console.error("No palette in response:", data);
            // 폴백으로 테스트 색상 사용
            const testPalette = ["#F8F9F8", "#76BD58", "#4597AE", "#796D54", "#2B2A37"];
            setColorPalette(testPalette);
          }
        } else {
          console.error("Response is not JSON, received HTML");
          const text = await response.text();
          console.log("Response text:", text.substring(0, 200));
          // 폴백으로 테스트 색상 사용
          const testPalette = ["#F8F9F8", "#76BD58", "#4597AE", "#796D54", "#2B2A37"];
          setColorPalette(testPalette);
        }
      } else {
        console.error("Response not ok:", response.status);
        // 폴백으로 테스트 색상 사용
        const testPalette = ["#F8F9F8", "#76BD58", "#4597AE", "#796D54", "#2B2A37"];
        setColorPalette(testPalette);
      }
    } catch (error) {
      console.error("색상 생성 실패:", error);
      // 폴백으로 테스트 색상 사용
      const testPalette = ["#F8F9F8", "#76BD58", "#4597AE", "#796D54", "#2B2A37"];
      setColorPalette(testPalette);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (color: string) => {
    try {
      await navigator.clipboard.writeText(color);
      setCopiedColor(color);
      setTimeout(() => setCopiedColor(null), 2000);
    } catch (error) {
      console.error("복사 실패:", error);
    }
  };

  const addCustomFont = () => {
    if (!newFontCSS.trim()) return;
    
    // @font-face에서 font-family 이름 추출
    const fontFamilyMatch = newFontCSS.match(/font-family:\s*['"]([^'"]+)['"]/);
    if (!fontFamilyMatch) {
      alert("올바른 @font-face CSS를 입력해주세요.");
      return;
    }
    
    const fontName = fontFamilyMatch[1];
    const newFont = {
      id: Date.now().toString(),
      name: fontName,
      css: newFontCSS
    };
    
    const updatedFonts = [...customFonts, newFont];
    setCustomFonts(updatedFonts);
    
    // localTheme도 customFonts를 포함하도록 업데이트하고 즉시 저장
    const updatedTheme = { ...localTheme, customFonts: updatedFonts };
    setLocalTheme(updatedTheme);
    setNewFontCSS("");
    
    console.log("Adding custom font:", newFont);
    console.log("Updated theme with fonts:", updatedTheme);
    
    // 폰트 추가 후 즉시 저장
    const formData = new FormData();
    formData.append("theme", JSON.stringify(updatedTheme));
    fetcher.submit(formData, { method: "post" });
  };

  const deleteCustomFont = (fontId: string) => {
    const updatedFonts = customFonts.filter(font => font.id !== fontId);
    setCustomFonts(updatedFonts);
    
    // 삭제된 폰트가 현재 선택된 폰트인 경우 기본 폰트로 변경
    const updatedTheme = { ...localTheme, customFonts: updatedFonts };
    if (localTheme.fontFamily === `custom-${fontId}`) {
      updatedTheme.fontFamily = "pretendard";
    }
    setLocalTheme(updatedTheme);
    console.log("Deleted custom font:", fontId);
    console.log("Updated theme after deletion:", updatedTheme);
    
    // 폰트 삭제 후 즉시 저장
    const formData = new FormData();
    formData.append("theme", JSON.stringify(updatedTheme));
    fetcher.submit(formData, { method: "post" });
  };

  const saveColorPalette = () => {
    if (colorPalette.length === 0) return;
    
    const paletteName = prompt("색상 팔레트 이름을 입력하세요:");
    if (!paletteName?.trim()) return;
    
    const newPalette = {
      id: Date.now().toString(),
      name: paletteName.trim(),
      colors: [...colorPalette]
    };
    
    const updatedPalettes = [...savedColorPalettes, newPalette];
    setSavedColorPalettes(updatedPalettes);
    
    // 팔레트 저장 후 즉시 저장
    const updatedTheme = { ...localTheme, savedColorPalettes: updatedPalettes };
    setLocalTheme(updatedTheme);
    
    console.log("Adding color palette:", newPalette);
    console.log("Updated theme with palettes:", updatedTheme);
    
    const formData = new FormData();
    formData.append("theme", JSON.stringify(updatedTheme));
    fetcher.submit(formData, { method: "post" });
  };

  const deleteColorPalette = (paletteId: string) => {
    const updatedPalettes = savedColorPalettes.filter(palette => palette.id !== paletteId);
    setSavedColorPalettes(updatedPalettes);
    
    const updatedTheme = { ...localTheme, savedColorPalettes: updatedPalettes };
    setLocalTheme(updatedTheme);
    console.log("Deleted color palette:", paletteId);
    console.log("Updated theme after palette deletion:", updatedTheme);
    
    // 팔레트 삭제 후 즉시 저장
    const formData = new FormData();
    formData.append("theme", JSON.stringify(updatedTheme));
    fetcher.submit(formData, { method: "post" });
  };

  const applyColorPalette = (colors: string[]) => {
    if (colors.length >= 4) {
      const newTheme = {
        ...localTheme,
        backgroundColor: colors[0],
        primaryColor: colors[1],
        secondaryColor: colors[2],
        textColor: colors[3],
        preset: "custom" as const
      };
      setLocalTheme(newTheme);
    }
  };

  const saveCustomPreset = () => {
    const presetName = prompt("사전 설정 테마 이름을 입력하세요:");
    if (!presetName?.trim()) return;
    
    const newPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      primaryColor: localTheme.primaryColor,
      secondaryColor: localTheme.secondaryColor,
      backgroundColor: localTheme.backgroundColor,
      textColor: localTheme.textColor
    };
    
    const updatedPresets = [...customPresets, newPreset];
    setCustomPresets(updatedPresets);
    
    // 프리셋 저장 후 즉시 저장
    const updatedTheme = { ...localTheme, customPresets: updatedPresets };
    
    console.log("Adding custom preset:", newPreset);
    console.log("Updated theme with presets:", updatedTheme);
    
    const formData = new FormData();
    formData.append("theme", JSON.stringify(updatedTheme));
    fetcher.submit(formData, { method: "post" });
  };

  const deleteCustomPreset = (presetId: string) => {
    const updatedPresets = customPresets.filter(preset => preset.id !== presetId);
    setCustomPresets(updatedPresets);
    
    const updatedTheme = { ...localTheme, customPresets: updatedPresets };
    console.log("Deleted custom preset:", presetId);
    console.log("Updated theme after preset deletion:", updatedTheme);
    
    // 프리셋 삭제 후 즉시 저장
    const formData = new FormData();
    formData.append("theme", JSON.stringify(updatedTheme));
    fetcher.submit(formData, { method: "post" });
  };

  const applyCustomPreset = (preset: typeof customPresets[0]) => {
    const newTheme = {
      ...localTheme,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      backgroundColor: preset.backgroundColor,
      textColor: preset.textColor,
      preset: `custom-${preset.id}` as any
    };
    setLocalTheme(newTheme);
  };

  const isLoading = fetcher.state === "submitting" || navigation.state === "submitting";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">테마 설정</h1>
        <p className="mt-2 text-gray-600">사이트의 색상, 폰트, 스타일을 설정하세요.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Settings Panel */}
        <div className="space-y-6">
          {/* Preset Themes */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">사전 설정 테마</h2>
              <button
                type="button"
                onClick={saveCustomPreset}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all"
              >
                현재 테마 저장
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(presetThemes).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => handlePresetChange(key)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    localTheme.preset === key
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div 
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: preset.primaryColor }}
                    />
                    <div 
                      className="w-6 h-6 rounded-full"
                      style={{ backgroundColor: preset.secondaryColor }}
                    />
                  </div>
                  <div className="text-sm font-medium">
                    {key === "salary-man" && "월급루팡"}
                    {key === "modern" && "모던"}
                    {key === "nature" && "네이처"}
                    {key === "rose" && "로즈"}
                  </div>
                </button>
              ))}
              
              {/* 사용자 정의 프리셋 */}
              {customPresets.map((preset) => (
                <div key={preset.id} className="relative">
                  <button
                    onClick={() => applyCustomPreset(preset)}
                    className={`w-full p-4 rounded-lg border-2 transition-all ${
                      localTheme.preset === `custom-${preset.id}`
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div 
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: preset.primaryColor }}
                      />
                      <div 
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: preset.secondaryColor }}
                      />
                    </div>
                    <div className="text-sm font-medium">
                      {preset.name}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCustomPreset(preset.id)}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Color Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">색상 설정</h2>
              <button
                type="button"
                onClick={generateColorPalette}
                disabled={isGenerating}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 transition-all"
              >
                {isGenerating ? "생성 중..." : "AI 색상 추천"}
              </button>
            </div>
            
            {/* AI 색상 팔레트 */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">AI 추천 색상</p>
              {colorPalette.length > 0 ? (
                <div className="grid grid-cols-5 gap-2">
                  {colorPalette.map((color, index) => (
                    <div key={index} className="text-center">
                      <button
                        type="button"
                        onClick={() => {
                          console.log(`Applying color ${color} to position ${index}`);
                          if (index === 0) handleColorChange("backgroundColor", color);
                          else if (index === 1) handleColorChange("primaryColor", color);
                          else if (index === 2) handleColorChange("secondaryColor", color);
                          else if (index === 3) handleColorChange("textColor", color);
                          else if (index === 4) handleColorChange("primaryColor", color);
                        }}
                        className="w-full h-12 rounded-md shadow-sm hover:shadow-md transition-all mb-1"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-mono text-gray-600">{color}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <p className="text-gray-500 text-sm">AI 색상 추천 버튼을 클릭하여 색상을 생성하세요.</p>
                </div>
              )}
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-500">
                  색상을 클릭하면 해당 위치에 적용됩니다.
                </p>
                {colorPalette.length > 0 && (
                  <button
                    type="button"
                    onClick={saveColorPalette}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all"
                  >
                    팔레트 저장
                  </button>
                )}
              </div>
            </div>
            
            {/* 저장된 색상 팔레트 */}
            {savedColorPalettes.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 mb-3">저장된 색상 팔레트</p>
                <div className="space-y-3">
                  {savedColorPalettes.map((palette) => (
                    <div key={palette.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">{palette.name}</span>
                        <div className="flex gap-1">
                          {palette.colors.map((color, index) => (
                            <div
                              key={index}
                              className="w-6 h-6 rounded-full border border-gray-300"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => applyColorPalette(palette.colors)}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 transition-all"
                        >
                          적용
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteColorPalette(palette.id)}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 transition-all"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  주 색상 (Primary)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={localTheme.primaryColor}
                    onChange={(e) => handleColorChange("primaryColor", e.target.value)}
                    className="h-10 w-20"
                  />
                  <input
                    type="text"
                    value={localTheme.primaryColor}
                    onChange={(e) => handleColorChange("primaryColor", e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  보조 색상 (Secondary)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={localTheme.secondaryColor}
                    onChange={(e) => handleColorChange("secondaryColor", e.target.value)}
                    className="h-10 w-20"
                  />
                  <input
                    type="text"
                    value={localTheme.secondaryColor}
                    onChange={(e) => handleColorChange("secondaryColor", e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  배경 색상
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={localTheme.backgroundColor}
                    onChange={(e) => handleColorChange("backgroundColor", e.target.value)}
                    className="h-10 w-20"
                  />
                  <input
                    type="text"
                    value={localTheme.backgroundColor}
                    onChange={(e) => handleColorChange("backgroundColor", e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  텍스트 색상
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={localTheme.textColor}
                    onChange={(e) => handleColorChange("textColor", e.target.value)}
                    className="h-10 w-20"
                  />
                  <input
                    type="text"
                    value={localTheme.textColor}
                    onChange={(e) => handleColorChange("textColor", e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Font Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">폰트 설정</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                폰트 선택
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLocalTheme({ ...localTheme, fontFamily: "pretendard" })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    localTheme.fontFamily === "pretendard"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div 
                    className="font-semibold mb-1"
                    style={{ fontFamily: "'Pretendard', sans-serif" }}
                  >
                    Pretendard
                  </div>
                  <div 
                    className="text-sm text-gray-600"
                    style={{ fontFamily: "'Pretendard', sans-serif" }}
                  >
                    가나다라 ABC 123
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setLocalTheme({ ...localTheme, fontFamily: "noto-sans-kr" })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    localTheme.fontFamily === "noto-sans-kr"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div 
                    className="font-semibold mb-1"
                    style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
                  >
                    Noto Sans KR
                  </div>
                  <div 
                    className="text-sm text-gray-600"
                    style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
                  >
                    가나다라 ABC 123
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setLocalTheme({ ...localTheme, fontFamily: "malgun-gothic" })}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    localTheme.fontFamily === "malgun-gothic"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div 
                    className="font-semibold mb-1"
                    style={{ fontFamily: "'Malgun Gothic', sans-serif" }}
                  >
                    맑은 고딕
                  </div>
                  <div 
                    className="text-sm text-gray-600"
                    style={{ fontFamily: "'Malgun Gothic', sans-serif" }}
                  >
                    가나다라 ABC 123
                  </div>
                </button>

                {/* 저장된 커스텀 폰트들 */}
                {customFonts.map((font) => (
                  <div key={font.id} className="relative">
                    <style dangerouslySetInnerHTML={{ __html: font.css }} />
                    <button
                      type="button"
                      onClick={() => setLocalTheme({ ...localTheme, fontFamily: `custom-${font.id}` })}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                        localTheme.fontFamily === `custom-${font.id}`
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div 
                        className="font-semibold mb-1"
                        style={{ fontFamily: `'${font.name}', sans-serif` }}
                      >
                        {font.name}
                      </div>
                      <div 
                        className="text-sm text-gray-600"
                        style={{ fontFamily: `'${font.name}', sans-serif` }}
                      >
                        가나다라 ABC 123
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCustomFont(font.id)}
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 커스텀 폰트 추가 섹션 */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">커스텀 폰트 추가</h3>
              <div className="space-y-3">
                <textarea
                  value={newFontCSS}
                  onChange={(e) => setNewFontCSS(e.target.value)}
                  placeholder="@font-face {&#10;    font-family: 'SUIT-Regular';&#10;    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_suit@1.0/SUIT-Regular.woff2') format('woff2');&#10;    font-weight: normal;&#10;    font-style: normal;&#10;}"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
                  rows={6}
                />
                <p className="text-xs text-gray-500">
                  눈누 폰트 페이지에서 제공하는 @font-face CSS 코드를 붙여넣으세요.
                </p>
                
                {newFontCSS && (() => {
                  const match = newFontCSS.match(/font-family:\s*['"]([^'"]+)['"]/);
                  if (match) {
                    return (
                      <div className="p-3 bg-gray-50 rounded-md">
                        <style dangerouslySetInnerHTML={{ __html: newFontCSS }} />
                        <p className="text-sm font-medium text-gray-700 mb-1">미리보기:</p>
                        <p 
                          className="text-lg"
                          style={{ fontFamily: `'${match[1]}', sans-serif` }}
                        >
                          가나다라마바사 ABCDEFG 1234567890
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                <button
                  type="button"
                  onClick={addCustomFont}
                  disabled={!newFontCSS.trim()}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  폰트 추가
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                폰트 크기
              </label>
              <select
                value={localTheme.fontSize}
                onChange={(e) => setLocalTheme({ ...localTheme, fontSize: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="small">작게</option>
                <option value="medium">보통</option>
                <option value="large">크게</option>
              </select>
            </div>
          </div>


          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              {showPreview ? "미리보기 숨기기" : "미리보기 보기"}
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? "저장 중..." : "저장"}
            </button>
          </div>
          
          {/* 저장 완료 메시지 */}
          {fetcher.data?.success && (
            <div className="mt-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              테마가 성공적으로 저장되었습니다!
            </div>
          )}
          
          {/* 오류 메시지 */}
          {fetcher.data?.success === false && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              테마 저장에 실패했습니다: {fetcher.data.error || "알 수 없는 오류"}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <div className="lg:sticky lg:top-4">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">미리보기</h2>
              
              {/* Custom fonts CSS */}
              {customFonts.map((font) => (
                <style key={font.id} dangerouslySetInnerHTML={{ __html: font.css }} />
              ))}
              
              <div 
                className="border border-gray-200 rounded-lg p-6"
                style={{
                  backgroundColor: localTheme.backgroundColor,
                  color: localTheme.textColor,
                  fontFamily: (() => {
                    if (localTheme.fontFamily === "pretendard") return "'Pretendard', sans-serif";
                    if (localTheme.fontFamily === "noto-sans-kr") return "'Noto Sans KR', sans-serif";
                    if (localTheme.fontFamily === "malgun-gothic") return "'Malgun Gothic', sans-serif";
                    if (localTheme.fontFamily.startsWith("custom-")) {
                      const fontId = localTheme.fontFamily.replace("custom-", "");
                      const font = customFonts.find(f => f.id === fontId);
                      return font ? `'${font.name}', sans-serif` : "'Pretendard', sans-serif";
                    }
                    return "'Pretendard', sans-serif";
                  })(),
                  fontSize: localTheme.fontSize === "small" ? "14px" : 
                           localTheme.fontSize === "large" ? "18px" : "16px"
                }}
              >
                <h1 
                  className="text-3xl font-bold mb-4"
                  style={{ color: localTheme.primaryColor }}
                >
                  제목 텍스트
                </h1>
                
                <h2 
                  className="text-2xl font-semibold mb-3"
                  style={{ color: localTheme.secondaryColor }}
                >
                  부제목 텍스트
                </h2>
                
                <p className="mb-4">
                  이것은 본문 텍스트입니다. 선택한 폰트와 크기가 적용되어 표시됩니다.
                  테마 설정을 변경하면 실시간으로 미리보기에 반영됩니다.
                </p>
                
                <div className="flex gap-3 mb-4">
                  <button
                    className="px-4 py-2 rounded-md text-white"
                    style={{ backgroundColor: localTheme.primaryColor }}
                  >
                    주 버튼
                  </button>
                  <button
                    className="px-4 py-2 rounded-md text-white"
                    style={{ backgroundColor: localTheme.secondaryColor }}
                  >
                    보조 버튼
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    className="p-4 rounded-lg"
                    style={{ 
                      backgroundColor: "#F3F4F6",
                      borderLeft: `4px solid ${localTheme.primaryColor}`
                    }}
                  >
                    <h3 className="font-semibold mb-2">카드 제목</h3>
                    <p className="text-sm opacity-80">카드 내용이 여기에 표시됩니다.</p>
                  </div>
                  
                  <div 
                    className="p-4 rounded-lg"
                    style={{ 
                      backgroundColor: "#F3F4F6",
                      borderLeft: `4px solid ${localTheme.secondaryColor}`
                    }}
                  >
                    <h3 className="font-semibold mb-2">카드 제목</h3>
                    <p className="text-sm opacity-80">카드 내용이 여기에 표시됩니다.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}