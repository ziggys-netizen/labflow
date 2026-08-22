"use client";

import { AuthProvider } from "./AuthContext";
import { ConnectionProvider } from "./ConnectionContext";
import { StaffSessionProvider } from "./pinSession";
import PinGate from "./PinGate";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConnectionProvider>
        <StaffSessionProvider>
          <PinGate>{children}</PinGate>
        </StaffSessionProvider>
      </ConnectionProvider>
    </AuthProvider>
  );
}
