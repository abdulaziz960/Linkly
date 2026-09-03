/**
 * HTML for an OAuth popup's final page: notify the opener (if reachable)
 * and close the popup.
 *
 * window.opener can be null even for a window we opened ourselves - many
 * OAuth providers (TikTok included) send Cross-Origin-Opener-Policy on
 * their own pages, which permanently severs the opener reference once the
 * popup navigates there, even after it redirects back to our own domain.
 * That doesn't affect window.close() (script-opened windows can always
 * self-close, independent of opener), so close() is attempted
 * unconditionally - the location.href fallback only fires if the window
 * is still open after a short delay, i.e. it truly wasn't a popup Claude
 * opened via window.open() (e.g. someone opened the callback URL directly).
 */
export function popupCloseHtml(origin: string, bodyMessage: string, postMessagePayload: unknown, fallbackPath: string) {
  const fallbackUrl = `${origin}${fallbackPath}`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>الربط</title></head><body><p>${bodyMessage}</p><script>if(window.opener){try{window.opener.postMessage(${JSON.stringify(postMessagePayload)},${JSON.stringify(origin)});}catch(e){}}try{window.close();}catch(e){}setTimeout(function(){window.location.href=${JSON.stringify(fallbackUrl)};},400);</script></body></html>`;
}
