import { describe, expect, it } from "vitest";
import { AdminUnavailableError, isAdminCredentialError } from "./firebaseAdmin";

describe("isAdminCredentialError", () => {
  it("returns true for AdminUnavailableError", () => {
    expect(isAdminCredentialError(new AdminUnavailableError("missing OIDC"))).toBe(true);
  });

  it("returns true for ADC / refresh / invalid_grant style messages", () => {
    expect(
      isAdminCredentialError(new Error("Could not load the default credentials. Browse to…"))
    ).toBe(true);
    expect(
      isAdminCredentialError(new Error("Could not refresh access token: invalid credentials"))
    ).toBe(true);
    expect(isAdminCredentialError(new Error("invalid_grant: Token has been expired or revoked."))).toBe(
      true
    );
    expect(isAdminCredentialError(new Error("unable to authenticate the request"))).toBe(true);
  });

  it("does not match bare mid-sentence credential wording", () => {
    expect(
      isAdminCredentialError(
        new Error(
          'Firebase ID token has incorrect "aud" (audience) claim. Expected "labflow-6cb9e" but got "other". Make sure the ID token comes from the same Firebase project as the credential used to authenticate this SDK.'
        )
      )
    ).toBe(false);
    expect(
      isAdminCredentialError(new Error("The request had an invalid credential somewhere."))
    ).toBe(false);
  });

  it("does not classify typical ID token verify failures as admin credential errors", () => {
    expect(
      isAdminCredentialError(new Error("Firebase ID token has expired. Get a fresh ID token from your client app and try again."))
    ).toBe(false);
    expect(
      isAdminCredentialError(new Error("Decoding Firebase ID token failed. Make sure you passed the entire string JWT."))
    ).toBe(false);
    expect(isAdminCredentialError(new Error("auth/argument-error"))).toBe(false);
  });
});
