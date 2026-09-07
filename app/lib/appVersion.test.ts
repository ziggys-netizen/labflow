import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { APP_VERSION, formatAppVersion, formatFooterBuildLine } from "./appVersion";

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "appVersion.ts"), "utf8");

describe("footer version", () => {
  it("comes from package.json, not a handwritten stale string", () => {
    expect(APP_VERSION).toBe(packageJson.version);
    expect(formatAppVersion()).toBe(`v${packageJson.version}`);
    expect(SOURCE).toContain("package.json");
    expect(SOURCE).not.toMatch(/0\.5\.2/);
    expect(formatFooterBuildLine(packageJson.version, "Medic Aid")).toBe(
      `v${packageJson.version} · Medic Aid`
    );
  });
});
