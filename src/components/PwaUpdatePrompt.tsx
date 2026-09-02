import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

export function PwaUpdatePrompt() {
  const { t } = useLanguage();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

    let refreshing = false;
    const reload = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", reload);
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(registration.waiting);
          }
        });
      });
    });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", reload);
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-[max(1rem,env(safe-area-inset-left,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-50 flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-raise sm:left-auto sm:max-w-sm"
    >
      <p className="text-sm font-medium">{t("An app update is ready.")}</p>
      <Button size="sm" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}>
        <RefreshCw />
        {t("Update")}
      </Button>
    </div>
  );
}
