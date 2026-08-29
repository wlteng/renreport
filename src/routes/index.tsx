import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, Eye, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JJ Report — Daily work reporting" },
      {
        name: "description",
        content:
          "Staff write daily work reports, managers review their department, bosses see everything, admins control roles.",
      },
      { property: "og:title", content: "JJ Report — Daily work reporting" },
      {
        property: "og:description",
        content: "Role-based daily reporting for staff, managers, bosses and admins.",
      },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  {
    icon: ClipboardList,
    title: "Staff write",
    body: "A fast daily entry: project, type of work, hours, what happened, blockers and links.",
  },
  {
    icon: Eye,
    title: "Bosses read",
    body: "Read-only oversight across everyone, filtered by person, project, type and date range.",
  },
  {
    icon: ShieldCheck,
    title: "Admins control",
    body: "Roles live in their own table, every grant and revoke is written to a permanent audit trail.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <span className="text-sm font-semibold tracking-tight">JJ Report</span>
        <Button asChild size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-20">
        <section className="py-14 sm:py-20">
          <p className="logbook-label">Daily work log</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Every day's work, written down once and readable by the right people.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground">
            JJ Report keeps daily reporting honest: staff log the work, managers see their
            department, bosses see the whole company, and admins decide who is who.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">I already have an account</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="logbook-card p-6">
              <p.icon className="size-5 text-muted-foreground" />
              <h2 className="mt-4 text-sm font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
