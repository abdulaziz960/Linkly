import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The release runs the unit suite as parallel shards. A shard that is missing, or one the push does not wait for, would
// let untested code reach the live site while the build still reports success.
describe("release gate (cloudbuild.yaml)", () => {
  const config = readFileSync(join(process.cwd(), "cloudbuild.yaml"), "utf-8");

  it("runs every test shard and pushes the image only after all checks", () => {
    const shards = [...config.matchAll(/--shard=(\d+)\/(\d+)/g)];
    const total = Number(shards[0]?.[2]);
    expect(shards.map((shard) => Number(shard[1]))).toEqual(Array.from({ length: total }, (_, index) => index + 1));
    expect(shards.every((shard) => Number(shard[2]) === total)).toBe(true);

    const pushWaitsFor = config.match(/- id: push-image[\s\S]*?waitFor: (\[.*\])/)?.[1];
    expect(JSON.parse(pushWaitsFor ?? "[]")).toEqual(["build-image", "lint-typecheck", ...shards.map((shard) => `test-${shard[1]}`)]);
  });
});
