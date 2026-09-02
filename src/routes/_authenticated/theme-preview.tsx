import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Check,
  ClipboardCheck,
  Clock3,
  FolderKanban,
  Pickaxe,
  Sparkles,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useState, type CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/lib/i18n";

const STORAGE_KEY = "renreport.theme-preview-choice.v1";
const APPLIED_THEME_ID = "copper-teal";

type ThemeCandidate = {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  colors: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    primary: string;
    onPrimary: string;
    accent: string;
    soft1: string;
    soft2: string;
    soft3: string;
  };
};

const THEMES: ThemeCandidate[] = [
  {
    id: "gold-forest",
    name: "Gold Forest",
    nameZh: "鎏金森林",
    description: "Mining gold with a calm, professional forest green.",
    colors: {
      bg: "#F6F7F2",
      surface: "#FFFFFF",
      text: "#17362F",
      muted: "#64756F",
      border: "#D7E2DD",
      primary: "#17624F",
      onPrimary: "#FFFFFF",
      accent: "#E5A91A",
      soft1: "#FFF0B8",
      soft2: "#DDF1E9",
      soft3: "#E7E1FA",
    },
  },
  {
    id: "cobalt-sunrise",
    name: "Cobalt Sunrise",
    nameZh: "钴蓝朝阳",
    description: "Clear operations blue with warm amber highlights.",
    colors: {
      bg: "#F3F6FE",
      surface: "#FFFFFF",
      text: "#17213D",
      muted: "#66708A",
      border: "#D9E1F2",
      primary: "#2857D9",
      onPrimary: "#FFFFFF",
      accent: "#FFAC2F",
      soft1: "#FFF0C9",
      soft2: "#DDE8FF",
      soft3: "#FFDDD3",
    },
  },
  {
    id: "copper-teal",
    name: "Copper Teal",
    nameZh: "赤铜青碧",
    description: "Earthy copper balanced by modern mineral teal.",
    colors: {
      bg: "#F7F4F0",
      surface: "#FFFFFF",
      text: "#263A38",
      muted: "#6D7774",
      border: "#E2DCD4",
      primary: "#0F766E",
      onPrimary: "#FFFFFF",
      accent: "#C9673B",
      soft1: "#F8DED0",
      soft2: "#D6F1ED",
      soft3: "#F3E5B7",
    },
  },
  {
    id: "plum-mint",
    name: "Plum Mint",
    nameZh: "紫晶薄荷",
    description: "A more expressive violet system with fresh mint support.",
    colors: {
      bg: "#F7F4FC",
      surface: "#FFFFFF",
      text: "#302541",
      muted: "#756B82",
      border: "#E4DDEF",
      primary: "#6C3CC4",
      onPrimary: "#FFFFFF",
      accent: "#18A78F",
      soft1: "#E9DDFB",
      soft2: "#D7F3EB",
      soft3: "#FFDCCD",
    },
  },
];

function savedThemeChoice() {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem(STORAGE_KEY);
  return THEMES.some((theme) => theme.id === saved) ? saved : null;
}

export const Route = createFileRoute("/_authenticated/theme-preview")({
  head: () => ({ meta: [{ title: "Theme preview — Ren Report" }] }),
  component: ThemePreview,
});

function ThemePreview() {
  const { language, t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(
    () => savedThemeChoice() ?? APPLIED_THEME_ID,
  );
  const [active, setActive] = useState(() => savedThemeChoice() ?? APPLIED_THEME_ID);
  const copy =
    language === "zh"
      ? {
          title: "选择配色方向",
          note: "这是临时预览页。选择只会保存你的偏好，暂时不会更改正式界面。",
          select: "选择此风格",
          selected: "已选作评审",
          applied: "当前应用",
        }
      : {
          title: "Choose a color direction",
          note: "This is a temporary preview. Choosing saves your preference but does not change the live app yet.",
          select: "Select this style",
          selected: "Selected for review",
          applied: "Applied theme",
        };

  function choose(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    setSelected(id);
  }

  return (
    <div>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Sparkles className="size-4 text-warning" />
            {t("Ren Report")}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{copy.note}</p>
        </div>
        {selected ? (
          <Badge variant="secondary" className="w-fit gap-1.5 py-1">
            <Check className="size-3.5" />
            {selected === APPLIED_THEME_ID ? copy.applied : copy.selected}:{" "}
            {THEMES.find((theme) => theme.id === selected)?.name}
          </Badge>
        ) : null}
      </header>

      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {THEMES.map((theme) => (
            <TabsTrigger key={theme.id} value={theme.id} className="min-h-9">
              {theme.nameZh} / {theme.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {THEMES.map((theme) => (
          <TabsContent key={theme.id} value={theme.id} className="mt-4">
            <ThemeMockup
              theme={theme}
              isSelected={selected === theme.id}
              selectLabel={
                theme.id === APPLIED_THEME_ID
                  ? copy.applied
                  : selected === theme.id
                    ? copy.selected
                    : copy.select
              }
              onSelect={() => choose(theme.id)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ThemeMockup({
  theme,
  isSelected,
  selectLabel,
  onSelect,
}: {
  theme: ThemeCandidate;
  isSelected: boolean;
  selectLabel: string;
  onSelect: () => void;
}) {
  const style = {
    "--preview-bg": theme.colors.bg,
    "--preview-surface": theme.colors.surface,
    "--preview-text": theme.colors.text,
    "--preview-muted": theme.colors.muted,
    "--preview-border": theme.colors.border,
    "--preview-primary": theme.colors.primary,
    "--preview-on-primary": theme.colors.onPrimary,
    "--preview-accent": theme.colors.accent,
    "--preview-soft-1": theme.colors.soft1,
    "--preview-soft-2": theme.colors.soft2,
    "--preview-soft-3": theme.colors.soft3,
  } as CSSProperties;

  return (
    <section
      style={style}
      className="overflow-hidden rounded-3xl border border-[var(--preview-border)] bg-[var(--preview-bg)] text-[var(--preview-text)] shadow-sm"
    >
      <header className="flex items-center justify-between border-b border-[var(--preview-border)] bg-[var(--preview-surface)] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[var(--preview-primary)] text-[var(--preview-on-primary)]">
            <Pickaxe className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">
              {theme.nameZh} / {theme.name}
            </h2>
            <p className="text-xs text-[var(--preview-muted)]">{theme.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Notifications"
            className="grid size-9 place-items-center rounded-full bg-[var(--preview-soft-1)] text-[var(--preview-text)]"
          >
            <Bell className="size-4" />
          </button>
          <div className="grid size-9 place-items-center rounded-full bg-[var(--preview-primary)] text-xs font-bold text-[var(--preview-on-primary)]">
            T
          </div>
        </div>
      </header>

      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.35fr_0.85fr]">
        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-2 rounded-xl bg-[var(--preview-soft-2)] p-1 text-sm font-medium">
            <div className="rounded-lg bg-[var(--preview-surface)] px-3 py-2 text-center shadow-sm">
              我的任务 / My tasks
            </div>
            <div className="px-3 py-2 text-center text-[var(--preview-muted)]">团队任务 / Team</div>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <PreviewStat
              icon={ClipboardCheck}
              label="Work logs"
              value="18"
              color="var(--preview-soft-1)"
            />
            <PreviewStat icon={Clock3} label="Hours" value="42.5" color="var(--preview-soft-2)" />
            <PreviewStat
              icon={FolderKanban}
              label="Projects"
              value="4"
              color="var(--preview-soft-3)"
            />
          </div>

          <article className="mt-4 rounded-2xl border border-[var(--preview-border)] bg-[var(--preview-surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--preview-muted)]">
                  Active project
                </p>
                <h3 className="mt-1 text-lg font-semibold">Zoloto Gold Mine</h3>
                <p className="text-sm text-[var(--preview-muted)]">Exploration · Mongolia</p>
              </div>
              <Badge className="border-0 bg-[var(--preview-soft-2)] text-[var(--preview-primary)] shadow-none">
                Active
              </Badge>
            </div>
            <div className="mt-5 flex items-center justify-between text-xs">
              <span>Milestone progress</span>
              <span className="font-semibold">68%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--preview-soft-2)]">
              <div className="h-full w-[68%] rounded-full bg-[var(--preview-primary)]" />
            </div>
          </article>
        </div>

        <aside className="space-y-3">
          <article className="rounded-2xl bg-[var(--preview-primary)] p-4 text-[var(--preview-on-primary)]">
            <div className="flex items-center justify-between">
              <div className="grid size-9 place-items-center rounded-xl bg-white/15">
                <WalletCards className="size-4" />
              </div>
              <span className="text-xs opacity-75">Current fund</span>
            </div>
            <p className="mt-5 text-2xl font-semibold">USD 280,400</p>
            <p className="mt-1 text-xs opacity-75">After approved expenses</p>
          </article>
          <article className="rounded-2xl border border-[var(--preview-border)] bg-[var(--preview-surface)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Today’s activity</h3>
              <Users className="size-4 text-[var(--preview-muted)]" />
            </div>
            <div className="space-y-3 text-sm">
              <ActivityDot
                color="var(--preview-accent)"
                text="Survey team submitted exploration log"
              />
              <ActivityDot color="var(--preview-primary)" text="Expense awaiting approval" />
              <ActivityDot color="var(--preview-soft-3)" text="Milestone reached 68%" />
            </div>
          </article>
        </aside>
      </div>

      <footer className="flex flex-col gap-3 border-t border-[var(--preview-border)] bg-[var(--preview-surface)] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex gap-2" aria-label="Palette colors">
          {Object.values(theme.colors)
            .slice(6)
            .map((color) => (
              <span
                key={color}
                className="size-6 rounded-full border border-black/5"
                style={{ backgroundColor: color }}
              />
            ))}
        </div>
        <Button
          type="button"
          onClick={onSelect}
          className="bg-[var(--preview-primary)] text-[var(--preview-on-primary)] hover:bg-[var(--preview-primary)] hover:opacity-90"
        >
          {isSelected ? <Check /> : <Sparkles />}
          {selectLabel}
        </Button>
      </footer>
    </section>
  );
}

function PreviewStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="min-w-40 flex-1 rounded-2xl p-4" style={{ backgroundColor: color }}>
      <Icon className="size-4 text-[var(--preview-primary)]" />
      <p className="mt-4 text-xs font-medium text-[var(--preview-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ActivityDot({ color, text }: { color: string; text: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <p className="leading-5 text-[var(--preview-muted)]">{text}</p>
    </div>
  );
}
