import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ResendUnavailableError,
  assertResendConfigured,
  describeResendFailure,
  resendFromAddress,
} from "./resendMail";

describe("assertResendConfigured", () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM };

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  afterEach(() => {
    if (saved.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = saved.from;
  });

  it("refuses when neither setting is present", () => {
    expect(() => assertResendConfigured()).toThrow(ResendUnavailableError);
  });

  it("refuses when only the key is present", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    expect(() => assertResendConfigured()).toThrow("RESEND_FROM is not set.");
  });

  it("refuses when only the sender is present", () => {
    process.env.RESEND_FROM = "LabFlow Reports <reports@example.com>";
    expect(() => assertResendConfigured()).toThrow("RESEND_API_KEY is not set.");
  });

  it("treats a blank sender as missing", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "   ";
    expect(() => resendFromAddress()).toThrow(ResendUnavailableError);
  });

  it("passes once both are set, without contacting Resend", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "LabFlow Reports <reports@example.com>";
    expect(() => assertResendConfigured()).not.toThrow();
  });
});

describe("describeResendFailure", () => {
  it("explains the testing-domain and unverified-domain refusal without echoing the owner's address", () => {
    const out = describeResendFailure({
      name: "validation_error",
      statusCode: 403,
      message: "You can only send testing emails to your own email address (owner@example.com).",
    });
    expect(out.status).toBe(502);
    expect(out.message).toContain("verified in Resend");
    expect(out.message).not.toContain("owner@example.com");
  });

  it("does not treat a 400 validation error as a domain problem", () => {
    const out = describeResendFailure({ name: "validation_error", statusCode: 400 });
    expect(out.message).not.toContain("verified in Resend");
  });

  it("names the key for every key refusal", () => {
    for (const name of ["missing_api_key", "invalid_api_key", "restricted_api_key", "suspended_api_key"]) {
      expect(describeResendFailure({ name, statusCode: 401 }).message).toContain("RESEND_API_KEY");
    }
  });

  it("names the sender for an invalid from address", () => {
    expect(describeResendFailure({ name: "invalid_from_address", statusCode: 422 }).message).toContain(
      "RESEND_FROM"
    );
  });

  it("says a sending limit was reached for every quota refusal", () => {
    for (const name of ["daily_quota_exceeded", "monthly_quota_exceeded", "rate_limit_exceeded"]) {
      expect(describeResendFailure({ name, statusCode: 429 }).message).toContain("sending limit");
    }
  });

  it("keeps the retry wording only for failures that may pass on retry", () => {
    expect(describeResendFailure({ name: "application_error", statusCode: 500 }).message).toContain(
      "Try again shortly"
    );
    expect(describeResendFailure({}).message).toContain("Try again shortly");
  });

  it("does not classify on message text", () => {
    const out = describeResendFailure({ name: "application_error", statusCode: 500, message: "domain is not verified" });
    expect(out.message).not.toContain("verified in Resend");
  });
});
