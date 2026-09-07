"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatFooterBuildLine } from "./appVersion";
import { useAuth } from "./AuthContext";
import { loadClinicNames } from "./clinicScope";
import { PRIVACY_PATH, SUPPORT_PATH, TERMS_READ_PATH } from "./legal/termsGate";

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="hover:underline"
      style={{
        fontSize: "12.5px",
        color: "var(--lf-accent)",
      }}
    >
      {children}
    </Link>
  );
}

export default function AppFooter() {
  const { user, role, clinicId, actingClinicId, actingClinicName, memberships } = useAuth();
  const pathname = usePathname() || "";
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    const ids =
      role === "owner"
        ? actingClinicId
          ? [actingClinicId]
          : []
        : [clinicId, ...memberships.map((m) => m.clinicId)];
    let cancelled = false;
    loadClinicNames(role, ids)
      .then((names) => {
        if (!cancelled) setClinicNames(names);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [user, role, clinicId, actingClinicId, memberships]);

  if (!user) return null;
  if (pathname.endsWith("/print")) return null;

  const clinicName =
    role === "owner"
      ? actingClinicName || (actingClinicId ? clinicNames[actingClinicId] : null)
      : clinicId
        ? clinicNames[clinicId] || clinicId
        : null;

  return (
    <footer className="lf-app-footer no-print">
      <div className="lf-app-footer-zone lf-app-footer-left">
        <span className="lf-app-footer-accent" aria-hidden />
        <span>© 2026 LabFlow. All rights reserved.</span>
      </div>
      <div className="lf-app-footer-zone lf-app-footer-centre">
        <FooterLink href={TERMS_READ_PATH}>Terms</FooterLink>
        <span aria-hidden>·</span>
        <FooterLink href={PRIVACY_PATH}>Privacy</FooterLink>
        <span aria-hidden>·</span>
        <FooterLink href={SUPPORT_PATH}>Support</FooterLink>
      </div>
      <div className="lf-app-footer-zone lf-app-footer-right">
        {formatFooterBuildLine(undefined, clinicName)}
      </div>
    </footer>
  );
}
