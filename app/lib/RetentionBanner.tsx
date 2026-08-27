"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { subscribeDocument } from "./clinicListen";
import { clinicRetentionIsRecorded, parseRetentionFromData, RETENTION_SETUP_INCOMPLETE } from "./clinicRetention";
import { canEditClinicProfile } from "./permissions";

export default function RetentionBanner() {
  const { role, clinicId, writeClinicId } = useAuth();
  const pathname = usePathname() || "";
  const scopeId = writeClinicId || clinicId;
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!scopeId) {
      setMissing(false);
      return;
    }
    return subscribeDocument("clinics", scopeId, (snap) => {
      if (!snap.exists()) {
        setMissing(false);
        return;
      }
      const retention = parseRetentionFromData(snap.data() as Record<string, unknown>);
      setMissing(!clinicRetentionIsRecorded(retention));
    });
  }, [scopeId]);

  if (!scopeId || !missing) return null;
  if (pathname === `/owner/clinics/${scopeId}`) return null;

  const canEdit = canEditClinicProfile(role);

  return (
    <div className="border-t border-amber-200 bg-amber-50 px-6 py-2">
      <p className="max-w-5xl mx-auto text-sm text-amber-950">
        {RETENTION_SETUP_INCOMPLETE}
        {canEdit ? (
          <>
            {" "}
            <Link href={`/owner/clinics/${scopeId}`} className="underline font-medium">
              Set retention
            </Link>
          </>
        ) : (
          " Ask a clinic administrator to record it on the clinic profile."
        )}
      </p>
    </div>
  );
}
