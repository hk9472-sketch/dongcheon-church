"use client";

import { useEffect, useMemo, useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";

interface TextStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
}

interface Props {
  /** "admin" 모드: text + subtext + 각 스타일 사용 / "legacy": legacyHtml 그대로 */
  mode: "admin" | "legacy";
  text?: string;
  subtext?: string;
  textStyle?: TextStyle;
  subtextStyle?: TextStyle;
  legacyHtml?: string;
  /** 단어 회전 간격(초). 0 이면 고정 표시 */
  intervalSec: number;
  /** 글씨 색상. 빈 문자열이면 기본 색상 */
  color?: string;
  className?: string;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(p|div|h[1-6])[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function tsToCss(s?: TextStyle): React.CSSProperties {
  if (!s) return {};
  return {
    fontFamily: s.fontFamily || undefined,
    fontSize: s.fontSize || undefined,
    fontWeight: (s.fontWeight as React.CSSProperties["fontWeight"]) || undefined,
    fontStyle: (s.fontStyle as React.CSSProperties["fontStyle"]) || undefined,
  };
}

export default function MottoBanner({
  mode,
  text,
  subtext,
  textStyle,
  subtextStyle,
  legacyHtml,
  intervalSec,
  color,
  className,
}: Props) {
  const isLegacy = mode === "legacy";
  const sanitized = useMemo(
    () => (legacyHtml ? sanitizeHtml(legacyHtml) : ""),
    [legacyHtml],
  );

  // 단어 분리 — 메인 + 보조 합쳐 회전. 보조는 항상 마지막 위치에 보조 스타일로.
  const mainText = (text || (legacyHtml ? htmlToPlainText(legacyHtml) : "")).trim();
  const subText = (subtext || "").trim();
  const mainWords = useMemo(
    () => mainText.split(/\s+/).filter(Boolean),
    [mainText],
  );

  // 짧은 문장 판정
  const isShort = mainWords.length <= 3 || mainText.length < 15;

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (intervalSec <= 0 || isShort) return;
    if (mainWords.length <= 1) return;
    const timer = setInterval(
      () => setIdx((i) => (i + 1) % (mainWords.length + (subText ? 1 : 0))),
      Math.max(0.3, intervalSec) * 1000,
    );
    return () => clearInterval(timer);
  }, [intervalSec, isShort, mainWords.length, subText]);

  const containerStyle: React.CSSProperties = color ? { color } : {};
  const mainCss = tsToCss(textStyle);
  const subCss = tsToCss(subtextStyle);

  // 1. legacy 고정 모드 — HTML 그대로
  if (isLegacy && intervalSec <= 0) {
    return (
      <div
        className={className}
        style={containerStyle}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  // 2. admin 고정 모드 — text + subtext, 줄바꿈 보존
  if (intervalSec <= 0) {
    return (
      <div className={className} style={containerStyle}>
        <span style={mainCss} className="whitespace-pre-line">
          {mainText}
        </span>
        {subText && (
          <span style={subCss} className="ml-2 align-middle">
            {subText}
          </span>
        )}
      </div>
    );
  }

  // 3. 짧은 문장 — 한 줄 큰 폰트 (배너 모드 켜져 있어도 회전 안 함)
  if (isShort) {
    const enlargedMain: React.CSSProperties = {
      ...mainCss,
      fontSize: mainCss.fontSize || "1.5rem",
      fontWeight: mainCss.fontWeight || "bold",
    };
    return (
      <div className={className} style={containerStyle}>
        <span className="whitespace-nowrap" style={enlargedMain}>
          {mainText}
        </span>
        {subText && (
          <span style={subCss} className="ml-2 align-middle">
            {subText}
          </span>
        )}
      </div>
    );
  }

  // 4. 단어 회전 모드
  // idx 가 mainWords.length 면 subtext 차례
  const isSubturn = subText && idx >= mainWords.length;
  const display = isSubturn ? subText : mainWords[idx % mainWords.length];
  const cssForCurrent: React.CSSProperties = {
    ...(isSubturn ? subCss : mainCss),
    fontSize: (isSubturn ? subCss.fontSize : mainCss.fontSize) || "1.6rem",
    fontWeight: (isSubturn ? subCss.fontWeight : mainCss.fontWeight) || "bold",
  };

  return (
    <div className={className} style={containerStyle}>
      <span
        key={idx}
        className="inline-block tracking-tight motto-word-fade"
        style={cssForCurrent}
      >
        {display}
      </span>
      <style jsx>{`
        .motto-word-fade {
          animation: mottoFade ${Math.max(0.3, intervalSec)}s ease-in-out;
        }
        @keyframes mottoFade {
          0% { opacity: 0; transform: translateY(6px); }
          25% { opacity: 1; transform: translateY(0); }
          75% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0.6; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}
