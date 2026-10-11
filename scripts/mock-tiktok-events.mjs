// A tiny local stand-in for TikTok's Events API, for trying the lead-status feature without a real ad account.
//   1) node scripts/mock-tiktok-events.mjs            (prints every event it receives)
//   2) start the app with:  TIKTOK_EVENTS_URL=http://localhost:4010/track npm run dev
//   3) in Settings > TikTok enter any Event Set ID and a long dummy token, tick "enable",
//      then change a conversation's lead status and watch the events appear here.
// Optional: MOCK_TIKTOK_FAIL=1 makes it answer with an error, to see how failures are shown.
import { createServer } from "node:http";

const port = Number(process.env.MOCK_TIKTOK_PORT || 4010);
const fail = process.env.MOCK_TIKTOK_FAIL === "1";

createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      // not JSON
    }
    console.log(`\n[${new Date().toLocaleTimeString()}] ${request.method} ${request.url}`);
    console.log("  Access-Token:", request.headers["access-token"] ? "(present)" : "(missing)");
    for (const event of parsed?.data ?? []) {
      console.log(`  event=${event.event} id=${event.event_id.slice(0, 10)}… phone(sha256)=${String(event.user?.phone).slice(0, 12)}… props=${JSON.stringify(event.properties)}`);
    }
    console.log(`  event_source=${parsed?.event_source} event_source_id=${parsed?.event_source_id}${parsed?.test_event_code ? ` test_event_code=${parsed.test_event_code}` : ""}`);
    response.writeHead(fail ? 400 : 200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(fail ? { code: 40002, message: "mock failure" } : { code: 0, message: "OK" }));
  });
}).listen(port, () => console.log(`Mock TikTok Events API on http://localhost:${port}/track`));
