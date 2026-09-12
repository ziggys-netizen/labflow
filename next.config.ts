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
  /**
   * Serves Firebase's auth handler from this origin instead of
   * labflow-6cb9e.firebaseapp.com.
   *
   * signInWithRedirect carries "a sign-in is pending" state between the app
   * origin and authDomain. When those are different sites the browser
   * partitions that storage, the state is dropped, and getRedirectResult()
   * returns no user and no error — the user lands back on the sign-in page as
   * though nothing happened. Same-site removes the problem.
   *
   * The whole `/__/` prefix is proxied, not just `/__/auth/`: the handler page
   * fetches `/__/firebase/init.json` relative to its own origin.
   *
   * Only takes effect once NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN names this app's
   * own domain. With the default *.firebaseapp.com value these routes are
   * simply never requested.
   */
  async rewrites() {
    return [
      {
        source: "/__/:path*",
        destination: "https://labflow-6cb9e.firebaseapp.com/__/:path*",
      },
    ];
  },
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
            // 'self', not 'none': Firebase Auth embeds /__/auth/iframe, which
            // is same-origin once the rewrite above is in play. 'none' would
            // block it. Cross-origin framing — the clickjacking case this
            // header is here for — stays blocked either way.
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
