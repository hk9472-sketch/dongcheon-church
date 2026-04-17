"use client";

import { useEffect, useState } from "react";

interface AccountPerms {
  isAdmin: boolean;
  hasLedger: boolean;
  hasOffering: boolean;
  hasMemberEdit: boolean;
  loading: boolean;
}

const CACHE_KEY = "accountPerms.v1";
const DEFAULT: Omit<AccountPerms, "loading"> = {
  isAdmin: false,
  hasLedger: false,
  hasOffering: false,
  hasMemberEdit: false,
};

function readCache(): Omit<AccountPerms, "loading"> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(perms: Omit<AccountPerms, "loading">) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(perms));
  } catch {
    /* ignore quota errors */
  }
}

export function useAccountPerms(): AccountPerms {
  const [perms, setPerms] = useState<AccountPerms>(() => {
    const cached = readCache();
    if (cached) return { ...cached, loading: false };
    return { ...DEFAULT, loading: true };
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const u = d.user;
        if (!u) {
          setPerms({ ...DEFAULT, loading: false });
          return;
        }
        const admin = u.isAdmin <= 2;
        const next = {
          isAdmin: admin,
          hasLedger: admin || u.accLedgerAccess || u.accountAccess || false,
          hasOffering: admin || u.accOfferingAccess || u.accountAccess || false,
          hasMemberEdit: admin || u.accMemberEditAccess || false,
        };
        writeCache(next);
        setPerms({ ...next, loading: false });
      })
      .catch(() => setPerms((p) => ({ ...p, loading: false })));
  }, []);

  return perms;
}
