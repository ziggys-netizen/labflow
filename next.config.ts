import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin/auth pulls jwks-rsa, which require()s jose. Keep admin
  // outside the Turbopack bundle so the CJS/ESM pin in package.json applies.
  serverExternalPackages: [
    "firebase-admin",
    "jose",
    "jwks-rsa",
    "google-auth-library",
    "@vercel/oidc",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
