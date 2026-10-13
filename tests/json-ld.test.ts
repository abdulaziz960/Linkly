import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { safeJsonLd } from "../lib/json-ld";

describe("safeJsonLd", () => {
  it("round-trips the data exactly", () => {
    const data = { "@type": "Question", name: "سؤال؟", text: 'He said "hi" & left <b>bold</b>', list: [1, null, true] };
    expect(JSON.parse(safeJsonLd(data))).toEqual(data);
  });

  it("never emits characters that can end the script element or the line", () => {
    const out = safeJsonLd({ a: "</script><script>alert(1)</script>", b: "x y z", c: "<!-- a -->", d: "a&b>c" });
    expect(out).not.toMatch(/[<>&]/);
    expect(out).not.toContain(" ");
    expect(out).not.toContain(" ");
    expect(JSON.parse(out).a).toBe("</script><script>alert(1)</script>");
  });

  it("serialises undefined as null instead of throwing", () => {
    expect(safeJsonLd(undefined)).toBe("null");
  });
});

describe("public pages that embed JSON-LD", () => {
  // Rendering these pages needs the full CSS pipeline, so guard the source instead:
  // every ld+json script must be fed through safeJsonLd.
  it("serialises every ld+json script with safeJsonLd", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(tsx|ts)$/.test(entry.name)) files.push(path);
      }
    };
    walk(join(process.cwd(), "app"));

    const offenders: string[] = [];
    let scripts = 0;
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split(String.fromCharCode(10));
      lines.forEach((line, index) => {
        if (!line.includes("application/ld+json")) return;
        scripts += 1;
        if (!line.includes("safeJsonLd(")) offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(scripts).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
