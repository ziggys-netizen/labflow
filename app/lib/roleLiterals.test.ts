import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ROLES } from "./permissions";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const PERMISSIONS_FILE = join(APP_DIR, "lib", "permissions.ts");

const ROLE_STRINGS = new Set<string>([...ROLES, "admin"]);

const COMPARE = /(?:^|[^A-Za-z0-9_$])((?:[A-Za-z0-9_$]+\.)*role)\s*(===|!==|==|!=)\s*(['"])([^'"]+)\3/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => "\n".repeat(block.split("\n").length - 1)).replace(/(^|[^:\\\s])\/\/.*$/gm, "$1");
}

interface Hit {
  file: string;
  line: number;
  ident: string;
  value: string;
  snippet: string;
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function scanComparisons(source: string, file: string): Hit[] {
  const hits: Hit[] = [];
  const cleaned = stripComments(source);
  for (const match of cleaned.matchAll(COMPARE)) {
    const value = match[4];
    if (!ROLE_STRINGS.has(value)) continue;
    if (value === "owner") continue;
    hits.push({
      file,
      line: lineNumber(cleaned, match.index ?? 0),
      ident: match[1],
      value,
      snippet: match[0].trim(),
    });
  }

  const switchRe = /switch\s*\(\s*((?:[\w$]+\.)*role)\s*\)\s*\{/g;
  let sw: RegExpExecArray | null;
  while ((sw = switchRe.exec(cleaned))) {
    let depth = 1;
    let i = sw.index + sw[0].length;
    while (i < cleaned.length && depth > 0) {
      if (cleaned[i] === "{") depth += 1;
      else if (cleaned[i] === "}") depth -= 1;
      i += 1;
    }
    const body = cleaned.slice(sw.index + sw[0].length, i);
    for (const c of body.matchAll(/case\s*(['"])([^'"]+)\1/g)) {
      const value = c[2];
      if (!ROLE_STRINGS.has(value) || value === "owner") continue;
      hits.push({
        file,
        line: lineNumber(cleaned, sw.index + (c.index ?? 0)),
        ident: sw[1],
        value,
        snippet: `case "${value}"`,
      });
    }
  }
  return hits;
}

function posix(file: string): string {
  return relative(APP_DIR, file).split(sep).join("/");
}

describe("role string literals", () => {
  it("no app file outside permissions.ts compares role to a non-owner role string", () => {
    const files = walk(APP_DIR);
    const violations: string[] = [];
    for (const file of files) {
      if (file === PERMISSIONS_FILE) continue;
      const source = readFileSync(file, "utf8");
      for (const hit of scanComparisons(source, file)) {
        violations.push(`${posix(file)}:${hit.line} ${hit.ident} ${hit.snippet}`);
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("reintroducing role === admin fails this suite", () => {
    const files = walk(APP_DIR);
    const adminHits: string[] = [];
    for (const file of files) {
      if (file === PERMISSIONS_FILE) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      for (const match of source.matchAll(COMPARE)) {
        if (match[4] === "admin") {
          adminHits.push(`${posix(file)}:${lineNumber(source, match.index ?? 0)}`);
        }
      }
    }
    expect(adminHits).toEqual([]);
  });

  it("allows() role literals in permissions.ts are all members of ROLES", () => {
    const source = readFileSync(PERMISSIONS_FILE, "utf8");
    const used = new Set<string>();
    for (const call of source.matchAll(/allows\([\s\S]*?\)/g)) {
      for (const quoted of call[0].matchAll(/"([a-z_]+)"/g)) {
        used.add(quoted[1]);
      }
    }
    const unknown = [...used].filter((role) => !(ROLES as readonly string[]).includes(role));
    expect(unknown).toEqual([]);
  });
});
