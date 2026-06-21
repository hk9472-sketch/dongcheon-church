"use client";

import { useEffect, useRef, useState } from "react";
import HelpButton from "@/components/HelpButton";

// 한 행에 여러 연보 종류 동시 입력. 빈 칸(0)은 저장 안 함.
// 종류별로 OfferingEntry 1건씩 분할 저장.
const TYPES = [
  { key: "주일연보", label: "주일" },
  { key: "십일조연보", label: "십일조" },
  { key: "감사연보", label: "감사" },
  { key: "특별연보", label: "특별" },
  { key: "오일연보", label: "오일" },
  { key: "절기연보", label: "절기" },
] as const;

type RowStatus = "dirty" | "saving" | "saved" | "error";

interface Row {
  memberNo: string;
  amounts: Record<string, string>;       // TYPES.key → 입력 문자열
  savedIds: Record<string, number>;      // TYPES.key → OfferingEntry.id (저장 후 보관, 수정/삭제용)
  description: string;
  status: RowStatus;
  message?: string;
}

function todayStr(): string {
  const d = new Date();
  const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return k.toISOString().slice(0, 10);
}

function blankRow(): Row {
  return {
    memberNo: "",
    amounts: Object.fromEntries(TYPES.map((t) => [t.key, ""])),
    savedIds: {},
    description: "",
    status: "dirty",
  };
}

export default function MultiOfferingEntryPage() {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [error, setError] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  // 복구 가능한 임시 draft — mount 시 자동 적용하지 않고 배너로 안내 (잔재 혼선 방지)
  const [pendingDraft, setPendingDraft] = useState<{ date: string; rows: Row[] } | null>(null);
  const [loading, setLoading] = useState(false); // 불러오기 중
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"member" | "input">("member");
  // 셀 참조: cellRefs[row][col] — col 0 = memberNo, 1~6 = 6개 종류 금액, 7 = 비고
  const cellRefs = useRef<Array<Array<HTMLInputElement | null>>>([]);
  const COLS_PER_ROW = 1 + TYPES.length + 1; // = 8
  // saveAll 진행 중에는 자동 행 추가·포커스 이동을 막아 흐름이 깨지지 않게 함
  const savingAllRef = useRef(false);
  // 페이지 리프레시 보호 — rows 를 localStorage 에 자동 저장
  const STORAGE_KEY = "multiEntry.draft.v1";
  const restoredRef = useRef(false);

  // 1) mount 시 — 자동 복원하지 않음. 의미있는 draft 가 있으면 배너로 복구 여부를 묻는다.
  //    (이전에는 무조건 복원해 새 탭/재방문마다 옛 입력 잔재가 떠 혼선을 줬음)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { date?: string; rows?: Row[] } | null;
        if (data && Array.isArray(data.rows) && data.rows.length > 0) {
          const meaningful = data.rows.some(
            (r) =>
              (r.memberNo || "").trim() !== "" ||
              TYPES.some((t) => (parseInt(r.amounts?.[t.key] || "0", 10) || 0) > 0),
          );
          if (meaningful) {
            // F5 새로고침 vs 처음 진입 구별 — Navigation Timing API.
            //  · reload(F5) → 작업 보존 위해 자동 복원
            //  · navigate/back_forward(처음 진입·새 탭·링크) → 깨끗하게 시작 + 배너로 복구 선택권
            const navEntry = performance.getEntriesByType("navigation")[0] as
              | PerformanceNavigationTiming
              | undefined;
            const isReload =
              navEntry?.type === "reload" ||
              // 구형 브라우저 fallback (deprecated)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (performance as any).navigation?.type === 1;
            if (isReload) {
              setDate(data.date || todayStr());
              setRows(data.rows);
            } else {
              setPendingDraft({ date: data.date || todayStr(), rows: data.rows });
            }
          }
        }
      }
    } catch {
      /* ignore */
    } finally {
      restoredRef.current = true;
    }
  }, []);

  // 2) rows 또는 date 변경 시 localStorage 에 저장 (디바운스 500ms)
  //    복구 배너가 떠 있는 동안엔 draft 를 건드리지 않음 (사용자 결정 전까지 보존)
  useEffect(() => {
    if (!restoredRef.current || pendingDraft) return;
    const t = setTimeout(() => {
      try {
        // 모든 행이 비어있거나 saved 만 있으면 draft 비우기
        const hasDraft = rows.some(
          (r) =>
            r.status === "dirty" ||
            r.status === "error" ||
            r.memberNo.trim() !== "" ||
            TYPES.some((t) => (parseInt(r.amounts[t.key] || "0", 10) || 0) > 0),
        );
        if (hasDraft) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ date, rows }));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [rows, date, pendingDraft]);

  // 3) dirty 데이터 있을 때 페이지 이탈 경고
  useEffect(() => {
    const hasDirty = rows.some((r) => r.status === "dirty" || r.status === "error");
    if (!hasDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [rows]);

  const update = (idx: number, patch: Partial<Row>) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch, status: "dirty" };
      return next;
    });
  };

  const updateAmount = (idx: number, key: string, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        amounts: { ...next[idx].amounts, [key]: value.replace(/[^\d]/g, "") },
        status: "dirty",
      };
      return next;
    });
  };

  const saveRow = async (idx: number) => {
    const r = rows[idx];
    const noTrim = r.memberNo.trim();
    const memberId = noTrim ? parseInt(noTrim, 10) : null;
    const memberIdForBody =
      memberId !== null && Number.isFinite(memberId) ? memberId : null;

    // 종류별로 (id 있음/없음) × (금액 > 0 / = 0) 4 분기 분류
    const toCreate: { offeringType: string; amount: number }[] = [];
    const toUpdate: { id: number; offeringType: string; amount: number }[] = [];
    const toDelete: { id: number; offeringType: string }[] = [];
    for (const t of TYPES) {
      const amt = parseInt(r.amounts[t.key] || "0", 10) || 0;
      const existingId = r.savedIds[t.key];
      if (existingId && amt > 0) {
        toUpdate.push({ id: existingId, offeringType: t.key, amount: amt });
      } else if (existingId && amt === 0) {
        toDelete.push({ id: existingId, offeringType: t.key });
      } else if (!existingId && amt > 0) {
        toCreate.push({ offeringType: t.key, amount: amt });
      }
      // 그 외(!existingId && amt===0): no-op
    }

    if (toCreate.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
      setRows((p) => {
        const n = [...p];
        n[idx] = { ...n[idx], status: "error", message: "변경된 항목 없음" };
        return n;
      });
      return;
    }

    setRows((p) => {
      const n = [...p];
      n[idx] = { ...n[idx], status: "saving", message: undefined };
      return n;
    });

    try {
      const newIds: Record<string, number> = { ...r.savedIds };

      // 1) DELETE
      for (const d of toDelete) {
        const res = await fetch(`/api/accounting/offering/entries/${d.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `${d.offeringType} 삭제 실패`);
        }
        delete newIds[d.offeringType];
      }

      // 2) UPDATE
      for (const u of toUpdate) {
        const res = await fetch(`/api/accounting/offering/entries/${u.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            memberId: memberIdForBody,
            offeringType: u.offeringType,
            amount: u.amount,
            // 비고(내역)는 감사연보에만 기록
            description: u.offeringType === "감사연보" ? r.description || null : null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `${u.offeringType} 수정 실패`);
        }
      }

      // 3) CREATE — 배치
      if (toCreate.length > 0) {
        const res = await fetch("/api/accounting/offering/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            entries: toCreate.map((c) => ({
              date,
              memberId: memberIdForBody,
              offeringType: c.offeringType,
              amount: c.amount,
              // 비고(내역)는 감사연보에만 기록
              description: c.offeringType === "감사연보" ? r.description || null : null,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "저장 실패");
        // 응답의 entries 배열에서 id 매핑
        const createdArr: Array<{ id: number; offeringType: string }> =
          data.entries || [];
        for (const c of createdArr) {
          if (c.id && c.offeringType) newIds[c.offeringType] = c.id;
        }
      }

      const summary = [
        toCreate.length > 0 ? `신규 ${toCreate.length}` : null,
        toUpdate.length > 0 ? `수정 ${toUpdate.length}` : null,
        toDelete.length > 0 ? `삭제 ${toDelete.length}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      setRows((p) => {
        const n = [...p];
        n[idx] = {
          ...n[idx],
          savedIds: newIds,
          status: "saved",
          message: summary || "저장됨",
        };
        if (!savingAllRef.current && idx === n.length - 1) n.push(blankRow());
        return n;
      });
      if (!savingAllRef.current) {
        setTimeout(() => {
          cellRefs.current[idx + 1]?.[0]?.focus();
          cellRefs.current[idx + 1]?.[0]?.select();
        }, 0);
      }
    } catch (e) {
      setRows((p) => {
        const n = [...p];
        n[idx] = {
          ...n[idx],
          status: "error",
          message: e instanceof Error ? e.message : "저장 실패",
        };
        return n;
      });
    }
  };

  /**
   * 전체 저장 — 데이터셋 단위 단일 트랜잭션.
   * 모든 dirty/error 행의 (신규/수정/삭제) 를 한 번의 POST /bulk 호출로 보냄.
   * 서버는 prisma.$transaction 안에서 처리 → 한 건이라도 실패하면 전체 롤백.
   * 즉 \"중간 실패로 부분 저장된 상태\" 가 생기지 않음.
   */
  const saveAll = async () => {
    setSavingAll(true);
    savingAllRef.current = true;
    setError(null);
    try {
      const createPlan: {
        rowIdx: number;
        memberId: number | null;
        offeringType: string;
        amount: number;
        description: string | null;
      }[] = [];
      const updatePlan: {
        rowIdx: number;
        id: number;
        memberId: number | null;
        offeringType: string;
        amount: number;
        description: string | null;
      }[] = [];
      const deletePlan: { rowIdx: number; offeringType: string; id: number }[] = [];

      rows.forEach((r, idx) => {
        if (r.status !== "dirty" && r.status !== "error") return;
        const noTrim = r.memberNo.trim();
        const memId = noTrim ? parseInt(noTrim, 10) : null;
        const memberId =
          memId !== null && Number.isFinite(memId) ? memId : null;
        for (const t of TYPES) {
          const amt = parseInt(r.amounts[t.key] || "0", 10) || 0;
          const existingId = r.savedIds[t.key];
          if (existingId && amt > 0) {
            updatePlan.push({
              rowIdx: idx,
              id: existingId,
              memberId,
              offeringType: t.key,
              amount: amt,
              description: t.key === "감사연보" ? r.description || null : null,
            });
          } else if (existingId && amt === 0) {
            deletePlan.push({ rowIdx: idx, offeringType: t.key, id: existingId });
          } else if (!existingId && amt > 0) {
            createPlan.push({
              rowIdx: idx,
              memberId,
              offeringType: t.key,
              amount: amt,
              description: t.key === "감사연보" ? r.description || null : null,
            });
          }
        }
      });

      if (createPlan.length + updatePlan.length + deletePlan.length === 0) {
        setError("저장할 변경 사항이 없습니다.");
        return;
      }

      const res = await fetch("/api/accounting/offering/entries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          creates: createPlan.map(({ rowIdx: _r, ...rest }) => {
            void _r;
            return rest;
          }),
          updates: updatePlan.map(({ rowIdx: _r, ...rest }) => {
            void _r;
            return rest;
          }),
          deletes: deletePlan.map((d) => d.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "저장 실패 (전체 롤백됨)");
      }

      // 성공: rows 갱신
      setRows((p) => {
        const next = p.map((r) => ({ ...r, savedIds: { ...r.savedIds } }));
        const created: Array<{ id: number; offeringType: string }> = data.creates || [];
        createPlan.forEach((cp, i) => {
          const row = next[cp.rowIdx];
          if (row && created[i]) {
            row.savedIds[created[i].offeringType] = created[i].id;
          }
        });
        deletePlan.forEach((dp) => {
          const row = next[dp.rowIdx];
          if (row) delete row.savedIds[dp.offeringType];
        });
        const touched = new Set<number>([
          ...createPlan.map((c) => c.rowIdx),
          ...updatePlan.map((u) => u.rowIdx),
          ...deletePlan.map((d) => d.rowIdx),
        ]);
        touched.forEach((idx) => {
          const row = next[idx];
          if (row) {
            row.status = "saved";
            row.message = "일괄 저장됨";
          }
        });
        if (next[next.length - 1]?.status === "saved") next.push(blankRow());
        return next;
      });

      setError(null);
      // localStorage draft 정리
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "저장 실패") +
          " — 모든 데이터는 그대로 보존됩니다. 다시 [전체 저장] 누르세요.",
      );
      // rows status 변경 없음 → 사용자가 입력한 데이터 그대로 dirty 유지
    } finally {
      savingAllRef.current = false;
      setSavingAll(false);
    }
  };

  // ============ 복구 배너 / 초기화 / 불러오기 ============

  // 복구 배너: 이전 임시 입력을 화면에 적용
  const recoverDraft = () => {
    if (!pendingDraft) return;
    setDate(pendingDraft.date);
    setRows(pendingDraft.rows.length > 0 ? pendingDraft.rows : [blankRow()]);
    setPendingDraft(null);
    setLoadMsg(null);
  };
  // 복구 배너: 임시 입력 버리고 깨끗하게 시작
  const discardDraft = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setPendingDraft(null);
  };

  // 화면 초기화 — DB 데이터는 건드리지 않고 입력 화면만 비움
  const resetScreen = () => {
    if (
      !confirm(
        "입력 화면을 초기화할까요?\n\n· 화면만 비웁니다. 이미 저장된 연보(초록색 행)는 DB 에 그대로 남습니다.\n· 아직 저장하지 않은 입력은 사라집니다.",
      )
    )
      return;
    setRows([blankRow()]);
    setDate(todayStr());
    setError(null);
    setLoadMsg(null);
    setPendingDraft(null);
    cellRefs.current = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  // 선택한 일자에 저장된 연보를 불러와 매트릭스로 펼침 (수정·삭제 가능)
  const loadByDate = async () => {
    const hasUnsaved = rows.some((r) => r.status === "dirty" || r.status === "error");
    if (
      hasUnsaved &&
      !confirm("저장하지 않은 입력이 있습니다.\n불러오면 현재 화면이 대체됩니다. 계속할까요?")
    )
      return;

    setLoading(true);
    setError(null);
    setLoadMsg(null);
    try {
      const res = await fetch(`/api/accounting/offering/entries?date=${date}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "불러오기 실패");
      }
      const list: Array<{
        id: number;
        memberId: number | null;
        offeringType: string;
        amount: number;
        description: string | null;
      }> = await res.json();

      const typeKeys = new Set<string>(TYPES.map((t) => t.key));
      // memberId(없으면 'none') 단위로 그룹. 같은 (회원,종류) 가 2건이면 새 행으로 분리.
      const byKey = new Map<string, Row[]>();
      let skipped = 0;
      let noneCnt = 0;
      for (const e of list) {
        if (!typeKeys.has(e.offeringType)) {
          skipped++;
          continue;
        }
        const memberKey = e.memberId != null ? `m${e.memberId}` : `none${noneCnt}`;
        const arr = byKey.get(memberKey) || [];
        let row = arr.find((r) => !r.amounts[e.offeringType] && !r.savedIds[e.offeringType]);
        if (!row) {
          row = {
            ...blankRow(),
            memberNo: e.memberId != null ? String(e.memberId) : "",
            status: "saved",
          };
          arr.push(row);
          byKey.set(memberKey, arr);
          if (e.memberId == null) noneCnt++;
        }
        row.amounts[e.offeringType] = String(e.amount);
        row.savedIds[e.offeringType] = e.id;
        if (!row.description && e.description) row.description = e.description;
      }

      const loaded: Row[] = [];
      for (const arr of byKey.values()) loaded.push(...arr);
      // 개인번호 오름차순 (없는 건 뒤로)
      loaded.sort((a, b) => {
        const na = parseInt(a.memberNo || "0", 10) || 0;
        const nb = parseInt(b.memberNo || "0", 10) || 0;
        return na - nb;
      });

      if (loaded.length === 0) {
        setRows([blankRow()]);
        setLoadMsg(`${date} 에 저장된 연보가 없습니다.`);
      } else {
        loaded.push(blankRow()); // 끝에 새 입력용 빈 행
        setRows(loaded);
        setLoadMsg(
          `${date} 연보 ${list.length - skipped}건 불러옴` +
            (skipped > 0 ? ` (매트릭스 외 종류 ${skipped}건은 제외 — 목록/수정 화면에서 확인)` : ""),
        );
      }
      setPendingDraft(null);
      cellRefs.current = [];
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  };

  // 현재 입력된 행을 개인번호별/입력순서별로 재정렬 (빈 행은 맨 끝 유지)
  const applySort = (by: "member" | "input") => {
    setSortBy(by);
    setRows((prev) => {
      const nonBlank = prev.filter(
        (r) =>
          r.memberNo.trim() !== "" ||
          Object.keys(r.savedIds).length > 0 ||
          TYPES.some((t) => (parseInt(r.amounts[t.key] || "0", 10) || 0) > 0),
      );
      const minId = (r: Row) => {
        const ids = Object.values(r.savedIds);
        return ids.length ? Math.min(...ids) : Number.MAX_SAFE_INTEGER;
      };
      const sorted = [...nonBlank].sort((a, b) => {
        if (by === "member") {
          const na = parseInt(a.memberNo || "0", 10) || 0;
          const nb = parseInt(b.memberNo || "0", 10) || 0;
          if (na !== nb) return na - nb;
        }
        return minId(a) - minId(b); // 입력순서 (저장 id 기준)
      });
      cellRefs.current = [];
      return [...sorted, blankRow()];
    });
  };

  // ============ 셀 참조 + 화살표 키 이동 ============
  const setCellRef = (row: number, col: number) => (el: HTMLInputElement | null) => {
    if (!cellRefs.current[row]) cellRefs.current[row] = [];
    cellRefs.current[row][col] = el;
  };
  const focusCell = (row: number, col: number) => {
    const el = cellRefs.current[row]?.[col];
    if (el) {
      el.focus();
      el.select?.();
    }
  };
  const onCellKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    // Enter 보강 — 태블릿 외부키보드 / 가상키보드 / IME 결합 환경 모두 지원.
    // · 숫자 칸(col 0~6)은 IME 못 켜지므로 composition 체크 X (한국어 모드여도 무조건 Enter)
    // · 비고 칸(마지막 col)만 IME 변환 중에는 건너뜀 — 첫 Enter 는 한글 conversion 완료에 양보.
    const isDescriptionCol = col === COLS_PER_ROW - 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const composing = isDescriptionCol && (e.nativeEvent as any)?.isComposing === true;
    const isEnter =
      !composing &&
      (e.key === "Enter" ||
        e.key === "NumpadEnter" ||
        e.code === "Enter" ||
        e.code === "NumpadEnter" ||
        // 안드로이드 가상키보드는 Go / Next / Done / Search / Send 로 옴
        e.key === "Go" ||
        e.key === "Next" ||
        e.key === "Done" ||
        e.key === "Send" ||
        e.keyCode === 13);
    if (isEnter) {
      // Enter: 다음 줄의 첫 칸(개인번호) 으로 이동 — 다음 행 입력 시작
      e.preventDefault();
      if (row === rows.length - 1) {
        setRows((p) => [...p, blankRow()]);
        setTimeout(() => focusCell(row + 1, 0), 0);
      } else {
        focusCell(row + 1, 0);
      }
    } else if (e.key === "ArrowDown") {
      // ↓: 같은 컬럼 다음 행 (세로 이동)
      e.preventDefault();
      if (row === rows.length - 1) {
        setRows((p) => [...p, blankRow()]);
        setTimeout(() => focusCell(row + 1, col), 0);
      } else {
        focusCell(row + 1, col);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(row - 1, col);
    } else if (e.key === "ArrowLeft") {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        focusCell(row, col - 1);
      }
    } else if (e.key === "ArrowRight") {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length) {
        e.preventDefault();
        focusCell(row, col + 1);
      }
    }
  };

  const addRow = () => setRows((p) => [...p, blankRow()]);
  const removeRow = (idx: number) => {
    if (rows.length === 1) return;
    setRows((p) => p.filter((_, i) => i !== idx));
  };

  const totalsPerType: Record<string, number> = Object.fromEntries(
    TYPES.map((t) => [
      t.key,
      rows.reduce((s, r) => s + (parseInt(r.amounts[t.key] || "0", 10) || 0), 0),
    ]),
  );
  const grandTotal = Object.values(totalsPerType).reduce((s, n) => s + n, 0);
  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          연보 통합 입력
          <HelpButton slug="acc-offering-multi-entry" />
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          한 회원의 여러 종류 연보를 한 줄에 입력합니다. 0 이거나 빈 칸인 종류는
          저장되지 않고, 입력된 종류만 각각의 연보 항목으로 저장됩니다.
          ↑↓ ← → 로 셀 이동. <strong>Enter</strong> 는 다음 줄의 개인번호 칸으로 점프 (새 행 자동 추가).
          [+ 줄 추가] 또는 [전체 저장] 으로 한꺼번에 입력·저장. 실패한 행만 다시 [저장] 가능.
          <br />
          ※ <strong className="text-green-700">저장된 행(초록)</strong> 도 수정·삭제 가능합니다. 금액 변경 후 [저장] 누르면 그 종류만 수정, 0 으로 비우고 [저장] 누르면 그 종류만 삭제됩니다 (id 기반 PUT/DELETE).
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 복구 배너 — 이전에 저장하지 않은 임시 입력이 있을 때만 */}
      {pendingDraft && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center gap-2">
          <span>
            이전에 저장하지 않은 입력이 있습니다
            {pendingDraft.date ? ` (${pendingDraft.date})` : ""}. 복구할까요?
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={recoverDraft}
              className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
            >
              복구
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="rounded border border-amber-300 bg-white px-3 py-1 text-xs text-amber-800 hover:bg-amber-100"
            >
              버리기
            </button>
          </div>
        </div>
      )}

      {loadMsg && (
        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700">
          {loadMsg}
        </div>
      )}

      {/* 공통 날짜 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">연보 일자</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={loadByDate}
          disabled={loading || savingAll}
          className="rounded border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          title="이 날짜에 저장된 연보를 불러와 확인·수정"
        >
          {loading ? "불러오는 중..." : "이 날짜 불러오기"}
        </button>
        <button
          type="button"
          onClick={saveAll}
          disabled={savingAll}
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {savingAll ? "저장 중..." : "전체 저장"}
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-600 ml-2">
          <span>정렬</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="me-sort" checked={sortBy === "member"} onChange={() => applySort("member")} />
            개인번호
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="me-sort" checked={sortBy === "input"} onChange={() => applySort("input")} />
            입력순서
          </label>
        </div>
        <button
          type="button"
          onClick={resetScreen}
          className="ml-auto rounded border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
          title="입력 화면만 비웁니다 (저장된 데이터는 유지)"
        >
          초기화
        </button>
        <button
          type="button"
          onClick={addRow}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          + 줄 추가
        </button>
      </div>

      {/* 매트릭스 입력 표 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-20">개인번호</th>
              {TYPES.map((t) => (
                <th key={t.key} className="px-2 py-2 text-right font-medium w-24">
                  {t.label}
                </th>
              ))}
              <th className="px-2 py-2 text-left font-medium">감사내역 <span className="text-gray-400 font-normal">(감사연보만)</span></th>
              <th className="px-2 py-2 w-24 text-center font-medium">작업</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const rowSum = TYPES.reduce(
                (s, t) => s + (parseInt(r.amounts[t.key] || "0", 10) || 0),
                0,
              );
              const hasSavedIds = Object.keys(r.savedIds).length > 0;
              // 입력은 항상 열려 있고, saved 상태에서 수정하면 status=dirty 로 자연 전환.
              // 저장 시 종류별로 신규/수정/삭제 분기 처리 (saveRow).
              const cellClass = "w-full rounded border border-gray-200 px-1.5 py-0.5 text-right font-mono";
              const cellClassDesc = "w-full rounded border border-gray-200 px-1.5 py-0.5";
              return (
                <tr
                  key={idx}
                  className={`border-b last:border-b-0 ${
                    r.status === "dirty"
                      ? "bg-orange-50/40"
                      : r.status === "saved"
                      ? "bg-green-50/40"
                      : r.status === "error"
                      ? "bg-red-50/40"
                      : ""
                  }`}
                >
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(idx, 0)}
                      type="text"
                      inputMode="numeric"
                      enterKeyHint="next"
                      value={r.memberNo}
                      onChange={(e) =>
                        update(idx, { memberNo: e.target.value.replace(/[^\d]/g, "") })
                      }
                      onKeyDown={(e) => onCellKey(e, idx, 0)}
                      placeholder="번호"
                      className={cellClass}
                    />
                  </td>
                  {TYPES.map((t, tIdx) => (
                    <td key={t.key} className="px-2 py-1">
                      <input
                        ref={setCellRef(idx, 1 + tIdx)}
                        type="text"
                        inputMode="numeric"
                        enterKeyHint="next"
                        value={
                          r.amounts[t.key] === ""
                            ? ""
                            : (parseInt(r.amounts[t.key], 10) || 0).toLocaleString()
                        }
                        onChange={(e) => updateAmount(idx, t.key, e.target.value)}
                        onKeyDown={(e) => onCellKey(e, idx, 1 + tIdx)}
                        placeholder="0"
                        className={cellClass}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <input
                      ref={setCellRef(idx, COLS_PER_ROW - 1)}
                      type="text"
                      enterKeyHint="next"
                      value={r.description}
                      onChange={(e) => update(idx, { description: e.target.value })}
                      onKeyDown={(e) => onCellKey(e, idx, COLS_PER_ROW - 1)}
                      className={cellClassDesc}
                    />
                  </td>
                  <td className="px-2 py-1 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => saveRow(idx)}
                        disabled={r.status === "saving" || (rowSum === 0 && !hasSavedIds)}
                        className="w-12 rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                        title={hasSavedIds ? "수정·삭제 가능" : "신규 저장"}
                      >
                        {r.status === "saving" ? "..." : "저장"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={rows.length === 1 || hasSavedIds}
                        className="w-8 rounded bg-gray-300 px-1 py-0.5 text-xs text-white hover:bg-gray-400 disabled:opacity-30"
                        title={hasSavedIds ? "DB 에 저장된 행 — 금액을 0 으로 비우고 [저장] 누르면 해당 종류 삭제" : "화면에서 행 제거"}
                      >
                        ✕
                      </button>
                    </div>
                    {r.message && (
                      <div
                        className={`text-[10px] mt-0.5 ${
                          r.status === "error" ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {r.message}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-gray-100 font-semibold text-xs">
              {/* 개인번호 칸 아래 — '종류별 합계' 라벨 */}
              <td className="px-2 py-2 text-center text-gray-600">종류별 합계</td>
              {TYPES.map((t) => (
                <td key={t.key} className="px-2 py-2 text-right text-indigo-700 font-mono">
                  {totalsPerType[t.key] > 0 ? fmt(totalsPerType[t.key]) : ""}
                </td>
              ))}
              {/* 비고 + 작업 칸 합쳐서 총계 표시 */}
              <td colSpan={2} className="px-2 py-2 text-right">
                <span className="text-gray-600 mr-2">총계</span>
                <span className="text-indigo-800 font-mono text-sm">{fmt(grandTotal)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 하단 [전체 저장] — 매번 위로 스크롤하지 않아도 되도록 */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-center gap-3 sticky bottom-2 shadow-md">
        <span className="text-xs text-gray-500">
          입력 내용은 자동 임시저장됨 — <strong>[F5] 새로고침엔 그대로 복원</strong>, 새 탭·메뉴로 새로
          열면 <strong>깨끗하게 시작</strong>(복구 배너로 선택). [초기화]로 화면을 비우고,
          [이 날짜 불러오기]로 저장분을 불러와 수정할 수 있습니다.
          [전체 저장]은 단일 트랜잭션 — 중간 실패 시 전체 롤백.
        </span>
        <button
          type="button"
          onClick={addRow}
          className="ml-auto rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          + 줄 추가
        </button>
        <button
          type="button"
          onClick={saveAll}
          disabled={savingAll}
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {savingAll ? "저장 중..." : "💾 전체 저장"}
        </button>
      </div>
    </div>
  );
}
