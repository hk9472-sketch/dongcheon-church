"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import HelpButton from "@/components/HelpButton";

interface BibleBook {
  id: number;
  name: string;
  shortName: string;
  testament: string;
  totalChapters: number;
}

interface Verse {
  verse: number;
  content: string;
}

interface SearchResult {
  bookId: number;
  bookName: string;
  shortName: string;
  chapter: number;
  verse: number;
  content: string;
}

export default function BibleReaderPage() {
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);

  // 오디오 상태
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAutoPlayRef = useRef(false);
  const [activeVerse, setActiveVerse] = useState<number | null>(null);
  const [verseSync, setVerseSync] = useState(false);

  // 절-시간 매핑 (저장된 verse → startSec). 자동 싱크의 정확도 결정.
  const [verseTimes, setVerseTimes] = useState<
    { verse: number; startSec: number; manuallyAdjusted: boolean }[]
  >([]);
  // 관리자 여부 (편집 패널 표시)
  const [isAdmin, setIsAdmin] = useState(false);
  // 편집 패널 토글·상태
  const [editMode, setEditMode] = useState(false);
  const [editVerse, setEditVerse] = useState<number>(1);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  // 매핑 표 접기 (default 닫힘 — 본문 가림 방지)
  const [showMapping, setShowMapping] = useState(false);

  // 검색 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [highlightWord, setHighlightWord] = useState("");

  // 원고지 설정 모달
  const [showManuscriptModal, setShowManuscriptModal] = useState(false);
  const [msPaperSize, setMsPaperSize] = useState<"A4" | "B5" | "A5" | "Letter">("A4");
  const [msOrientation, setMsOrientation] = useState<"portrait" | "landscape">("portrait");
  const [msCols, setMsCols] = useState(20);
  const [msRows, setMsRows] = useState(10);
  const [msMode, setMsMode] = useState<"normal" | "copy" | "tracing" | "copytracing">("normal");
  const [msFont, setMsFont] = useState("batang");
  const [msFontSize, setMsFontSize] = useState(0); // 0 = 자동
  const [msGuide, setMsGuide] = useState<"cross" | "crossbox" | "crossdiamond" | "none">("cross");
  // 출력 범위: 성경권 + 장 + 절
  const [msFromBookId, setMsFromBookId] = useState(0);
  const [msFromChapter, setMsFromChapter] = useState(1);
  const [msFromVerse, setMsFromVerse] = useState(1);
  const [msToBookId, setMsToBookId] = useState(0);
  const [msToChapter, setMsToChapter] = useState(1);
  const [msToVerse, setMsToVerse] = useState(0); // 0 = 마지막 절
  const [msVerses, setMsVerses] = useState<{ text: string; label: string }[]>([]);
  const [msVersesLoading, setMsVersesLoading] = useState(false);

  // layout.tsx에서 이미 로그인 검증 완료 (미로그인 시 redirect)

  // 책 목록 로드
  useEffect(() => {
    fetch("/api/bible")
      .then((res) => res.json())
      .then((data) => {
        setBooks(data);
        if (data.length > 0) {
          setSelectedBook(data[0]);
        }
      });
  }, []);

  // 관리자 여부 체크 (편집 패널 표시 결정)
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(!!(d.user && d.user.isAdmin <= 2)))
      .catch(() => setIsAdmin(false));
  }, []);

  // 장 변경 시 절 로드 + 오디오 리셋
  useEffect(() => {
    if (!selectedBook) return;
    setLoading(true);
    setAudioError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    fetch(`/api/bible/${selectedBook.id}/${selectedChapter}`)
      .then((res) => res.json())
      .then((data) => {
        setVerses(data.verses || []);
        setLoading(false);
      });

    // 절-시간 매핑 동시 로드
    fetch(`/api/bible/${selectedBook.id}/${selectedChapter}/verse-times`)
      .then((r) => r.json())
      .then((d) => setVerseTimes(d.times || []))
      .catch(() => setVerseTimes([]));

    // 오디오 소스가 변경되었으므로 명시적으로 리로드
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [selectedBook, selectedChapter]);

  // 오디오 소스 URL (API 경유 - 로그인 필요)
  const audioSrc = selectedBook
    ? `/api/bible/audio/${selectedBook.id}/${selectedChapter}`
    : "";

  // 다음 장 이동
  const goNextChapter = () => {
    if (!selectedBook) return;
    if (selectedChapter < selectedBook.totalChapters) {
      setSelectedChapter((prev) => prev + 1);
    } else {
      const nextBook = books.find((b) => b.id === selectedBook.id + 1);
      if (nextBook) {
        setSelectedBook(nextBook);
        setSelectedChapter(1);
      }
    }
  };

  // 이전 장 이동
  const goPrevChapter = () => {
    if (!selectedBook) return;
    if (selectedChapter > 1) {
      setSelectedChapter((prev) => prev - 1);
    } else {
      const prevBook = books.find((b) => b.id === selectedBook.id - 1);
      if (prevBook) {
        setSelectedBook(prevBook);
        setSelectedChapter(prevBook.totalChapters);
      }
    }
  };

  // 오디오 이벤트 핸들러
  const handlePlay = () => {
    if (!audioRef.current) return;
    audioRef.current.play().catch(() => setAudioError(true));
  };

  const handlePause = () => {
    audioRef.current?.pause();
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setCurrentTime(t);

    // 절 동기화
    if (verseSync && verses.length > 0 && duration > 0) {
      // 1순위: 저장된 verse-times 가 있으면 그걸로 정확 결정
      if (verseTimes.length > 0) {
        // verseTimes 는 verse 오름차순. 현재 시각보다 작거나 같은 마지막 절을 찾음.
        let found = verseTimes[0].verse;
        for (const vt of verseTimes) {
          if (vt.startSec <= t) found = vt.verse;
          else break;
        }
        setActiveVerse(found);
      } else {
        // 2순위 (fallback): 글자 수 비율로 추정
        const ratio = t / duration;
        const lengths = verses.map((v) => v.content.length);
        const totalLen = lengths.reduce((a, b) => a + b, 0);
        let cumLen = 0;
        let found = verses[0].verse;
        for (let i = 0; i < verses.length; i++) {
          cumLen += lengths[i];
          if (cumLen / totalLen >= ratio) {
            found = verses[i].verse;
            break;
          }
        }
        setActiveVerse(found);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      audioRef.current.playbackRate = playbackRate;
      setAudioError(false);
      // 자동넘김으로 장이 바뀐 경우 → 로드 완료 후 자동 재생
      if (pendingAutoPlayRef.current) {
        pendingAutoPlayRef.current = false;
        audioRef.current.play().catch(() => setAudioError(true));
      }
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveVerse(null);
    if (autoAdvance) {
      // 플래그 설정 → 다음 장 오디오가 loadedmetadata 이벤트에서 자동 재생
      pendingAutoPlayRef.current = true;
      goNextChapter();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // 절-시간 편집 핸들러 (관리자만)
  const saveVerseTime = async () => {
    if (!selectedBook) return;
    setEditMsg(null);
    try {
      // 1) 이 절의 이전 시간 (있으면) — 뒤쪽 자동 절 shift 계산용
      const prev = verseTimes.find((vt) => vt.verse === editVerse);
      const delta = prev ? currentTime - prev.startSec : 0;

      // 2) 이 절 저장 (수동)
      const res = await fetch(
        `/api/bible/${selectedBook.id}/${selectedChapter}/verse-times`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verse: editVerse, startSec: currentTime, manual: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "저장 실패");

      // 3) delta 가 있으면 뒤쪽 자동 절(이 절보다 verse 큰 + manuallyAdjusted=false)도 같이 shift
      let shifted = 0;
      if (Math.abs(delta) > 0.01) {
        const targets = verseTimes.filter(
          (vt) => vt.verse > editVerse && !vt.manuallyAdjusted
        );
        await Promise.all(
          targets.map(async (vt) => {
            const newSec = Math.max(0, vt.startSec + delta);
            try {
              await fetch(
                `/api/bible/${selectedBook.id}/${selectedChapter}/verse-times`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ verse: vt.verse, startSec: newSec, manual: false }),
                }
              );
              shifted++;
            } catch {
              /* skip */
            }
          })
        );
      }

      // 4) 목록 갱신
      const tres = await fetch(
        `/api/bible/${selectedBook.id}/${selectedChapter}/verse-times`
      );
      const td = await tres.json();
      setVerseTimes(td.times || []);
      const shiftMsg = shifted > 0
        ? ` · 뒤쪽 자동 ${shifted}절 ${delta > 0 ? "+" : ""}${delta.toFixed(1)}초 이동`
        : "";
      setEditMsg(`${editVerse}절 시작 시간 ${formatTime(currentTime)} 저장됨${shiftMsg}`);
    } catch (e) {
      setEditMsg(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const deleteVerseTime = async (verse: number) => {
    if (!selectedBook) return;
    setEditMsg(null);
    try {
      const res = await fetch(
        `/api/bible/${selectedBook.id}/${selectedChapter}/verse-times?verse=${verse}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || "삭제 실패");
      }
      setVerseTimes((prev) => prev.filter((vt) => vt.verse !== verse));
      setEditMsg(`${verse}절 시간 삭제됨`);
    } catch (e) {
      setEditMsg(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const seekToVerseTime = (sec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = sec;
      setCurrentTime(sec);
    }
  };

  // 자동 분할 일괄 저장 — 글자 수 비율로 각 절 시작 시간 계산해서 저장.
  // 이후 진행바로 절별 미세 조정.
  const autoDistributeVerseTimes = async () => {
    if (!selectedBook || verses.length === 0 || !duration || duration <= 0) {
      setEditMsg("오디오가 로드되지 않았거나 절 데이터가 없습니다.");
      return;
    }
    if (
      !confirm(
        `이 장의 ${verses.length}개 절을 글자 수 비율로 자동 분할해 저장합니다.\n` +
          `(이미 저장된 시간이 있다면 덮어씁니다.)\n진행할까요?`
      )
    )
      return;

    // 각 절 시작 위치 계산: 누적 글자 비율 × 전체 길이
    const lengths = verses.map((v) => v.content.length);
    const totalLen = lengths.reduce((a, b) => a + b, 0);
    if (totalLen === 0) {
      setEditMsg("절 본문이 비어 있습니다.");
      return;
    }

    let cumLen = 0;
    const payloads: { verse: number; startSec: number }[] = [];
    for (let i = 0; i < verses.length; i++) {
      const startSec = (cumLen / totalLen) * duration;
      payloads.push({ verse: verses[i].verse, startSec });
      cumLen += lengths[i];
    }

    setEditMsg(`자동 분할 저장 중... 0 / ${payloads.length}`);
    let done = 0;
    let failed = 0;
    // 병렬 POST (서버 부하 적음 — 절당 1 upsert)
    await Promise.all(
      payloads.map(async (p) => {
        try {
          const res = await fetch(
            `/api/bible/${selectedBook.id}/${selectedChapter}/verse-times`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...p, manual: false }),
            }
          );
          if (!res.ok) failed++;
        } catch {
          failed++;
        }
        done++;
        setEditMsg(`자동 분할 저장 중... ${done} / ${payloads.length}`);
      })
    );

    // 목록 갱신
    const tres = await fetch(
      `/api/bible/${selectedBook.id}/${selectedChapter}/verse-times`
    );
    const td = await tres.json();
    setVerseTimes(td.times || []);
    setEditMsg(
      failed > 0
        ? `저장 완료: 성공 ${done - failed} / 실패 ${failed}`
        : `자동 분할 저장 완료 (${done}건). 진행바로 절별 미세 조정 가능.`
    );
  };

  const formatTime = (sec: number) => {
    if (!isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // 검색 실행
  const handleSearch = () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    fetch(`/api/bible/search?q=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((data) => {
        setSearchResults(data.results || []);
        setSearchTotal(data.total || 0);
        setSearching(false);
      });
  };

  // 검색 결과 클릭 → 해당 본문으로 이동
  const handleSearchResultClick = (result: SearchResult) => {
    const book = books.find((b) => b.id === result.bookId);
    if (book) {
      setSelectedBook(book);
      setSelectedChapter(result.chapter);
      setHighlightWord(searchQuery.trim());
      setShowSearch(false);
    }
  };

  // 텍스트에서 검색어를 하이라이트
  const renderHighlighted = (text: string, word: string) => {
    if (!word) return text;
    const parts = text.split(new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === word.toLowerCase() ? (
        <mark key={i} className="bg-yellow-300 text-gray-900 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    );
  };

  // 원고지 범위 절 가져오기
  const fetchMsVerses = async () => {
    if (books.length === 0) return;
    setMsVersesLoading(true);
    const fromBook = books.find((b) => b.id === msFromBookId);
    const toBook = books.find((b) => b.id === msToBookId);
    if (!fromBook || !toBook) { setMsVersesLoading(false); return; }

    const result: { text: string; label: string }[] = [];

    // 시작 bookId ~ 끝 bookId 순회
    const fromIdx = books.findIndex((b) => b.id === msFromBookId);
    const toIdx = books.findIndex((b) => b.id === msToBookId);

    for (let bi = fromIdx; bi <= toIdx; bi++) {
      const book = books[bi];
      const chapStart = bi === fromIdx ? msFromChapter : 1;
      const chapEnd = bi === toIdx ? msToChapter : book.totalChapters;

      for (let ch = chapStart; ch <= chapEnd; ch++) {
        try {
          const res = await fetch(`/api/bible/${book.id}/${ch}`);
          const data = await res.json();
          const vArr: Verse[] = data.verses || [];

          const vStart = (bi === fromIdx && ch === msFromChapter) ? msFromVerse : 1;
          const vEnd = (bi === toIdx && ch === msToChapter && msToVerse > 0) ? msToVerse : vArr.length;

          for (const v of vArr) {
            if (v.verse >= vStart && v.verse <= vEnd) {
              result.push({
                text: v.content,
                label: `${book.shortName}${ch}:${v.verse}`,
              });
            }
          }
        } catch { /* skip */ }
      }
    }

    setMsVerses(result);
    setMsVersesLoading(false);
  };

  // 원고지 모달 열릴 때 현재 선택 기준으로 초기화
  const openManuscriptModal = () => {
    if (!selectedBook) return;
    setMsFromBookId(selectedBook.id);
    setMsFromChapter(selectedChapter);
    setMsFromVerse(1);
    setMsToBookId(selectedBook.id);
    setMsToChapter(selectedChapter);
    setMsToVerse(0);
    // 현재 장의 verses를 기본으로 셋
    setMsVerses(verses.map((v) => ({
      text: v.content,
      label: `${selectedBook.shortName}${selectedChapter}:${v.verse}`,
    })));
    setShowManuscriptModal(true);
  };

  // 원고지 출력
  const handleManuscriptPrint = () => {
    if (msVerses.length === 0) return;

    const fromBook = books.find((b) => b.id === msFromBookId);
    const toBook = books.find((b) => b.id === msToBookId);
    const isSameBook = msFromBookId === msToBookId;
    const isSameChapter = isSameBook && msFromChapter === msToChapter;

    let title = "";
    if (isSameChapter) {
      title = `${fromBook?.name} ${msFromChapter}장`;
      if (msFromVerse > 1 || msToVerse > 0) {
        title += ` ${msFromVerse}-${msToVerse > 0 ? msToVerse : "끝"}절`;
      }
    } else if (isSameBook) {
      title = `${fromBook?.name} ${msFromChapter}장-${msToChapter}장`;
    } else {
      title = `${fromBook?.name} ${msFromChapter}장 ~ ${toBook?.name} ${msToChapter}장`;
    }

    const fullText = msVerses.map((v) => v.text).join(" ");
    const chars = [...fullText];

    // 용지 크기 (mm)
    const paperSizes: Record<string, [number, number]> = {
      A4: [210, 297], B5: [176, 250], A5: [148, 210], Letter: [216, 279],
    };
    const [pw, ph] = paperSizes[msPaperSize];
    const marginMm = 15;
    const titleHeightMm = 12;
    const printW = (msOrientation === "portrait" ? pw : ph) - marginMm * 2;
    const printH = (msOrientation === "portrait" ? ph : pw) - marginMm * 2 - titleHeightMm;

    const COLS = msCols;
    const ROWS = msRows;
    if (COLS < 2 || ROWS < 2) return;

    // 용지에 맞게 칸 크기 계산 (가로/세로 중 작은 값)
    const cellW = printW / COLS;
    const cellH = printH / ROWS;
    const cellMm = Math.min(cellW, cellH);
    const cellSizePx = `${cellMm.toFixed(2)}mm`;
    // 자동: 셀 크기의 70% (mm→pt: 1mm≈2.8346pt)
    const fontSize = msFontSize > 0 ? msFontSize : Math.max(8, Math.round(cellMm * 0.7 * 2.8346));

    // 모드별 본문 행 수 계산
    const isCopyLike = msMode === "copy" || msMode === "copytracing";
    const textRowsPerPage = isCopyLike ? Math.floor(ROWS / 2) : ROWS;
    const CHARS_PER_PAGE = COLS * textRowsPerPage;

    // 페이지 분할
    const pages: string[][] = [];
    for (let i = 0; i < chars.length; i += CHARS_PER_PAGE) {
      pages.push(chars.slice(i, i + CHARS_PER_PAGE));
    }
    if (pages.length === 0) pages.push([]);

    const isTracingLike = msMode === "tracing";
    const textColor = isTracingLike ? "#ccc" : "#333";
    const numColor = isTracingLike ? "#ddd" : "#888";
    const midRow = Math.floor(ROWS / 2);

    // 폰트 설정
    const fontDefs: Record<string, { family: string; import?: string }> = {
      batang: { family: '"Batang", "바탕", serif' },
      dotum: { family: '"Dotum", "돋움", sans-serif' },
      gulim: { family: '"Gulim", "굴림", sans-serif' },
      gungsuh: { family: '"Gungsuh", "궁서", serif' },
      nanummyeongjo: { family: '"Nanum Myeongjo", serif', import: "Nanum+Myeongjo" },
      nanumgothic: { family: '"Nanum Gothic", sans-serif', import: "Nanum+Gothic" },
      nanumpen: { family: '"Nanum Pen Script", cursive', import: "Nanum+Pen+Script" },
      nanumbrush: { family: '"Nanum Brush Script", cursive', import: "Nanum+Brush+Script" },
      nanumbarungothic: { family: '"Nanum Gothic Coding", monospace', import: "Nanum+Gothic+Coding" },
      gowunbatang: { family: '"Gowun Batang", serif', import: "Gowun+Batang" },
      gowundodum: { family: '"Gowun Dodum", sans-serif', import: "Gowun+Dodum" },
      ibmplexsanskr: { family: '"IBM Plex Sans KR", sans-serif', import: "IBM+Plex+Sans+KR" },
      notosanskr: { family: '"Noto Sans KR", sans-serif', import: "Noto+Sans+KR" },
      notoserifkr: { family: '"Noto Serif KR", serif', import: "Noto+Serif+KR" },
      poorstory: { family: '"Poor Story", cursive', import: "Poor+Story" },
      singleday: { family: '"Single Day", cursive', import: "Single+Day" },
      jua: { family: '"Jua", sans-serif', import: "Jua" },
      gamjaflower: { family: '"Gamja Flower", cursive', import: "Gamja+Flower" },
      dongle: { family: '"Dongle", sans-serif', import: "Dongle" },
    };
    const fd = fontDefs[msFont] || fontDefs.batang;
    const fontFamily = fd.family;
    const fontImport = fd.import
      ? `@import url("https://fonts.googleapis.com/css2?family=${fd.import}&display=swap");`
      : "";

    // 안내선 CSS
    let guideCSS = "";
    if (msGuide === "cross") {
      guideCSS = `
  .cell::after { content:""; position:absolute; top:50%; left:0; right:0; border-top:1px dashed #ddd; }
  .cell::before { content:""; position:absolute; left:50%; top:0; bottom:0; border-left:1px dashed #ddd; }`;
    } else if (msGuide === "crossbox") {
      guideCSS = `
  .cell::after { content:""; position:absolute; top:50%; left:0; right:0; border-top:1px dashed #ddd; }
  .cell::before { content:""; position:absolute; left:50%; top:0; bottom:0; border-left:1px dashed #ddd; }
  .cell .guide { position:absolute; inset:15%; border:1px dashed #e0e0e0; pointer-events:none; }`;
    } else if (msGuide === "crossdiamond") {
      guideCSS = `
  .cell::after { content:""; position:absolute; top:50%; left:0; right:0; border-top:1px dashed #ddd; }
  .cell::before { content:""; position:absolute; left:50%; top:0; bottom:0; border-left:1px dashed #ddd; }
  .cell .guide { position:absolute; inset:0; pointer-events:none; }
  .cell .guide::after { content:""; position:absolute; top:50%; left:50%; width:60%; height:60%; border:1px dashed #e0e0e0; transform:translate(-50%,-50%) rotate(45deg); }`;
    }
    // msGuide === "none" → no guide CSS

    const hasGuideDiv = msGuide === "crossbox" || msGuide === "crossdiamond";

    const pagesHtml = pages.map((pageChars, pageIdx) => {
      let cellsHtml = "";

      if (isCopyLike) {
        // 본문행 + (빈행 or 회색본문행) 교대
        let charIdx = 0;
        for (let r = 0; r < ROWS; r++) {
          const isTextRow = r % 2 === 0;
          const isGrayRow = !isTextRow && msMode === "copytracing";
          for (let c = 0; c < COLS; c++) {
            const guideDiv = hasGuideDiv ? '<div class="guide"></div>' : "";
            if (isTextRow && charIdx < pageChars.length) {
              const ch = pageChars[charIdx];
              const isNum = /[0-9.]/.test(ch);
              cellsHtml += `<div class="cell${isNum ? " num" : ""}">${guideDiv}${ch}</div>`;
              charIdx++;
            } else if (isGrayRow) {
              // copytracing: 같은 글자를 회색으로 표시
              const rowStart = Math.floor(r / 2);
              const srcIdx = rowStart * COLS + c;
              const ch = srcIdx < pageChars.length ? pageChars[srcIdx] : "";
              const isNum = /[0-9.]/.test(ch);
              cellsHtml += `<div class="cell gray${isNum ? " num-gray" : ""}">${guideDiv}${ch}</div>`;
            } else {
              cellsHtml += `<div class="cell">${guideDiv}</div>`;
            }
          }
        }
      } else {
        // normal / tracing
        const totalCells = COLS * ROWS;
        for (let i = 0; i < totalCells; i++) {
          const ch = pageChars[i] || "";
          const isNum = /[0-9.]/.test(ch);
          const guideDiv = hasGuideDiv ? '<div class="guide"></div>' : "";
          cellsHtml += `<div class="cell${isNum ? " num" : ""}">${guideDiv}${ch}</div>`;
        }
      }

      const modeLabel = msMode === "copy" ? " [따라쓰기]"
        : msMode === "tracing" ? " [덧쓰기]"
        : msMode === "copytracing" ? " [따라쓰기+덧쓰기]" : "";

      return `
        <div class="page">
          <div class="page-title">${title} ${pages.length > 1 ? `(${pageIdx + 1}/${pages.length})` : ""}${modeLabel}</div>
          <div class="grid">${cellsHtml}</div>
        </div>`;
    }).join("");

    const orientationCSS = msOrientation === "landscape"
      ? `${msPaperSize} landscape` : msPaperSize;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${title} - 원고지</title>
<style>
  ${fontImport}
  @page { size: ${orientationCSS}; margin: ${marginMm}mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${fontFamily}; }
  .page { page-break-after: always; padding: 0; }
  .page:last-child { page-break-after: auto; }
  .page-title {
    text-align: center; font-size: 14px; font-weight: bold;
    margin-bottom: 4px; letter-spacing: 2px; height: ${titleHeightMm}mm;
    line-height: ${titleHeightMm}mm;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(${COLS}, ${cellSizePx});
    grid-template-rows: repeat(${ROWS}, ${cellSizePx});
    border-top: 2px solid #333; border-left: 2px solid #333;
    width: fit-content; margin: 0 auto;
  }
  .cell {
    width: ${cellSizePx}; height: ${cellSizePx};
    border-right: 1px solid #aaa; border-bottom: 1px solid #aaa;
    display: flex; align-items: center; justify-content: center;
    font-size: ${fontSize}px; line-height: 1;
    position: relative; color: ${textColor};
  }
  .cell.gray { color: #ccc; }
  .cell.num-gray { color: #ddd; font-size: ${Math.max(8, fontSize - 4)}px; }
  .cell:nth-child(${COLS}n) { border-right: 2px solid #333; }
  .cell:nth-last-child(-n+${COLS}) { border-bottom: 2px solid #333; }
  .cell:nth-child(n+${COLS * midRow + 1}):nth-child(-n+${COLS * midRow + COLS}) {
    border-top: 2px solid #333;
  }
  ${guideCSS}
  .num { color: ${numColor}; font-size: ${Math.max(8, fontSize - 4)}px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @media screen {
    body { max-width: 900px; margin: 20px auto; padding: 0 10px; }
    .no-print { text-align: center; margin-bottom: 20px; }
    .no-print button {
      padding: 10px 30px; font-size: 16px; background: #2563eb;
      color: white; border: none; border-radius: 8px; cursor: pointer;
      margin-right: 10px;
    }
    .no-print button:hover { background: #1d4ed8; }
  }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()">인쇄하기</button>
    <button onclick="window.close()" style="background:#6b7280">닫기</button>
  </div>
  ${pagesHtml}
</body>
</html>`);
    printWindow.document.close();
    setShowManuscriptModal(false);
  };

  const otBooks = books.filter((b) => b.testament === "OT");
  const ntBooks = books.filter((b) => b.testament === "NT");

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-center mb-4 flex items-center justify-center gap-2">성경 읽기 <HelpButton slug="bible" /></h1>

      {/* 검색 토글 + 원고지 출력 */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          성경 검색
        </button>
        <button
          onClick={openManuscriptModal}
          disabled={verses.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 text-sm font-medium transition-colors disabled:opacity-30"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          원고지 출력
        </button>
      </div>

      {/* 검색 패널 */}
      {showSearch && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="검색어를 입력하세요 (2글자 이상)"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={searching || searchQuery.trim().length < 2}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {searching ? "검색 중..." : "검색"}
            </button>
          </div>

          {/* 검색 결과 */}
          {searchResults.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 mb-2">
                총 {searchTotal}건{searchTotal > 100 ? " (상위 100건 표시)" : ""}
              </p>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => handleSearchResultClick(r)}
                    className="w-full text-left px-3 py-2 bg-white rounded hover:bg-blue-50 transition-colors text-sm"
                  >
                    <span className="font-semibold text-blue-700 mr-2">
                      {r.bookName} {r.chapter}:{r.verse}
                    </span>
                    <span className="text-gray-700">
                      {renderHighlighted(r.content, searchQuery.trim())}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchResults.length === 0 && searchTotal === 0 && !searching && searchQuery.trim().length >= 2 && (
            <p className="text-sm text-gray-500">검색 결과가 없습니다.</p>
          )}
        </div>
      )}

      {/* 책 선택 */}
      <div className="mb-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-gray-600 mb-1">구약</h3>
          <div className="flex flex-wrap gap-1">
            {otBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => {
                  setSelectedBook(book);
                  setSelectedChapter(1);
                  setHighlightWord("");
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedBook?.id === book.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {book.shortName}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-1">신약</h3>
          <div className="flex flex-wrap gap-1">
            {ntBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => {
                  setSelectedBook(book);
                  setSelectedChapter(1);
                  setHighlightWord("");
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedBook?.id === book.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {book.shortName}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 장 선택 */}
      {selectedBook && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-1">
            {selectedBook.name} - 장 선택
          </h3>
          <div className="flex flex-wrap gap-1">
            {Array.from(
              { length: selectedBook.totalChapters },
              (_, i) => i + 1
            ).map((ch) => (
              <button
                key={ch}
                onClick={() => {
                  setSelectedChapter(ch);
                  setHighlightWord("");
                }}
                className={`w-9 h-8 text-xs rounded transition-colors ${
                  selectedChapter === ch
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 오디오 플레이어 */}
      <div className="sticky top-0 z-10 bg-white border rounded-lg shadow-sm p-3 mb-4">
          <audio
            ref={audioRef}
            src={audioSrc || undefined}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onError={() => setAudioError(true)}
            preload="metadata"
          />

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {!isPlaying ? (
                <button
                  onClick={handlePlay}
                  disabled={audioError}
                  className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  재생
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="flex items-center gap-1 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                  일시정지
                </button>
              )}

              <button
                onClick={goPrevChapter}
                disabled={selectedBook?.id === 1 && selectedChapter === 1}
                className="px-3 py-2 text-sm bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-30"
              >
                ← 이전
              </button>
              <button
                onClick={goNextChapter}
                disabled={
                  selectedBook?.id === 66 &&
                  selectedChapter === selectedBook?.totalChapters
                }
                className="px-3 py-2 text-sm bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-30"
              >
                다음 →
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-600">속도:</label>
                <select
                  value={playbackRate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  className="text-xs border rounded px-1 py-1"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={0.75}>0.75x</option>
                  <option value={1.0}>1.0x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2.0}>2.0x</option>
                </select>
              </div>
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                  className="rounded"
                />
                자동 넘김
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verseSync}
                  onChange={(e) => {
                    setVerseSync(e.target.checked);
                    if (!e.target.checked) setActiveVerse(null);
                  }}
                  className="rounded"
                />
                절 표시
                {verseTimes.length > 0 && (
                  <span className="text-[10px]">
                    {(() => {
                      const manual = verseTimes.filter((v) => v.manuallyAdjusted).length;
                      const auto = verseTimes.length - manual;
                      return (
                        <>
                          (<span className="text-emerald-600">{verseTimes.length}건</span>
                          {auto > 0 && (
                            <span className="text-gray-500"> · 자동 {auto}</span>
                          )}
                          {manual > 0 && (
                            <span className="text-amber-700"> · 수동 {manual}</span>
                          )}
                          )
                        </>
                      );
                    })()}
                  </span>
                )}
              </label>
              {isAdmin && (
                <label className="flex items-center gap-1 text-xs text-amber-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editMode}
                    onChange={(e) => setEditMode(e.target.checked)}
                    className="rounded"
                  />
                  싱크 편집
                </label>
              )}
              {!audioError && selectedBook && (
                <a
                  href={`/api/bible/audio/${selectedBook.id}/${selectedChapter}?dl=1`}
                  download={`${selectedBook.name}_${selectedChapter}장.mp3`}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                  title="음성 파일 다운로드"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  저장
                </a>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-gray-500 w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1.5 accent-blue-600"
            />
            <span className="text-xs text-gray-500 w-10">
              {formatTime(duration)}
            </span>
          </div>

          {/* 절-시간 편집 패널 (관리자 + 편집 모드) */}
          {isAdmin && editMode && (
            <div className="mt-3 p-3 border border-amber-200 bg-amber-50 rounded-lg space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs font-bold text-amber-900">싱크 편집</div>
                <button
                  onClick={autoDistributeVerseTimes}
                  disabled={!duration || verses.length === 0}
                  className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
                  title="이 장의 모든 절을 글자 수 비율로 자동 분할해 일괄 저장 (이후 진행바로 미세 조정)"
                >
                  이 장 자동 분할 저장 ({verses.length}절)
                </button>
              </div>
              <div className="text-[11px] text-amber-700">
                ① 위 버튼으로 장 단위 자동 분할 저장 (대략적 시작 시간 채움)<br />
                ② 진행바를 절 시작 위치로 옮기고 아래 절 번호 선택 → 미세 조정 저장
              </div>
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-xs text-gray-700">
                  현재 위치: <strong className="font-mono">{formatTime(currentTime)}</strong>
                  <span className="text-gray-400 ml-1">({currentTime.toFixed(1)}초)</span>
                </span>
                <select
                  value={editVerse}
                  onChange={(e) => setEditVerse(Number(e.target.value))}
                  className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white"
                >
                  {verses.map((v) => (
                    <option key={v.verse} value={v.verse}>
                      {v.verse}절
                    </option>
                  ))}
                </select>
                <button
                  onClick={saveVerseTime}
                  className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
                >
                  이 시각을 {editVerse}절 시작으로 저장
                </button>
                {verseTimes.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!selectedBook) return;
                      if (!confirm(`이 장의 모든 절-시간 매핑(${verseTimes.length}건) 을 삭제할까요?`)) return;
                      const res = await fetch(
                        `/api/bible/${selectedBook.id}/${selectedChapter}/verse-times?verse=all`,
                        { method: "DELETE" }
                      );
                      if (res.ok) {
                        setVerseTimes([]);
                        setEditMsg("이 장 전체 매핑 삭제됨");
                      }
                    }}
                    className="px-2 py-1 text-xs text-red-600 hover:underline ml-auto"
                  >
                    이 장 전체 초기화
                  </button>
                )}
              </div>
              {editMsg && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                  {editMsg}
                </div>
              )}
              {/* 저장된 매핑 목록 — collapse 가능 (default 닫힘 — 본문 가리지 않게) */}
              {verseTimes.length > 0 ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowMapping((s) => !s)}
                    className="w-full flex items-center justify-between px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 rounded border border-amber-200"
                  >
                    <span className="font-medium">
                      저장된 매핑 ({verseTimes.length}건)
                    </span>
                    <span className="font-mono">{showMapping ? "▲ 접기" : "▼ 펼치기"}</span>
                  </button>
                  {showMapping && (
                    <div className="max-h-32 overflow-y-auto bg-white rounded-b border-x border-b border-amber-200">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-gray-600">
                        <th className="px-2 py-1 text-left font-medium w-12">절</th>
                        <th className="px-2 py-1 text-left font-medium">시작</th>
                        <th className="px-2 py-1 text-center font-medium w-12">상태</th>
                        <th className="px-2 py-1 text-right font-medium w-24">동작</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verseTimes.map((vt) => (
                        <tr key={vt.verse} className="border-t border-gray-100 hover:bg-amber-50">
                          <td className="px-2 py-1 font-mono">{vt.verse}</td>
                          <td className="px-2 py-1">
                            <button
                              onClick={() => seekToVerseTime(vt.startSec)}
                              className="font-mono text-blue-600 hover:underline"
                              title="이 위치로 이동"
                            >
                              {formatTime(vt.startSec)}
                            </button>
                            <span className="text-gray-400 ml-1">
                              ({vt.startSec.toFixed(1)}초)
                            </span>
                          </td>
                          <td className="px-2 py-1 text-center">
                            {vt.manuallyAdjusted ? (
                              <span className="inline-block px-1.5 py-px text-[10px] bg-amber-100 text-amber-800 rounded font-bold">수동</span>
                            ) : (
                              <span className="inline-block px-1.5 py-px text-[10px] bg-gray-100 text-gray-500 rounded">자동</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-right space-x-1">
                            <button
                              onClick={() => {
                                setEditVerse(vt.verse);
                                seekToVerseTime(vt.startSec);
                              }}
                              className="text-[11px] text-gray-500 hover:underline"
                            >
                              편집
                            </button>
                            <button
                              onClick={() => deleteVerseTime(vt.verse)}
                              className="text-[11px] text-red-500 hover:underline"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-gray-500">저장된 매핑이 없습니다.</div>
              )}
            </div>
          )}

          {selectedBook && (
            <div className="mt-1 text-xs text-gray-500 flex items-center justify-between">
              <span>
                {selectedBook.name} {selectedChapter}장
              </span>
              {audioError && (
                <span className="text-red-500">음성 파일이 없습니다</span>
              )}
            </div>
          )}
        </div>

      {/* 이전/다음 장 네비게이션 */}
      <div className="flex justify-between items-center mb-3">
        <button
          onClick={goPrevChapter}
          disabled={selectedBook?.id === 1 && selectedChapter === 1}
          className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30"
        >
          ← 이전 장
        </button>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">
            {selectedBook?.name} {selectedChapter}장
          </span>

        </div>
        <button
          onClick={goNextChapter}
          disabled={
            selectedBook?.id === 66 &&
            selectedChapter === selectedBook?.totalChapters
          }
          className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30"
        >
          다음 장 →
        </button>
      </div>

      {/* 본문 */}
      <div className="bg-white border rounded-lg p-4">
        {loading ? (
          <div className="text-center py-10 text-gray-400">로딩 중...</div>
        ) : verses.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            본문을 불러올 수 없습니다
          </div>
        ) : (
          <div className="space-y-1">
            {verses.map((verse) => {
              const isActive = activeVerse === verse.verse;
              return (
                <div
                  key={verse.verse}
                  ref={isActive ? (el) => { el?.scrollIntoView({ behavior: "smooth", block: "center" }); } : undefined}
                  className={`flex gap-2 p-2 rounded transition-colors ${
                    isActive
                      ? "bg-blue-50 ring-1 ring-blue-300"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <span className={`font-bold text-sm min-w-[2rem] text-right flex-shrink-0 ${
                    isActive ? "text-blue-700" : "text-blue-500"
                  }`}>
                    {verse.verse}
                  </span>
                  <span className={`leading-relaxed text-[15px] ${
                    isActive ? "text-blue-900 font-medium" : "text-gray-800"
                  }`}>
                    {highlightWord
                      ? renderHighlighted(verse.content, highlightWord)
                      : verse.content}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 하이라이트 해제 */}
      {highlightWord && (
        <div className="mt-2 text-center">
          <button
            onClick={() => setHighlightWord("")}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            하이라이트 해제
          </button>
        </div>
      )}

      {/* 하단 네비게이션 */}
      <div className="flex justify-between items-center mt-4 mb-8">
        <button
          onClick={goPrevChapter}
          disabled={selectedBook?.id === 1 && selectedChapter === 1}
          className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30"
        >
          ← 이전 장
        </button>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
        >
          ↑ 맨 위로
        </button>
        <button
          onClick={goNextChapter}
          disabled={
            selectedBook?.id === 66 &&
            selectedChapter === selectedBook?.totalChapters
          }
          className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30"
        >
          다음 장 →
        </button>
      </div>

      {/* 원고지 설정 모달 */}
      {showManuscriptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] mx-2 p-4 h-[98vh] overflow-hidden flex flex-col">
            <h3 className="text-base font-bold text-gray-800 mb-2 shrink-0">원고지 출력 설정</h3>
            <div className="flex gap-4 min-h-0 flex-1">
            {/* 왼쪽: 옵션 패널 */}
            <div className="w-[38%] shrink-0 overflow-y-auto pr-2 space-y-2">

            {/* 폰트 선택 */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">글꼴</label>
              <select
                value={msFont}
                onChange={(e) => setMsFont(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <optgroup label="시스템 글꼴">
                  <option value="batang">바탕체</option>
                  <option value="dotum">돋움체</option>
                  <option value="gulim">굴림체</option>
                  <option value="gungsuh">궁서체</option>
                </optgroup>
                <optgroup label="나눔 글꼴">
                  <option value="nanummyeongjo">나눔명조</option>
                  <option value="nanumgothic">나눔고딕</option>
                  <option value="nanumpen">나눔손글씨 펜</option>
                  <option value="nanumbrush">나눔손글씨 붓</option>
                  <option value="nanumbarungothic">나눔고딕 코딩</option>
                </optgroup>
                <optgroup label="고운 글꼴">
                  <option value="gowunbatang">고운 바탕</option>
                  <option value="gowundodum">고운 돋움</option>
                </optgroup>
                <optgroup label="본고딕/명조 (Noto)">
                  <option value="notosanskr">Noto Sans KR (본고딕)</option>
                  <option value="notoserifkr">Noto Serif KR (본명조)</option>
                </optgroup>
                <optgroup label="기타">
                  <option value="ibmplexsanskr">IBM Plex Sans KR</option>
                  <option value="poorstory">Poor Story</option>
                  <option value="singleday">Single Day</option>
                  <option value="jua">주아</option>
                  <option value="gamjaflower">감자꽃</option>
                  <option value="dongle">동글</option>
                </optgroup>
              </select>
            </div>

            {/* 글씨 크기 */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">
                글씨 크기: <strong>{msFontSize === 0 ? "자동 (칸의 70%)" : `${msFontSize}pt`}</strong>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={36}
                  step={1}
                  value={msFontSize}
                  onChange={(e) => setMsFontSize(parseInt(e.target.value))}
                  className="flex-1 accent-amber-500"
                />
                <button
                  onClick={() => setMsFontSize(0)}
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                    msFontSize === 0
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  자동
                </button>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>자동</span>
                <span>36pt</span>
              </div>
            </div>

            {/* 용지 크기 */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">용지 크기</label>
              <div className="flex gap-2">
                {(["A4", "B5", "A5", "Letter"] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setMsPaperSize(size)}
                    className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                      msPaperSize === size
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* 용지 방향 */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">용지 방향</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMsOrientation("portrait")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border transition-colors ${
                    msOrientation === "portrait"
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className="inline-block w-3 h-4 border border-current"></span> 세로
                </button>
                <button
                  onClick={() => setMsOrientation("landscape")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border transition-colors ${
                    msOrientation === "landscape"
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className="inline-block w-4 h-3 border border-current"></span> 가로
                </button>
              </div>
            </div>

            {/* 칸수 지정 */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">칸수</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">가로</span>
                  <input
                    type="number"
                    min={5}
                    max={40}
                    value={msCols}
                    onChange={(e) => setMsCols(parseInt(e.target.value) || 0)}
                    onBlur={() => setMsCols((v) => Math.max(5, Math.min(40, v || 20)))}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <span className="text-xs text-gray-400">칸</span>
                </div>
                <span className="text-gray-400">x</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">세로</span>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={msRows}
                    onChange={(e) => setMsRows(parseInt(e.target.value) || 0)}
                    onBlur={() => setMsRows((v) => Math.max(3, Math.min(30, v || 10)))}
                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <span className="text-xs text-gray-400">칸</span>
                </div>
              </div>
              {(() => {
                const sizes: Record<string, [number, number]> = {
                  A4: [210, 297], B5: [176, 250], A5: [148, 210], Letter: [216, 279],
                };
                const [w2, h2] = sizes[msPaperSize];
                const pw3 = (msOrientation === "portrait" ? w2 : h2) - 30;
                const ph3 = (msOrientation === "portrait" ? h2 : w2) - 30 - 12;
                const cw = pw3 / msCols;
                const ch = ph3 / msRows;
                const cmm = Math.min(cw, ch);
                return (
                  <div className="text-xs text-gray-400 mt-1">
                    칸 크기: {cmm.toFixed(1)}mm x {cmm.toFixed(1)}mm
                  </div>
                );
              })()}
            </div>

            {/* 안내선 유형 */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">안내선</label>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ["cross", "십자"],
                  ["crossbox", "십자+네모"],
                  ["crossdiamond", "십자+마름모"],
                  ["none", "없음"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMsGuide(key)}
                    className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                      msGuide === key
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 출력 모드 */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">출력 모드</label>
              <div className="space-y-1">
                <label className="flex items-start gap-1.5 px-2 py-1 rounded border cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="msMode"
                    value="normal"
                    checked={msMode === "normal"}
                    onChange={() => setMsMode("normal")}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <div className="text-xs font-medium">기본 출력</div>
                    <div className="text-[10px] text-gray-500 leading-tight">본문을 원고지에 채워서 출력</div>
                  </div>
                </label>
                <label className="flex items-start gap-1.5 px-2 py-1 rounded border cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="msMode"
                    value="copy"
                    checked={msMode === "copy"}
                    onChange={() => setMsMode("copy")}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <div className="text-xs font-medium">따라쓰기 (본문+빈줄)</div>
                    <div className="text-[10px] text-gray-500 leading-tight">본문 한 줄 + 빈 줄 교대 배치</div>
                  </div>
                </label>
                <label className="flex items-start gap-1.5 px-2 py-1 rounded border cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="msMode"
                    value="tracing"
                    checked={msMode === "tracing"}
                    onChange={() => setMsMode("tracing")}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <div className="text-xs font-medium">덧쓰기 (연한 글씨)</div>
                    <div className="text-[10px] text-gray-500 leading-tight">연한 색으로 출력, 위에 따라 쓰기</div>
                  </div>
                </label>
                <label className="flex items-start gap-1.5 px-2 py-1 rounded border cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="msMode"
                    value="copytracing"
                    checked={msMode === "copytracing"}
                    onChange={() => setMsMode("copytracing")}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <div className="text-xs font-medium">따라쓰기+덧쓰기</div>
                    <div className="text-[10px] text-gray-500 leading-tight">검은 본문 줄 + 연한 글씨 줄 교대 배치</div>
                  </div>
                </label>
              </div>
            </div>

            {/* 출력 범위 */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-0.5">출력 범위</label>
              {/* 시작 */}
              <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                <span className="text-xs text-amber-600 font-semibold w-8">시작</span>
                <select value={msFromBookId} onChange={(e) => { setMsFromBookId(Number(e.target.value)); setMsFromChapter(1); setMsFromVerse(1); }}
                  className="border border-gray-300 rounded px-1.5 py-1 text-xs flex-1 min-w-0">
                  {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={msFromChapter} onChange={(e) => { setMsFromChapter(Number(e.target.value)); setMsFromVerse(1); }}
                  className="border border-gray-300 rounded px-1.5 py-1 text-xs w-16">
                  {Array.from({ length: books.find((b) => b.id === msFromBookId)?.totalChapters || 1 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}장</option>
                  ))}
                </select>
                <input type="number" min={1} value={msFromVerse} onChange={(e) => setMsFromVerse(Math.max(1, Number(e.target.value) || 1))}
                  className="border border-gray-300 rounded px-1.5 py-1 text-xs w-14 text-center" />
                <span className="text-xs text-gray-400">절</span>
              </div>
              {/* 끝 */}
              <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                <span className="text-xs text-amber-600 font-semibold w-8">끝</span>
                <select value={msToBookId} onChange={(e) => { setMsToBookId(Number(e.target.value)); setMsToChapter(1); setMsToVerse(0); }}
                  className="border border-gray-300 rounded px-1.5 py-1 text-xs flex-1 min-w-0">
                  {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={msToChapter} onChange={(e) => { setMsToChapter(Number(e.target.value)); setMsToVerse(0); }}
                  className="border border-gray-300 rounded px-1.5 py-1 text-xs w-16">
                  {Array.from({ length: books.find((b) => b.id === msToBookId)?.totalChapters || 1 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}장</option>
                  ))}
                </select>
                <input type="number" min={0} value={msToVerse} onChange={(e) => setMsToVerse(Math.max(0, Number(e.target.value) || 0))}
                  className="border border-gray-300 rounded px-1.5 py-1 text-xs w-14 text-center" placeholder="끝" />
                <span className="text-xs text-gray-400">절</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={fetchMsVerses} disabled={msVersesLoading}
                  className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50 transition-colors">
                  {msVersesLoading ? "불러오는 중..." : "범위 적용"}
                </button>
                <span className="text-xs text-gray-500">
                  {msVersesLoading ? "" : msVerses.length > 0 ? `${msVerses.length}절 로드됨` : ""}
                </span>
              </div>
            </div>

            </div>{/* 왼쪽 옵션 패널 끝 */}

            {/* 오른쪽: 미리보기 패널 */}
            <div className="flex-1 flex flex-col min-h-0">
            {/* 미리보기 */}
            {(() => {
              const isCopyLikeP = msMode === "copy" || msMode === "copytracing";
              const textRows = isCopyLikeP ? Math.floor(msRows / 2) : msRows;
              const charsPerPage = msCols * textRows;
              const fullTextP = msVerses.map(v => v.text).join(" ");
              const charsP = [...fullTextP];
              const totalPages = Math.max(1, Math.ceil(charsP.length / charsPerPage));
              const page1 = charsP.slice(0, charsPerPage);

              // 용지 실제 크기 (mm)
              const psizes: Record<string, [number, number]> = {
                A4: [210, 297], B5: [176, 250], A5: [148, 210], Letter: [216, 279],
              };
              const [pw2, ph2] = psizes[msPaperSize];
              const paperWmm = msOrientation === "portrait" ? pw2 : ph2;
              const paperHmm = msOrientation === "portrait" ? ph2 : pw2;
              const marginMm = 15;
              const titleHmm = 12;
              const printWmm = paperWmm - marginMm * 2;
              const printHmm = paperHmm - marginMm * 2 - titleHmm;

              // 실제 셀 크기 (mm)
              const realCellW = printWmm / msCols;
              const realCellH = printHmm / msRows;
              const realCellMm = Math.min(realCellW, realCellH);
              const gridWmm = realCellMm * msCols;
              const gridHmm = realCellMm * msRows;

              // 미리보기 스케일 (패널 크기에 맞춰 최대한 크게)
              const previewMaxW = 600;
              const previewMaxH = 700;
              const scaleW = previewMaxW / paperWmm;
              const scaleH = previewMaxH / paperHmm;
              const scale = Math.min(scaleW, scaleH);

              // 폰트 매핑 (미리보기용)
              const pvFontDefs: Record<string, { family: string; import?: string }> = {
                batang: { family: '"Batang", "바탕", serif' },
                dotum: { family: '"Dotum", "돋움", sans-serif' },
                gulim: { family: '"Gulim", "굴림", sans-serif' },
                gungsuh: { family: '"Gungsuh", "궁서", serif' },
                nanummyeongjo: { family: '"Nanum Myeongjo", serif', import: "Nanum+Myeongjo" },
                nanumgothic: { family: '"Nanum Gothic", sans-serif', import: "Nanum+Gothic" },
                nanumpen: { family: '"Nanum Pen Script", cursive', import: "Nanum+Pen+Script" },
                nanumbrush: { family: '"Nanum Brush Script", cursive', import: "Nanum+Brush+Script" },
                nanumbarungothic: { family: '"Nanum Gothic Coding", monospace', import: "Nanum+Gothic+Coding" },
                gowunbatang: { family: '"Gowun Batang", serif', import: "Gowun+Batang" },
                gowundodum: { family: '"Gowun Dodum", sans-serif', import: "Gowun+Dodum" },
                ibmplexsanskr: { family: '"IBM Plex Sans KR", sans-serif', import: "IBM+Plex+Sans+KR" },
                notosanskr: { family: '"Noto Sans KR", sans-serif', import: "Noto+Sans+KR" },
                notoserifkr: { family: '"Noto Serif KR", serif', import: "Noto+Serif+KR" },
                poorstory: { family: '"Poor Story", cursive', import: "Poor+Story" },
                singleday: { family: '"Single Day", cursive', import: "Single+Day" },
                jua: { family: '"Jua", sans-serif', import: "Jua" },
                gamjaflower: { family: '"Gamja Flower", cursive', import: "Gamja+Flower" },
                dongle: { family: '"Dongle", sans-serif', import: "Dongle" },
              };
              const pvFd = pvFontDefs[msFont] || pvFontDefs.batang;
              const pvFontFamily = pvFd.family;
              const pvFontImportUrl = pvFd.import
                ? `https://fonts.googleapis.com/css2?family=${pvFd.import}&display=swap`
                : "";

              const pvPaperW = paperWmm * scale;
              const pvPaperH = paperHmm * scale;
              const pvMargin = marginMm * scale;
              const pvTitleH = titleHmm * scale;
              const pvGridW = gridWmm * scale;
              const pvGridH = gridHmm * scale;
              const pvCell = realCellMm * scale;
              const fsPx = Math.max(4, Math.min(14, Math.round(pvCell * 0.6)));

              // 그리드를 인쇄영역 안에서 중앙 정렬
              const printAreaW = printWmm * scale;
              const printAreaH = printHmm * scale;
              const gridOffsetX = pvMargin + (printAreaW - pvGridW) / 2;
              const gridOffsetY = pvMargin + pvTitleH + (printAreaH - pvGridH) / 2;

              const isTracingP = msMode === "tracing";
              const textColorP = isTracingP ? "#ccc" : "#333";

              // 그리드 셀 생성
              const cells: { ch: string; gray?: boolean }[] = [];
              if (isCopyLikeP) {
                let ci = 0;
                for (let r = 0; r < msRows; r++) {
                  const isTextRow = r % 2 === 0;
                  const isGrayRow = !isTextRow && msMode === "copytracing";
                  for (let c = 0; c < msCols; c++) {
                    if (isTextRow && ci < page1.length) {
                      cells.push({ ch: page1[ci++] });
                    } else if (isGrayRow) {
                      const srcIdx = Math.floor(r / 2) * msCols + c;
                      cells.push({ ch: srcIdx < page1.length ? page1[srcIdx] : "", gray: true });
                    } else {
                      cells.push({ ch: "" });
                      if (isTextRow) ci++;
                    }
                  }
                }
              } else {
                for (let i = 0; i < msCols * msRows; i++) {
                  cells.push({ ch: page1[i] || "" });
                }
              }

              const midRowP = Math.floor(msRows / 2);

              return (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <label className="text-sm font-medium text-gray-700">미리보기</label>
                    <span className="text-xs text-gray-500">
                      {msPaperSize} {msOrientation === "portrait" ? "세로" : "가로"} / {msCols}x{msRows} / {charsPerPage}자 / {totalPages}p / {msVerses.length}절
                    </span>
                  </div>
                  <div className="bg-gray-100 rounded-lg flex justify-center items-center overflow-auto flex-1 min-h-0 p-3">
                    {/* 웹폰트 로드 */}
                    {pvFontImportUrl && (
                      // eslint-disable-next-line @next/next/no-page-custom-font
                      <link rel="stylesheet" href={pvFontImportUrl} />
                    )}
                    {/* 용지 */}
                    <div
                      style={{
                        width: pvPaperW,
                        height: pvPaperH,
                        background: "white",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                        borderRadius: 2,
                        position: "relative",
                        flexShrink: 0,
                      }}
                    >
                      {/* 여백 표시 점선 */}
                      <div style={{
                        position: "absolute",
                        left: pvMargin, top: pvMargin,
                        width: pvPaperW - pvMargin * 2, height: pvPaperH - pvMargin * 2,
                        border: "1px dashed #e0e0e0",
                        pointerEvents: "none",
                      }} />
                      {/* 제목 영역 */}
                      <div style={{
                        position: "absolute",
                        left: pvMargin, top: pvMargin,
                        width: pvPaperW - pvMargin * 2, height: pvTitleH,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: Math.max(6, Math.round(pvTitleH * 0.6)),
                        fontWeight: "bold", color: "#555",
                        borderBottom: "1px dashed #ddd",
                      }}>
                        {(() => {
                          const fb = books.find(b => b.id === msFromBookId);
                          const tb = books.find(b => b.id === msToBookId);
                          if (msFromBookId === msToBookId && msFromChapter === msToChapter) {
                            return `${fb?.name} ${msFromChapter}장`;
                          }
                          return `${fb?.shortName}${msFromChapter}장 ~ ${tb?.shortName}${msToChapter}장`;
                        })()}
                      </div>
                      {/* 원고지 그리드 */}
                      <div
                        style={{
                          position: "absolute",
                          left: gridOffsetX,
                          top: gridOffsetY,
                          display: "grid",
                          gridTemplateColumns: `repeat(${msCols}, ${pvCell}px)`,
                          gridTemplateRows: `repeat(${msRows}, ${pvCell}px)`,
                          borderTop: "2px solid #333",
                          fontFamily: pvFontFamily,
                          borderLeft: "2px solid #333",
                        }}
                      >
                        {cells.map((cell, idx) => {
                          const col = idx % msCols;
                          const row = Math.floor(idx / msCols);
                          const isRightEdge = col === msCols - 1;
                          const isBottomEdge = row === msRows - 1;
                          const isMidRow = row === midRowP;
                          return (
                            <div
                              key={idx}
                              style={{
                                width: pvCell,
                                height: pvCell,
                                borderRight: isRightEdge ? "2px solid #333" : "1px solid #bbb",
                                borderBottom: isBottomEdge ? "2px solid #333" : "1px solid #bbb",
                                borderTop: isMidRow ? "2px solid #333" : undefined,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: fsPx,
                                lineHeight: 1,
                                color: cell.gray ? "#ccc" : textColorP,
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              {msGuide !== "none" && (
                                <>
                                  <span style={{
                                    position: "absolute", top: "50%", left: 0, right: 0,
                                    borderTop: "1px dashed #e5e5e5",
                                  }} />
                                  <span style={{
                                    position: "absolute", left: "50%", top: 0, bottom: 0,
                                    borderLeft: "1px dashed #e5e5e5",
                                  }} />
                                </>
                              )}
                              {msGuide === "crossbox" && (
                                <span style={{
                                  position: "absolute", inset: "15%",
                                  border: "1px dashed #ececec",
                                }} />
                              )}
                              {msGuide === "crossdiamond" && (
                                <span style={{
                                  position: "absolute", top: "50%", left: "50%",
                                  width: "60%", height: "60%",
                                  border: "1px dashed #ececec",
                                  transform: "translate(-50%,-50%) rotate(45deg)",
                                }} />
                              )}
                              <span style={{ position: "relative", zIndex: 1 }}>{cell.ch}</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* 용지 크기 라벨 */}
                      <div style={{
                        position: "absolute", bottom: 3, right: 6,
                        fontSize: 8, color: "#bbb",
                      }}>
                        {msPaperSize} {paperWmm}x{paperHmm}mm
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 버튼 */}
            <div className="flex justify-end gap-2 pt-2 shrink-0">
              <button
                onClick={() => setShowManuscriptModal(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleManuscriptPrint}
                className="px-4 py-2 text-sm text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors font-medium"
              >
                출력하기
              </button>
            </div>
            </div>{/* 오른쪽 미리보기 패널 끝 */}
            </div>{/* flex 컨테이너 끝 */}
          </div>
        </div>
      )}
    </div>
  );
}
