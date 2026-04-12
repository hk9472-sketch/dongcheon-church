"use client";

import { useEffect, useState } from "react";

interface AccountPerms {
  isAdmin: boolean;
  hasLedger: boolean;
  hasOffering: boolean;
  hasMemberEdit: boolean;
  loading: boolean;
}

export function useAccountPerms(): AccountPerms {
  const [perms, setPerms] = useState<AccountPerms>({
    isAdmin: false,
    hasLedger: false,
    hasOffering: false,
    hasMemberEdit: false,
    loading: true,
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const u = d.user;
        if (!u) return;
        const admin = u.isAdmin <= 2;
        setPerms({
          isAdmin: admin,
          hasLedger: admin || u.accLedgerAccess || u.accountAccess || false,
          hasOffering: admin || u.accOfferingAccess || u.accountAccess || false,
          hasMemberEdit: admin || u.accMemberEditAccess || false,
          loading: false,
        });
      })
      .catch(() => setPerms((p) => ({ ...p, loading: false })));
  }, []);

  return perms;
}
