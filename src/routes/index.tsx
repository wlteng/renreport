import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, Eye, ShieldCheck } from "lucide-react";

import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ren Report — Gold mining operations" },
      {
        name: "description",
        content:
          "Gold mining staff submit work logs and expenses while administrators manage projects, people, roles and compensation.",
      },
      { property: "og:title", content: "Ren Report — Gold mining operations" },
      {
        property: "og:description",
        content: "Operations reporting and administration for gold mining investments.",
      },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  {
    icon: ClipboardList,
    title: "Staff write",
    body: "Submit mine project activity, hours, output, blockers and supporting evidence.",
  },
  {
    icon: Eye,
    title: "Operations stay visible",
    body: "Review all-staff activity and project expenses by person, mine, status and date range.",
  },
  {
    icon: ShieldCheck,
    title: "Admins control",
    body: "Manage staff accounts, departments, roles, permissions, salaries and mine projects.",
  },
];

function Landing() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between pb-5 pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))]">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <img src="/icons/icon-192.png" alt="" className="size-8 rounded-lg" />
          {t("Ren Report")}
        </span>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Button asChild size="sm">
            <Link to="/auth">{t("Sign in")}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl pb-[max(5rem,env(safe-area-inset-bottom,0px))] pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))]">
        <section className="py-14 sm:py-20">
          <p className="logbook-label">{t("Gold mining operations log")}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            {t("Know what is happening across every mine project and expense.")}
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground">
            {t(
              "Ren Report records the work, production output, blockers, project costs and staff administration behind the gold mines your team operates and invests in.",
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">{t("Get started")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">{t("I already have an account")}</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="logbook-card p-6">
              <p.icon className="size-5 text-muted-foreground" />
              <h2 className="mt-4 text-sm font-semibold">{t(p.title)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(p.body)}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
