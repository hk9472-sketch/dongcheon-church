"use client";

import { useState, useEffect, useRef } from "react";

interface ReadingItem {
  id: number;
  title: string;
  audioPath: string | null;
  sortOrder: number;
  createdAt: string;
  createdBy: string | null;
}

interface ReadingDetail {
  id: number;
  title: string;
  content: string;
  audioPath: string | null;
  timestamps: string | null; // JSON: [{start, end, text}]
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
}

interface Segment {
  start: number;
  end: number;
  text: string;
}

// 화면 줄 정보 (타임스탬프 매핑 포함)
interface VisualLine {
  text: string;
  startTime?: number;
  endTime?: number;
}

export default function ReadingPage() {
  const [readings, setReadings] = useState<ReadingItem[]>([]);
  const [selected, setSelected] = useState<ReadingDetail | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // 오디오 상태
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [lineSync, setLineSync] = useState(true);

  // 사용자 클릭 재동기화: 클릭 시점의 시간 오프셋
  const userTimeOffsetRef = useRef<number>(0);

  // 표시 설정 (프로젝터용)
  const [fontSize, setFontSize] = useState(16);
  const [boxWidth, setBoxWidth] = useState(100);
  const [boxHeight, setBoxHeight] = useState(70);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [continuous, setContinuous] = useState(false); // 이어쓰기 (책 모드)
  const [inlineEdit, setInlineEdit] = useState(false); // 인라인 편집 모드
  const [editingContent, setEditingContent] = useState(""); // 편집 중인 텍스트
  const [inlineSaving, setInlineSaving] = useState(false);

  // 화면 표시 줄 (렌더링 기준 줄바꿈 + 타임스탬프)
  const [visualLines, setVisualLines] = useState<VisualLine[]>([]);
  const textBoxRef = useRef<HTMLDivElement>(null);

  // 줄-시간 매핑 (재독듣기 자동 싱크용). lineIndex = lines (content.split('\n')) 의 인덱스.
  const [lineTimes, setLineTimes] = useState<
    { lineIndex: number; startSec: number; manuallyAdjusted: boolean }[]
  >([]);
  const [lineEditMode, setLineEditMode] = useState(false);
  const [editLineIndex, setEditLineIndex] = useState<number>(0);
  const [lineEditMsg, setLineEditMsg] = useState<string | null>(null);

  // 관리자 상태
  const [isAdmin, setIsAdmin] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editAudioPath, setEditAudioPath] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 음성→텍스트 변환 상태
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeModel, setTranscribeModel] = useState<"base" | "small">("base");

  // 텍스트 교정 에디터 상태
  const [showCorrector, setShowCorrector] = useState(false);
  const [corrSegments, setCorrSegments] = useState<string[]>([]);
  const [corrSaving, setCorrSaving] = useState(false);

  // 목록 로드
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.isAdmin <= 2) setIsAdmin(true);
      })
      .catch(() => {});
    loadReadings();
  }, []);

  const loadReadings = () => {
    setLoading(true);
    fetch("/api/council/reading")
      .then((r) => r.json())
      .then((d) => setReadings(d.readings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // 상세 로드
  const loadDetail = (id: number) => {
    setDetailLoading(true);
    setAudioError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setActiveLine(null);
    userTimeOffsetRef.current = 0;

    fetch(`/api/council/reading/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.reading) {
          setSelected(d.reading);
          const textLines = (d.reading.content as string)
            .split("\n")
            .filter((l: string) => l.trim() !== "");
          setLines(textLines);

          // 타임스탬프 파싱
          if (d.reading.timestamps) {
            try {
              setSegments(JSON.parse(d.reading.timestamps));
            } catch {
              setSegments([]);
            }
          } else {
            setSegments([]);
          }
        }
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));

    // 줄-시간 매핑 동시 로드
    fetch(`/api/council/reading/${id}/line-times`)
      .then((r) => r.json())
      .then((d) => setLineTimes(d.times || []))
      .catch(() => setLineTimes([]));
  };

  const audioSrc = selected?.audioPath
    ? `/api/council/reading/audio/${selected.id}`
    : "";

  const hasTimestamps = segments.length > 0;

  // ===== 화면 표시 줄 계산 =====
  useEffect(() => {
    if (lines.length === 0) {
      setVisualLines([]);
      return;
    }

    const rafId = requestAnimationFrame(() => {
      const container = textBoxRef.current;
      if (!container) {
        setVisualLines(lines.map((t) => ({ text: t })));
        return;
      }

      const cs = getComputedStyle(container);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const availW = container.clientWidth - padL - padR - 24;
      if (availW <= 0) {
        setVisualLines(lines.map((t) => ({ text: t })));
        return;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      ctx.font = `${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;

      // 텍스트를 화면 폭에 맞춰 분할하는 유틸
      const splitToFit = (text: string): string[] => {
        const vLines: string[] = [];
        let remaining = text;
        while (remaining.length > 0) {
          if (ctx.measureText(remaining).width <= availW) {
            vLines.push(remaining);
            break;
          }
          let lo = 1, hi = remaining.length - 1, fit = 1;
          while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (ctx.measureText(remaining.substring(0, mid)).width <= availW) {
              fit = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          vLines.push(remaining.substring(0, fit));
          remaining = remaining.substring(fit);
        }
        return vLines;
      };

      const result: VisualLine[] = [];

      if (hasTimestamps) {
        if (continuous) {
          // === 이어쓰기 모드: 세그먼트를 이어붙인 후 화면 줄로 분할 ===
          // 글자 위치 → 시간 매핑 테이블
          const joined = segments.map((s) => s.text).join(" ");
          const charTimes: { start: number; end: number }[] = [];
          for (let si = 0; si < segments.length; si++) {
            const seg = segments[si];
            const segLen = seg.text.length;
            const segDur = seg.end - seg.start;
            for (let c = 0; c < segLen; c++) {
              charTimes.push({
                start: seg.start + (segDur * c) / Math.max(segLen, 1),
                end: seg.start + (segDur * (c + 1)) / Math.max(segLen, 1),
              });
            }
            // 구분 공백
            if (si < segments.length - 1) {
              charTimes.push({ start: seg.end, end: seg.end });
            }
          }

          const vLines = splitToFit(joined);
          let charIdx = 0;
          for (const vl of vLines) {
            const startIdx = charIdx;
            const endIdx = charIdx + vl.length - 1;
            result.push({
              text: vl,
              startTime: charTimes[startIdx]?.start ?? 0,
              endTime: charTimes[Math.min(endIdx, charTimes.length - 1)]?.end ?? 0,
            });
            charIdx += vl.length;
          }
        } else {
          // === 구간별 줄바꿈 모드 ===
          for (const seg of segments) {
            const segDur = seg.end - seg.start;
            const segLen = seg.text.length;
            const vLines = splitToFit(seg.text);
            let charConsumed = 0;
            for (const vl of vLines) {
              const r0 = segLen > 0 ? charConsumed / segLen : 0;
              const r1 = segLen > 0 ? (charConsumed + vl.length) / segLen : 1;
              result.push({
                text: vl,
                startTime: seg.start + segDur * r0,
                endTime: seg.start + segDur * r1,
              });
              charConsumed += vl.length;
            }
          }
        }
      } else {
        // 타임스탬프 없음
        const source = continuous ? [lines.join(" ")] : lines;
        for (const line of source) {
          for (const vl of splitToFit(line)) {
            result.push({ text: vl });
          }
        }
      }

      setVisualLines(result);
    });

    return () => cancelAnimationFrame(rafId);
  }, [lines, segments, hasTimestamps, fontSize, boxWidth, continuous]);

  // ===== 오디오 이벤트 =====
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);

    if (!lineSync || visualLines.length === 0 || duration <= 0) return;

    const adjustedTime = t - userTimeOffsetRef.current;

    // 1순위: 저장된 lineTimes 가 있으면 정확 매칭 (raw line 기준).
    // visualLines 와 raw lines 가 1:1 인 경우(텍스트 wrap 없음) activeLine = activeRawLine.
    // wrap 된 경우엔 raw line 의 text 와 visualLines 텍스트 prefix 매칭으로 첫 visual line 찾음.
    if (lineTimes.length > 0) {
      let activeRaw = lineTimes[0].lineIndex;
      for (const lt of lineTimes) {
        if (lt.startSec <= adjustedTime) activeRaw = lt.lineIndex;
        else break;
      }
      // raw → visual 매핑
      const rawText = lines[activeRaw];
      if (rawText !== undefined) {
        // 단순 케이스: visualLines 와 lines 길이가 같으면 동일 인덱스
        if (visualLines.length === lines.length) {
          setActiveLine(activeRaw);
          return;
        }
        // wrap 된 경우: 첫 매칭 visual line
        const idx = visualLines.findIndex((vl) =>
          rawText.startsWith(vl.text) || vl.text.startsWith(rawText.substring(0, 10))
        );
        if (idx >= 0) {
          setActiveLine(idx);
          return;
        }
      }
    }

    if (hasTimestamps && visualLines[0]?.startTime !== undefined) {
      // 타임스탬프 기반 동기화: 정확한 시간 매칭
      let found = 0;
      for (let i = 0; i < visualLines.length; i++) {
        const vl = visualLines[i];
        if (vl.startTime !== undefined && vl.endTime !== undefined) {
          if (adjustedTime >= vl.startTime && adjustedTime < vl.endTime) {
            found = i;
            break;
          }
          if (adjustedTime >= vl.startTime) {
            found = i;
          }
        }
      }
      setActiveLine(found);
    } else {
      // 글자수 비율 기반 (폴백)
      const lengths = visualLines.map((vl) => vl.text.length);
      const totalLen = lengths.reduce((a, b) => a + b, 0);
      if (totalLen === 0) return;

      const ratio = adjustedTime / duration;
      let cumLen = 0;
      let found = 0;
      for (let i = 0; i < visualLines.length; i++) {
        cumLen += lengths[i];
        if (cumLen / totalLen >= ratio) {
          found = i;
          break;
        }
      }
      setActiveLine(found);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      audioRef.current.playbackRate = playbackRate;
      setAudioError(false);
    }
  };

  const handlePlay = () => {
    if (!audioRef.current) return;
    audioRef.current.play().catch(() => setAudioError(true));
  };

  const handlePause = () => {
    audioRef.current?.pause();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const formatTime = (sec: number) => {
    if (!isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ===== 줄-시간 매핑 편집 (관리자만) =====
  const seekToLineTime = (sec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = sec;
      setCurrentTime(sec);
    }
  };

  const saveLineTime = async () => {
    if (!selected) return;
    setLineEditMsg(null);
    try {
      const res = await fetch(`/api/council/reading/${selected.id}/line-times`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineIndex: editLineIndex,
          startSec: currentTime,
          manual: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "저장 실패");
      const tres = await fetch(`/api/council/reading/${selected.id}/line-times`);
      const td = await tres.json();
      setLineTimes(td.times || []);
      setLineEditMsg(`${editLineIndex + 1}번 줄 시작 시간 ${formatTime(currentTime)} 저장됨`);
    } catch (e) {
      setLineEditMsg(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const deleteLineTime = async (lineIndex: number) => {
    if (!selected) return;
    setLineEditMsg(null);
    try {
      const res = await fetch(
        `/api/council/reading/${selected.id}/line-times?lineIndex=${lineIndex}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "삭제 실패");
      }
      setLineTimes((prev) => prev.filter((lt) => lt.lineIndex !== lineIndex));
      setLineEditMsg(`${lineIndex + 1}번 줄 시간 삭제됨`);
    } catch (e) {
      setLineEditMsg(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const autoDistributeLineTimes = async () => {
    if (!selected || lines.length === 0 || !duration || duration <= 0) {
      setLineEditMsg("오디오가 로드되지 않았거나 줄 데이터가 없습니다.");
      return;
    }
    if (
      !confirm(
        `이 본문의 ${lines.length}개 줄을 글자 수 비율로 자동 분할해 저장합니다.\n` +
          `(이미 저장된 시간이 있다면 덮어씁니다.)\n진행할까요?`
      )
    )
      return;

    const lengths = lines.map((l) => l.length);
    const totalLen = lengths.reduce((a, b) => a + b, 0);
    if (totalLen === 0) {
      setLineEditMsg("줄 본문이 비어 있습니다.");
      return;
    }

    let cumLen = 0;
    const payloads: { lineIndex: number; startSec: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const startSec = (cumLen / totalLen) * duration;
      payloads.push({ lineIndex: i, startSec });
      cumLen += lengths[i];
    }

    setLineEditMsg(`자동 분할 저장 중... 0 / ${payloads.length}`);
    let done = 0;
    let failed = 0;
    await Promise.all(
      payloads.map(async (p) => {
        try {
          const res = await fetch(`/api/council/reading/${selected.id}/line-times`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...p, manual: false }),
          });
          if (!res.ok) failed++;
        } catch {
          failed++;
        }
        done++;
        setLineEditMsg(`자동 분할 저장 중... ${done} / ${payloads.length}`);
      })
    );

    const tres = await fetch(`/api/council/reading/${selected.id}/line-times`);
    const td = await tres.json();
    setLineTimes(td.times || []);
    setLineEditMsg(
      failed > 0
        ? `저장 완료: 성공 ${done - failed} / 실패 ${failed}`
        : `자동 분할 저장 완료 (${done}건). 진행바로 줄별 미세 조정 가능.`
    );
  };

  const clearAllLineTimes = async () => {
    if (!selected) return;
    if (!confirm(`이 본문의 모든 줄-시간 매핑(${lineTimes.length}건) 을 삭제할까요?`))
      return;
    const res = await fetch(
      `/api/council/reading/${selected.id}/line-times?lineIndex=all`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setLineTimes([]);
      setLineEditMsg("이 본문 전체 매핑 삭제됨");
    }
  };

  // 줄 클릭 → 음성은 유지, 동기화 기준점만 재설정
  const handleLineClick = (vLineIndex: number) => {
    if (!audioRef.current || duration <= 0) return;

    const t = audioRef.current.currentTime;
    const vl = visualLines[vLineIndex];

    if (hasTimestamps && vl?.startTime !== undefined) {
      // 타임스탬프 기반: 현재 시간과 이 줄의 시작 시간 차이를 오프셋으로
      userTimeOffsetRef.current = t - vl.startTime;
    } else {
      // 글자수 비율 기반: 이 줄의 비율 위치를 현재 시간에 매핑
      const lengths = visualLines.map((v) => v.text.length);
      const totalLen = lengths.reduce((a, b) => a + b, 0);
      let cumLen = 0;
      for (let i = 0; i < vLineIndex; i++) cumLen += lengths[i];
      const lineRatio = totalLen > 0 ? cumLen / totalLen : 0;
      userTimeOffsetRef.current = t - lineRatio * duration;
    }

    setActiveLine(vLineIndex);
  };

  // ===== 관리자 기능 =====
  const openEditor = (reading?: ReadingDetail) => {
    if (reading) {
      setEditId(reading.id);
      setEditTitle(reading.title);
      setEditContent(reading.content);
      setEditAudioPath(reading.audioPath || "");
      setEditSortOrder(reading.sortOrder);
    } else {
      setEditId(null);
      setEditTitle("");
      setEditContent("");
      setEditAudioPath("");
      setEditSortOrder(0);
    }
    setShowEditor(true);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/council/reading/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.audioPath) {
        setEditAudioPath(data.audioPath);
      } else {
        alert(data.error || "업로드 실패");
      }
    } catch {
      alert("업로드 중 오류 발생");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      alert("제목과 내용을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      const url = editId ? `/api/council/reading/${editId}` : "/api/council/reading";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          audioPath: editAudioPath || null,
          sortOrder: editSortOrder,
        }),
      });
      const data = await res.json();
      if (data.reading) {
        setShowEditor(false);
        loadReadings();
        if (editId && selected?.id === editId) {
          loadDetail(editId);
        }
      } else {
        alert(data.error || "저장 실패");
      }
    } catch {
      alert("저장 중 오류 발생");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await fetch(`/api/council/reading/${id}`, { method: "DELETE" });
      loadReadings();
      if (selected?.id === id) {
        setSelected(null);
        setLines([]);
        setSegments([]);
      }
    } catch {
      alert("삭제 중 오류 발생");
    }
  };

  // 음성→텍스트 변환 (Whisper)
  const handleTranscribe = async () => {
    if (!editId || !editAudioPath) {
      alert("먼저 글을 저장하고 음성 파일을 업로드하세요");
      return;
    }
    if (!confirm(`${transcribeModel.toUpperCase()} 모델로 음성→텍스트 변환을 시작합니다.\n시간이 걸릴 수 있습니다. 계속하시겠습니까?`)) {
      return;
    }
    setTranscribing(true);
    try {
      const res = await fetch("/api/council/reading/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingId: editId, model: transcribeModel }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`변환 완료! ${data.segmentCount}개 구간 인식`);
        setEditContent(data.content);
        // 에디터 닫고 새로고침
        setShowEditor(false);
        loadReadings();
        loadDetail(editId);
      } else {
        alert(data.error || "변환 실패");
      }
    } catch {
      alert("변환 중 오류 발생");
    } finally {
      setTranscribing(false);
    }
  };

  // 인라인 편집: 열기
  const openInlineEdit = () => {
    if (!selected) return;
    // 현재 표시 중인 텍스트를 편집용으로
    setEditingContent(selected.content);
    setInlineEdit(true);
  };

  // 인라인 편집: 저장
  // - 줄 수 변경 → 글자수 비율로 타임스탬프 재생성 (1단계: 줄 구조 조정)
  // - 줄 수 유지 → 기존 시간 보존, 텍스트만 교체 (2단계: 원문 교체)
  const saveInlineEdit = async () => {
    if (!selected) return;
    setInlineSaving(true);
    try {
      const newLines = editingContent.split("\n").filter((l) => l.trim() !== "");
      const body: Record<string, unknown> = { content: editingContent };

      const sameLineCount = segments.length > 0 && newLines.length === segments.length;

      if (sameLineCount) {
        // 줄 수 동일 → 시간 유지, 텍스트만 교체
        const newSegments = segments.map((seg, i) => ({
          start: seg.start,
          end: seg.end,
          text: newLines[i],
        }));
        body.timestamps = JSON.stringify(newSegments);
      } else {
        // 줄 수 변경 → 글자수 비율로 타임스탬프 재생성
        let totalStart = 0;
        let totalEnd = duration;
        if (segments.length > 0) {
          totalStart = segments[0].start;
          totalEnd = segments[segments.length - 1].end;
        }
        const totalDur = totalEnd - totalStart;

        if (totalDur > 0 && newLines.length > 0) {
          const lengths = newLines.map((l) => l.length);
          const totalLen = lengths.reduce((a, b) => a + b, 0);
          const newSegments: { start: number; end: number; text: string }[] = [];
          let t = totalStart;

          for (let i = 0; i < newLines.length; i++) {
            const ratio = totalLen > 0 ? lengths[i] / totalLen : 1 / newLines.length;
            const segDur = totalDur * ratio;
            newSegments.push({
              start: Math.round(t * 100) / 100,
              end: Math.round((t + segDur) * 100) / 100,
              text: newLines[i],
            });
            t += segDur;
          }
          body.timestamps = JSON.stringify(newSegments);
        }
      }

      const res = await fetch(`/api/council/reading/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.reading) {
        setInlineEdit(false);
        loadDetail(selected.id);
      } else {
        alert(data.error || "저장 실패");
      }
    } catch {
      alert("저장 중 오류 발생");
    } finally {
      setInlineSaving(false);
    }
  };

  // 교정 에디터: 좌우 스크롤 동기화
  const corrLeftRef = useRef<HTMLDivElement>(null);
  const corrRightRef = useRef<HTMLDivElement>(null);
  const corrSyncingRef = useRef(false);

  const handleCorrScroll = (source: "left" | "right") => {
    if (corrSyncingRef.current) return;
    corrSyncingRef.current = true;
    const src = source === "left" ? corrLeftRef.current : corrRightRef.current;
    const dst = source === "left" ? corrRightRef.current : corrLeftRef.current;
    if (src && dst) {
      const ratio = src.scrollTop / (src.scrollHeight - src.clientHeight || 1);
      dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight || 1);
    }
    requestAnimationFrame(() => { corrSyncingRef.current = false; });
  };

  // 교정 에디터 열기
  const openCorrector = () => {
    if (!selected || segments.length === 0) return;
    setCorrSegments(segments.map((s) => s.text));
    setShowCorrector(true);
  };

  // 교정 저장
  const saveCorrection = async () => {
    if (!selected) return;
    setCorrSaving(true);
    try {
      const newTimestamps = segments.map((seg, i) => ({
        start: seg.start,
        end: seg.end,
        text: (corrSegments[i] || seg.text).trim(),
      }));
      const newContent = newTimestamps.map((s) => s.text).join("\n");
      const res = await fetch(`/api/council/reading/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent,
          timestamps: JSON.stringify(newTimestamps),
        }),
      });
      const data = await res.json();
      if (data.reading) {
        setShowCorrector(false);
        loadDetail(selected.id);
      } else {
        alert(data.error || "저장 실패");
      }
    } catch {
      alert("저장 중 오류 발생");
    } finally {
      setCorrSaving(false);
    }
  };

  // 구간별 배경색 (교번)
  const segColors = [
    { bg: "bg-blue-50", border: "border-blue-200", ring: "ring-blue-300" },
    { bg: "bg-amber-50", border: "border-amber-200", ring: "ring-amber-300" },
    { bg: "bg-green-50", border: "border-green-200", ring: "ring-green-300" },
    { bg: "bg-purple-50", border: "border-purple-200", ring: "ring-purple-300" },
    { bg: "bg-rose-50", border: "border-rose-200", ring: "ring-rose-300" },
    { bg: "bg-cyan-50", border: "border-cyan-200", ring: "ring-cyan-300" },
  ];

  // ===== 렌더링 =====
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-800">재독듣기</h1>
        {isAdmin && (
          <button
            onClick={() => openEditor()}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            + 새 글 등록
          </button>
        )}
      </div>

      {/* 에디터 모달 */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-bold mb-4">
              {editId ? "글 수정" : "새 글 등록"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="제목을 입력하세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  내용 (줄 단위로 입력 - 각 줄이 동기화 단위)
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={15}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder={"첫째 줄 텍스트\n둘째 줄 텍스트\n셋째 줄 텍스트\n...\n\n빈 줄은 자동 제거됩니다"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">음성 파일</label>
                {editAudioPath && (
                  <div className="text-xs text-green-600 mb-1">
                    현재: {editAudioPath.split("/").pop()}
                  </div>
                )}
                <input
                  type="file"
                  accept=".mp3,.wav,.ogg,.m4a"
                  onChange={handleAudioUpload}
                  disabled={uploading}
                  className="text-sm"
                />
                {uploading && <span className="text-xs text-gray-500 ml-2">업로드 중...</span>}
              </div>

              {/* 음성→텍스트 변환 */}
              {editId && editAudioPath && (
                <div className="border border-dashed border-indigo-300 rounded-lg p-3 bg-indigo-50/50">
                  <label className="block text-sm font-medium text-indigo-700 mb-2">
                    음성 → 텍스트 자동 변환 (Whisper)
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={transcribeModel}
                      onChange={(e) => setTranscribeModel(e.target.value as "base" | "small")}
                      disabled={transcribing}
                      className="text-sm border rounded px-2 py-1.5"
                    >
                      <option value="base">base (빠름, 정확도 보통)</option>
                      <option value="small">small (느림, 정확도 높음)</option>
                    </select>
                    <button
                      onClick={handleTranscribe}
                      disabled={transcribing}
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {transcribing ? "변환 중... (수 분 소요)" : "변환 시작"}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    변환하면 기존 내용이 대체됩니다. 타임스탬프가 자동 생성되어 음성 동기화가 정확해집니다.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">정렬 순서</label>
                <input
                  type="number"
                  value={editSortOrder}
                  onChange={(e) => setEditSortOrder(parseInt(e.target.value) || 0)}
                  className="w-24 border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={() => setShowEditor(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 교정 에디터 (전체화면 모달) */}
      {showCorrector && selected && segments.length > 0 && (
        <div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
          <div className="bg-white flex flex-col h-full">
            {/* 헤더 */}
            <div className="px-4 py-3 bg-indigo-800 text-white flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-sm font-bold">텍스트 교정 - {selected.title}</h2>
                <p className="text-[10px] text-indigo-200 mt-0.5">
                  왼쪽: Whisper 인식 (읽기전용) / 오른쪽: 교정 입력 — 같은 색 = 같은 구간 (타임스탬프 유지)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveCorrection}
                  disabled={corrSaving}
                  className="px-4 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {corrSaving ? "저장 중..." : "교정 저장"}
                </button>
                <button
                  onClick={() => setShowCorrector(false)}
                  className="px-3 py-1.5 text-sm bg-white/20 text-white rounded-lg hover:bg-white/30"
                >
                  닫기
                </button>
              </div>
            </div>

            {/* 좌우 분할 본문 */}
            <div className="flex-1 overflow-hidden flex">
              {/* 왼쪽: Whisper 인식 텍스트 (읽기전용) */}
              <div className="w-1/2 border-r border-gray-300 flex flex-col">
                <div className="px-3 py-2 bg-gray-100 border-b text-xs font-bold text-gray-600 shrink-0">
                  Whisper 인식 텍스트 (읽기전용)
                </div>
                <div ref={corrLeftRef} onScroll={() => handleCorrScroll("left")} className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {segments.map((seg, i) => {
                    const color = segColors[i % segColors.length];
                    return (
                      <div
                        key={i}
                        className={`px-2 py-1.5 rounded text-sm ${color.bg} border ${color.border}`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[9px] text-gray-400 font-mono">
                            #{i + 1} [{formatTime(seg.start)}~{formatTime(seg.end)}]
                          </span>
                        </div>
                        <div className="text-gray-800">{seg.text}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 오른쪽: 교정 입력 */}
              <div className="w-1/2 flex flex-col">
                <div className="px-3 py-2 bg-gray-100 border-b text-xs font-bold text-gray-600 shrink-0">
                  교정 텍스트 입력 (각 구간에 맞춰 수정)
                </div>
                <div ref={corrRightRef} onScroll={() => handleCorrScroll("right")} className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {segments.map((seg, i) => {
                    const color = segColors[i % segColors.length];
                    return (
                      <div
                        key={i}
                        className={`px-2 py-1 rounded ${color.bg} border ${color.border}`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[9px] text-gray-400 font-mono">
                            #{i + 1}
                          </span>
                        </div>
                        <textarea
                          value={corrSegments[i] ?? ""}
                          onChange={(e) => {
                            const next = [...corrSegments];
                            next[i] = e.target.value;
                            setCorrSegments(next);
                          }}
                          rows={Math.max(1, Math.ceil(seg.text.length / 40))}
                          className={`w-full text-sm bg-white/80 border ${color.border} rounded px-2 py-1 ring-1 ${color.ring} focus:ring-2 focus:outline-none resize-none`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 목록 패널 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-indigo-50 border-b border-gray-200">
              <h2 className="text-sm font-bold text-indigo-800">목록</h2>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="p-4 text-sm text-gray-400 text-center">로딩 중...</div>
              ) : readings.length === 0 ? (
                <div className="p-4 text-sm text-gray-400 text-center">등록된 글이 없습니다</div>
              ) : (
                readings.map((r) => (
                  <div
                    key={r.id}
                    className={`px-3 py-2 border-b border-gray-100 cursor-pointer transition-colors ${
                      selected?.id === r.id
                        ? "bg-indigo-50 border-l-2 border-l-indigo-600"
                        : "hover:bg-gray-50"
                    }`}
                    onClick={() => loadDetail(r.id)}
                  >
                    <div className="text-sm font-medium text-gray-800 truncate">{r.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {r.audioPath && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">음성</span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 mt-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            fetch(`/api/council/reading/${r.id}`)
                              .then((res) => res.json())
                              .then((d) => { if (d.reading) openEditor(d.reading); });
                          }}
                          className="text-[10px] text-blue-600 hover:underline"
                        >
                          수정
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(r.id);
                          }}
                          className="text-[10px] text-red-500 hover:underline"
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 콘텐츠 패널 */}
        <div className="lg:col-span-3">
          {!selected ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
              <p className="text-sm">왼쪽 목록에서 재독을 선택하세요</p>
            </div>
          ) : detailLoading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-400">
              로딩 중...
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {/* 제목 + 표시설정 토글 */}
              <div className="px-4 py-3 bg-indigo-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-indigo-800">{selected.title}</h2>
                  {hasTimestamps && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                      타임스탬프
                    </span>
                  )}
                  {isAdmin && hasTimestamps && (
                    <button
                      onClick={openCorrector}
                      className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded hover:bg-orange-200 transition-colors"
                    >
                      구간 교정
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => inlineEdit ? setInlineEdit(false) : openInlineEdit()}
                      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                        inlineEdit
                          ? "bg-red-100 text-red-700 hover:bg-red-200"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {inlineEdit ? "편집 취소" : "텍스트 편집"}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowDisplaySettings(!showDisplaySettings)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                    showDisplaySettings ? "bg-indigo-600 text-white" : "bg-white text-indigo-600 border border-indigo-300 hover:bg-indigo-50"
                  }`}
                  title="글꼴/크기 설정 (프로젝터용)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                  </svg>
                  표시설정
                </button>
              </div>

              {/* 표시 설정 패널 */}
              {showDisplaySettings && (
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-600 w-16 shrink-0">글꼴 크기</label>
                    <button onClick={() => setFontSize((s) => Math.max(10, s - 2))} className="w-7 h-7 flex items-center justify-center bg-white border rounded text-sm font-bold text-gray-600 hover:bg-gray-100">-</button>
                    <input type="range" min={10} max={60} value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="flex-1 accent-indigo-600" />
                    <button onClick={() => setFontSize((s) => Math.min(60, s + 2))} className="w-7 h-7 flex items-center justify-center bg-white border rounded text-sm font-bold text-gray-600 hover:bg-gray-100">+</button>
                    <span className="text-xs text-gray-500 w-12 text-right">{fontSize}px</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-600 w-16 shrink-0">박스 너비</label>
                    <button onClick={() => setBoxWidth((w) => Math.max(30, w - 5))} className="w-7 h-7 flex items-center justify-center bg-white border rounded text-sm font-bold text-gray-600 hover:bg-gray-100">-</button>
                    <input type="range" min={30} max={100} value={boxWidth} onChange={(e) => setBoxWidth(parseInt(e.target.value))} className="flex-1 accent-indigo-600" />
                    <button onClick={() => setBoxWidth((w) => Math.min(100, w + 5))} className="w-7 h-7 flex items-center justify-center bg-white border rounded text-sm font-bold text-gray-600 hover:bg-gray-100">+</button>
                    <span className="text-xs text-gray-500 w-12 text-right">{boxWidth}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-600 w-16 shrink-0">박스 높이</label>
                    <button onClick={() => setBoxHeight((h) => Math.max(20, h - 5))} className="w-7 h-7 flex items-center justify-center bg-white border rounded text-sm font-bold text-gray-600 hover:bg-gray-100">-</button>
                    <input type="range" min={20} max={100} value={boxHeight} onChange={(e) => setBoxHeight(parseInt(e.target.value))} className="flex-1 accent-indigo-600" />
                    <button onClick={() => setBoxHeight((h) => Math.min(100, h + 5))} className="w-7 h-7 flex items-center justify-center bg-white border rounded text-sm font-bold text-gray-600 hover:bg-gray-100">+</button>
                    <span className="text-xs text-gray-500 w-12 text-right">{boxHeight}vh</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setFontSize(16); setBoxWidth(100); setBoxHeight(70); }} className="px-2 py-1 text-[10px] bg-gray-200 rounded hover:bg-gray-300 text-gray-600">기본값</button>
                    <button onClick={() => { setFontSize(28); setBoxWidth(90); setBoxHeight(85); }} className="px-2 py-1 text-[10px] bg-indigo-100 rounded hover:bg-indigo-200 text-indigo-700">프로젝터(중)</button>
                    <button onClick={() => { setFontSize(40); setBoxWidth(80); setBoxHeight(90); }} className="px-2 py-1 text-[10px] bg-indigo-100 rounded hover:bg-indigo-200 text-indigo-700">프로젝터(대)</button>
                  </div>
                </div>
              )}

              {/* 오디오 플레이어 */}
              {selected.audioPath && (
                <div className="sticky top-0 z-10 bg-white border-b shadow-sm p-3">
                  <audio
                    ref={audioRef}
                    src={audioSrc || undefined}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => { setIsPlaying(false); setActiveLine(null); }}
                    onError={() => setAudioError(true)}
                    preload="metadata"
                  />

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {!isPlaying ? (
                        <button onClick={handlePlay} disabled={audioError} className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          재생
                        </button>
                      ) : (
                        <button onClick={handlePause} className="flex items-center gap-1 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm font-medium">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                          일시정지
                        </button>
                      )}
                      {selected && (
                        <button
                          type="button"
                          onClick={() => {
                            const startLine = activeLine ?? 0;
                            window.open(
                              `/reading-player/${selected.id}?startLine=${startLine}`,
                              `reading-player-${selected.id}`,
                              "width=900,height=700,resizable=yes,scrollbars=yes"
                            );
                          }}
                          className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                          title="별도 창에서 재생 (크기 조정·폰트·페이지 이동)"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                          팝업 재생
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-600">속도:</label>
                        <select value={playbackRate} onChange={(e) => handleRateChange(parseFloat(e.target.value))} className="text-xs border rounded px-1 py-1">
                          <option value={0.5}>0.5x</option>
                          <option value={0.75}>0.75x</option>
                          <option value={1.0}>1.0x</option>
                          <option value={1.25}>1.25x</option>
                          <option value={1.5}>1.5x</option>
                          <option value={2.0}>2.0x</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={lineSync} onChange={(e) => { setLineSync(e.target.checked); if (!e.target.checked) setActiveLine(null); }} className="rounded" />
                        줄 동기화
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} className="rounded" />
                        이어쓰기
                      </label>
                      {isAdmin && (
                        <label className="flex items-center gap-1 text-xs text-amber-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={lineEditMode}
                            onChange={(e) => setLineEditMode(e.target.checked)}
                            className="rounded"
                          />
                          싱크 편집
                        </label>
                      )}
                      {lineTimes.length > 0 && (
                        <span className="text-[10px]">
                          {(() => {
                            const m = lineTimes.filter((l) => l.manuallyAdjusted).length;
                            const a = lineTimes.length - m;
                            return (
                              <>
                                (<span className="text-emerald-600">{lineTimes.length}건</span>
                                {a > 0 && <span className="text-gray-500"> · 자동 {a}</span>}
                                {m > 0 && <span className="text-amber-700"> · 수동 {m}</span>})
                              </>
                            );
                          })()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500 w-10 text-right">{formatTime(currentTime)}</span>
                    <input type="range" min={0} max={duration || 0} step={0.1} value={currentTime} onChange={handleSeek} className="flex-1 h-1.5 accent-indigo-600" />
                    <span className="text-xs text-gray-500 w-10">{formatTime(duration)}</span>
                  </div>

                  {audioError && (
                    <div className="text-xs text-red-500 mt-1">음성 파일을 재생할 수 없습니다</div>
                  )}

                  <div className="text-[10px] text-gray-400 mt-1">
                    줄을 클릭하면 해당 위치부터 재동기화됩니다
                    {hasTimestamps && " (타임스탬프 동기화 활성)"}
                  </div>

                  {/* 줄-시간 편집 패널 */}
                  {isAdmin && lineEditMode && (
                    <div className="mt-3 p-3 border border-amber-200 bg-amber-50 rounded-lg space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-xs font-bold text-amber-900">싱크 편집 (줄-시간 매핑)</div>
                        <div className="flex gap-2">
                          <button
                            onClick={autoDistributeLineTimes}
                            disabled={!duration || lines.length === 0}
                            className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
                            title="이 본문의 모든 줄을 글자 수 비율로 자동 분할 저장"
                          >
                            이 본문 자동 분할 저장 ({lines.length}줄)
                          </button>
                          {lineTimes.length > 0 && (
                            <button
                              onClick={clearAllLineTimes}
                              className="px-2 py-1 text-xs text-red-600 hover:underline"
                            >
                              전체 초기화
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] text-amber-700">
                        ① 위 버튼으로 자동 분할 (대략적 시작 시간)<br />
                        ② 진행바를 정확한 위치로 옮기고 줄 선택 → 저장 (미세 조정)
                      </div>
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-xs text-gray-700">
                          현재 위치: <strong className="font-mono">{formatTime(currentTime)}</strong>
                          <span className="text-gray-400 ml-1">({currentTime.toFixed(1)}초)</span>
                        </span>
                        <select
                          value={editLineIndex}
                          onChange={(e) => setEditLineIndex(Number(e.target.value))}
                          className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white max-w-md"
                        >
                          {lines.map((ln, i) => (
                            <option key={i} value={i}>
                              {i + 1}. {ln.length > 40 ? ln.slice(0, 40) + "…" : ln}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={saveLineTime}
                          className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
                        >
                          이 시각을 {editLineIndex + 1}번 줄 시작으로 저장
                        </button>
                      </div>
                      {lineEditMsg && (
                        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                          {lineEditMsg}
                        </div>
                      )}
                      {lineTimes.length > 0 ? (
                        <div className="mt-2 max-h-48 overflow-y-auto bg-white rounded border border-amber-200">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr className="text-gray-600">
                                <th className="px-2 py-1 text-left font-medium w-10">#</th>
                                <th className="px-2 py-1 text-left font-medium">줄 (앞부분)</th>
                                <th className="px-2 py-1 text-left font-medium w-20">시작</th>
                                <th className="px-2 py-1 text-center font-medium w-12">상태</th>
                                <th className="px-2 py-1 text-right font-medium w-24">동작</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineTimes.map((lt) => {
                                const text = lines[lt.lineIndex] || "(줄 없음)";
                                return (
                                  <tr key={lt.lineIndex} className="border-t border-gray-100 hover:bg-amber-50">
                                    <td className="px-2 py-1 font-mono">{lt.lineIndex + 1}</td>
                                    <td className="px-2 py-1 text-gray-700 truncate max-w-md" title={text}>
                                      {text.length > 50 ? text.slice(0, 50) + "…" : text}
                                    </td>
                                    <td className="px-2 py-1">
                                      <button
                                        onClick={() => seekToLineTime(lt.startSec)}
                                        className="font-mono text-blue-600 hover:underline"
                                        title="이 위치로 이동"
                                      >
                                        {formatTime(lt.startSec)}
                                      </button>
                                    </td>
                                    <td className="px-2 py-1 text-center">
                                      {lt.manuallyAdjusted ? (
                                        <span className="inline-block px-1.5 py-px text-[10px] bg-amber-100 text-amber-800 rounded font-bold">
                                          수동
                                        </span>
                                      ) : (
                                        <span className="inline-block px-1.5 py-px text-[10px] bg-gray-100 text-gray-500 rounded">
                                          자동
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1 text-right space-x-1">
                                      <button
                                        onClick={() => {
                                          setEditLineIndex(lt.lineIndex);
                                          seekToLineTime(lt.startSec);
                                        }}
                                        className="text-[11px] text-gray-500 hover:underline"
                                      >
                                        편집
                                      </button>
                                      <button
                                        onClick={() => deleteLineTime(lt.lineIndex)}
                                        className="text-[11px] text-red-500 hover:underline"
                                      >
                                        삭제
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-500">저장된 매핑이 없습니다.</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 텍스트 본문 */}
              <div
                ref={textBoxRef}
                className="p-4 overflow-y-auto mx-auto"
                style={{ maxHeight: `${boxHeight}vh`, width: `${boxWidth}%` }}
              >
                {inlineEdit ? (
                  <div>
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
                      className="w-full border border-indigo-300 rounded-lg p-3 text-gray-800 focus:ring-2 focus:ring-indigo-400 focus:outline-none resize-y"
                      rows={Math.max(10, editingContent.split("\n").length + 2)}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] text-gray-400">
                        {segments.length > 0
                          ? `현재 ${segments.length}줄. 줄 수 유지→시간 보존+텍스트 교체 / 줄 수 변경→비율로 재생성`
                          : "줄바꿈(Enter)으로 구간을 나눕니다. 저장 시 글자수 비율로 타임스탬프 자동 생성"
                        }
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setInlineEdit(false)}
                          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                        >
                          취소
                        </button>
                        <button
                          onClick={saveInlineEdit}
                          disabled={inlineSaving}
                          className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {inlineSaving ? "저장 중..." : "저장"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : visualLines.length === 0 ? (
                  <div className="text-gray-400 text-center py-8" style={{ fontSize: `${fontSize}px` }}>
                    내용이 없습니다
                  </div>
                ) : (
                  <div>
                    {visualLines.map((vLine, idx) => {
                      const isActive = activeLine === idx;
                      return (
                        <div
                          key={idx}
                          ref={isActive ? (el) => { el?.scrollIntoView({ behavior: "smooth", block: "center" }); } : undefined}
                          onClick={() => selected.audioPath && handleLineClick(idx)}
                          style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
                          className={`px-3 rounded-sm transition-all whitespace-nowrap overflow-hidden ${
                            selected.audioPath ? "cursor-pointer" : ""
                          } ${
                            isActive
                              ? "bg-blue-50 ring-1 ring-blue-300 font-medium text-blue-900"
                              : "hover:bg-gray-50 text-gray-700"
                          }`}
                        >
                          {vLine.text}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
