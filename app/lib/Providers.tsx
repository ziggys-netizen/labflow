"use client";

import { AuthProvider } from "./AuthContext";
import { ConnectionProvider } from "./ConnectionContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConnectionProvider>{children}</ConnectionProvider>
    </AuthProvider>
  );
}
