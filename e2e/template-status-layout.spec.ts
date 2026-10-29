import { readFileSync } from "fs";
import { expect, test } from "@playwright/test";

test("template status percentages fit a narrow sidebar in both directions", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 720 });
  await page.setContent(`<style>${readFileSync("app/dashboard/dashboard.css", "utf8")}</style>
    <aside class="panel template-gallery-side" style="width:280px">
      <div class="panel-head"><h2>حالة القوالب</h2></div>
      <div class="panel-body"><div class="dist-chart">
        <div class="dist-total"><b>3</b><span>قالب</span></div>
        <div class="dist-stack"><i style="width:100%;background:#2e9e6b"></i></div>
        <ul class="dist-rows">${["معتمد", "قيد المراجعة", "مرفوض"].map((label, index) => `<li><span class="dist-label"><i></i>${label}</span><span class="dist-track"><i></i></span><b>${index === 0 ? 3 : 0}</b><small>${index === 0 ? 100 : 0}%</small></li>`).join("")}</ul>
      </div></div>
    </aside>`);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 720 });
    for (const direction of ["rtl", "ltr"]) {
    await page.locator("html").evaluate((el, dir) => el.setAttribute("dir", dir), direction);
    const panel = page.locator(".template-gallery-side");
    const bounds = (await panel.boundingBox())!;
    for (const cell of await panel.locator(".dist-rows li > *:visible").all()) {
      const box = (await cell.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    await page.screenshot({ path: `reports/template-status-${direction}-${width}.png` });
    }
  }
});
