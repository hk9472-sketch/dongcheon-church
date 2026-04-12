"use client";

import { createContext, useContext } from "react";
import type { SkinConfig } from "@/lib/skins";

// ============================================================
// 스킨 컨텍스트 + CSS 변수 주입
// 게시판 페이지를 감싸서 스킨별 스타일을 동적 적용
// ============================================================

interface SkinContextType {
  skin: SkinConfig | null;
  skinId: string;
}

const SkinContext = createContext<SkinContextType>({ skin: null, skinId: "" });

export function useSkin() {
  return useContext(SkinContext);
}

interface SkinProviderProps {
  skin: SkinConfig | null;
  children: React.ReactNode;
}

export default function SkinProvider({ skin, children }: SkinProviderProps) {
  // 스킨이 없으면 기본 Tailwind 스타일 사용
  if (!skin) {
    return (
      <SkinContext.Provider value={{ skin: null, skinId: "" }}>
        {children}
      </SkinContext.Provider>
    );
  }

  // CSS 커스텀 속성으로 스킨 색상 주입
  const cssVars: Record<string, string> = {
    "--skin-primary": skin.styles.primaryColor,
    "--skin-bg": skin.styles.bgColor,
    "--skin-text": skin.styles.textColor,
    "--skin-header-bg": skin.styles.headerBg,
    "--skin-border": skin.styles.borderColor,
    "--skin-accent": skin.styles.accentColor,
    "--skin-font": skin.styles.fontFamily,
    "--skin-radius": skin.styles.borderRadius,
  };

  return (
    <SkinContext.Provider value={{ skin, skinId: skin.id }}>
      <div style={cssVars as React.CSSProperties} className="skin-wrapper">
        {children}
      </div>
    </SkinContext.Provider>
  );
}
