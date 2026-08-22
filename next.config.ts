import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin/auth pulls jwks-rsa, which require()s jose. Keep admin
  // outside the Turbopack bundle so the CJS/ESM pin in package.json applies.
  serverExternalPackages: ["firebase-admin", "jose", "jwks-rsa"],
};

export default nextConfig;
