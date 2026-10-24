// Renders the link-preview picture (public/assets/og-image.png, 1200x630) in a real browser, which shapes and orders
// Arabic correctly - the server-side image renderer cannot (words come out reversed and unevenly spaced).
// Run after changing the wording:  node scripts/generate-og-image.mjs
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const logo = /"(data:image\/png;base64,[^"]+)"/.exec(await readFile(path.join(root, "app/logo-data.ts"), "utf8"))?.[1];
if (!logo) throw new Error("logo not found");
const font = (name) => `file://${path.join(root, "public/fonts/tajawal", name)}`;

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:Tajawal;font-weight:500;src:url("${font("Tajawal-Medium.ttf")}")}
@font-face{font-family:Tajawal;font-weight:900;src:url("${font("Tajawal-Black.ttf")}")}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;display:flex;align-items:center;justify-content:center;background:#eaf3f1;color:#101b18;font-family:Tajawal,sans-serif;padding:72px}
.card{width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;border:2px solid #bcd8d3;border-radius:42px;padding:52px 60px;background:#f6fbfa}
.brand{display:flex;align-items:center;gap:22px;justify-content:flex-start;font-size:48px;font-weight:900}
.mark{width:96px;height:96px;display:flex;align-items:center;justify-content:center;border-radius:26px;background:#123330}
.mark img{width:86px;height:48px}
h1{font-size:62px;line-height:1.3;font-weight:900;max-width:900px}
p{margin-top:14px;font-size:30px;line-height:1.6;color:#4c635f;font-weight:500;max-width:900px}
.foot{display:flex;align-items:center;justify-content:space-between;font-size:26px}
.foot b{direction:ltr;color:#178a82;font-weight:900}
.foot span{color:#4c635f;font-weight:500}
</style></head><body><div class="card">
<div class="brand"><div class="mark"><img src="${logo}"></div><span>Linkly</span></div>
<div><h1>أدر واتساب وكل قنوات عملائك من صندوق واحد</h1><p>ردود آلية وكتالوج للطلب وحملات تسويقية على واتساب</p></div>
<div class="foot"><span>ابدأ تجربتك المجانية</span><b>linklysa.io</b></div>
</div></body></html>`;

const dir = await mkdtemp(path.join(tmpdir(), "og-"));
const page = path.join(dir, "og.html");
await writeFile(page, html);
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await tab.goto(`file://${page}`);
await tab.evaluate(() => document.fonts.ready);
await tab.screenshot({ path: path.join(root, "public/assets/og-image.png") });
await browser.close();
console.log("public/assets/og-image.png written");
