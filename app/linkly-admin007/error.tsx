"use client";

import { useEffect, useState } from "react";
import { ErrorState } from "./ds/primitives";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    // Technical details go to the console only - never to the page.
    console.error("[admin] page failed to render", error.digest ?? "", error.message);
  }, [error]);

  return (
    <ErrorState
      kind={offline ? "offline" : "error"}
      title={offline ? "لا يوجد اتصال بالإنترنت" : "تعذر تحميل هذه الصفحة"}
      description={offline ? "تحقق من اتصالك ثم أعد المحاولة." : "لم نتمكن من جلب البيانات الآن. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع فريق التطوير."}
      onRetry={reset}
    />
  );
}
