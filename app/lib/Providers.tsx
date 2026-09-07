"use client";

import { AuthProvider } from "./AuthContext";
import { ConnectionProvider } from "./ConnectionContext";
import { StaffSessionProvider } from "./pinSession";
import PinGate from "./PinGate";
import AppFooter from "./AppFooter";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConnectionProvider>
        <StaffSessionProvider>
          <PinGate>
            {children}
            <AppFooter />
          </PinGate>
        </StaffSessionProvider>
      </ConnectionProvider>
    </AuthProvider>
  );
}
