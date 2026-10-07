import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const landingCss = readFileSync(resolve("app/landing/landing.module.css"), "utf8");
const config = readFileSync(resolve("next.config.ts"), "utf8");
const layout = readFileSync(resolve("app/layout.tsx"), "utf8");

function declarations(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = landingCss.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  expect(match, `Missing CSS rule ${selector}`).not.toBeNull();
  return match![1];
}

function contrast(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex.match(/[a-f\d]{2}/gi)!.map((pair) => parseInt(pair, 16) / 255);
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("landing PageSpeed regressions", () => {
  it("keeps small white labels readable on teal", () => {
    for (const selector of [".freshTag", ".resolveButton", ".storySteps li[data-active] .storyNumber"]) {
      expect(declarations(selector)).toMatch(/background:\s*var\(--dark\)/);
    }
    expect(contrast("ffffff", "106b65")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps inactive story numbers readable without dimming the whole item", () => {
    expect(declarations(".storySteps li")).toMatch(/opacity:\s*1\s*;/);
    expect(declarations(".storyNumber")).toMatch(/color:\s*var\(--dark\)/);
    expect(contrast("106b65", "e1efed")).toBeGreaterThanOrEqual(4.5);
  });

  it("permits the consented Clarity tag and collector without dropping CSP", () => {
    expect(config).toMatch(/script-src[^\n]+https:\/\/www\.clarity\.ms/);
    expect(config).toMatch(/connect-src[^\n]+https:\/\/\*\.clarity\.ms/);
    expect(config).toContain("frame-ancestors 'none'");
  });

  it("does not fetch tag manager before the visitor accepts analytics", () => {
    expect(layout).not.toContain("gtm.js?id=");
    expect(layout).not.toContain('strategy="beforeInteractive"');
    expect(layout).toMatch(/preload:\s*false/);
  });
});
