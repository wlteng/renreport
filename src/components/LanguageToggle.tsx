import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Compact switch between Chinese and English for pages outside the signed-in shell. */
export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const next = language === "zh" ? "en" : "zh";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={() => setLanguage(next)}
      aria-label={next === "en" ? "Switch to English" : "切换到中文"}
    >
      <Languages />
      {next === "en" ? "English" : "中文"}
    </Button>
  );
}
