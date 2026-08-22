import { existsSync, readFileSync } from "fs";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { ExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";

/**
 * Admin SDK must be lazy. Importing this file during `next build` must not
 * throw if GCP / OIDC / a key file is missing — fail at request time (503).
 */
export class AdminUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminUnavailableError";
  }
}

function projectId(): string | undefined {
  return (
    process.env.GCP_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

function requiredEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

/**
 * Vercel OIDC → GCP Workload Identity Federation (ADR-001 Option B).
 * Returns null unless every pool/provider/SA env var is set, so local
 * `next build` and Production without WIF still fail at request time (503).
 */
function vercelOidcCredential(): Credential | null {
  const projectNumber = requiredEnv("GCP_PROJECT_NUMBER");
  const poolId = requiredEnv("GCP_WORKLOAD_IDENTITY_POOL_ID");
  const providerId = requiredEnv("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");
  const saEmail = requiredEnv("GCP_SERVICE_ACCOUNT_EMAIL");
  if (!projectNumber || !poolId || !providerId || !saEmail) return null;

  const wifAudience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  const tokenAudience = requiredEnv("GCP_AUDIENCE");

  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: wifAudience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: () =>
        tokenAudience
          ? getVercelOidcToken({ audience: tokenAudience })
          : getVercelOidcToken(),
    },
  });
  if (!client) return null;

  return {
    async getAccessToken() {
      const token = await client.getAccessToken();
      const access_token = token.token;
      if (!access_token) {
        throw new AdminUnavailableError("OIDC token exchange returned no access token.");
      }
      return { access_token, expires_in: 3600 };
    },
  };
}

function parseServiceAccountJson(raw: string): ServiceAccount {
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new AdminUnavailableError("Service account JSON is invalid.");
  }
}

function fileCredentialFromDevPath(): Credential | null {
  const path = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  if (!path) return null;
  // File-path keys are local/dev only. Vercel must use OIDC or env JSON.
  if (process.env.VERCEL) {
    throw new AdminUnavailableError(
      "FIREBASE_ADMIN_CREDENTIALS_PATH is not allowed on Vercel. Use OIDC or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY."
    );
  }
  if (!existsSync(path)) {
    throw new AdminUnavailableError(`FIREBASE_ADMIN_CREDENTIALS_PATH does not exist: ${path}`);
  }
  return cert(parseServiceAccountJson(readFileSync(path, "utf8")));
}

function envJsonCredential(): Credential | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  return cert(parseServiceAccountJson(raw));
}

function envPemCredential(): Credential | null {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return null;
  return cert({
    projectId: projectId(),
    clientEmail,
    privateKey,
  });
}

function resolveCredential(): Credential {
  const fromEnvJson = envJsonCredential();
  if (fromEnvJson) return fromEnvJson;
  const fromPem = envPemCredential();
  if (fromPem) return fromPem;
  const fromOidc = vercelOidcCredential();
  if (fromOidc) return fromOidc;
  const fromDevFile = fileCredentialFromDevPath();
  if (fromDevFile) return fromDevFile;
  // Local: `gcloud auth application-default login`. On Vercel this fails
  // unless OIDC env vars above are set.
  return applicationDefault();
}

export function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  try {
    return initializeApp({
      credential: resolveCredential(),
      projectId: projectId(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Firebase Admin failed to initialise.";
    throw new AdminUnavailableError(message);
  }
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function isAdminCredentialError(err: unknown): boolean {
  if (err instanceof AdminUnavailableError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /Could not load the default credentials|Could not refresh access token|invalid_grant|unable to authenticate|credential/i.test(
    message
  );
}
