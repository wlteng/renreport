export const PROJECT_CATEGORY_OPTIONS = [
  { value: "mine", label: "Mine" },
  { value: "website", label: "Website" },
  { value: "software", label: "Software" },
  { value: "construction", label: "Construction" },
  { value: "investment", label: "Investment" },
  { value: "operations", label: "Operations" },
  { value: "other", label: "Other" },
] as const;

export const PROJECT_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  PROJECT_CATEGORY_OPTIONS.map((category) => [category.value, category.label]),
);

export const PROJECT_LEGAL_NAME_LABEL: Record<string, string> = {
  mine: "Legal name",
  website: "Owner / company",
  software: "Publisher / company",
  construction: "Contractor / legal name",
  investment: "Investment target",
  operations: "Operating unit",
  other: "Reference name",
};

export const PROJECT_LOCATION_LABEL: Record<string, string | undefined> = {
  mine: "Location",
  construction: "Site address",
  investment: "Location",
  operations: "Operating location",
  other: "Location",
};

export const PROJECT_URL_LABEL: Record<string, string | undefined> = {
  website: "Website URL",
  software: "Web address",
};

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  maintenance: "Ongoing maintenance",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

/** Badge tones per project status, drawn from the logbook stat palette. */
export const PROJECT_STATUS_TONE: Record<string, string> = {
  active: "border-transparent bg-stat-teal text-secondary-foreground",
  maintenance: "border-transparent bg-stat-copper text-accent-foreground",
  paused: "border-transparent bg-stat-gold text-foreground",
  completed: "border-transparent bg-stat-violet text-foreground",
  archived: "border-transparent bg-muted text-muted-foreground",
};

/** Display order on the projects list: live work first, archived last. */
export const PROJECT_STATUS_ORDER: Record<string, number> = {
  active: 0,
  maintenance: 1,
  paused: 2,
  completed: 3,
  archived: 4,
};

export function isProjectWorkEnabled(status: string) {
  return status === "active" || status === "maintenance";
}

/** Stable, readable URL key. The UUID suffix keeps projects with the same name distinct. */
export function projectSlug(project: {
  id: string;
  name: string;
  project_code?: string | null;
  slug?: string | null;
}) {
  if (project.slug) return project.slug;
  const source = project.project_code?.trim() || project.name;
  const base = source
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "project"}-${project.id.slice(0, 8)}`;
}

export const MINING_METHOD_LABEL: Record<string, string> = {
  alluvial: "Alluvial",
  open_pit: "Open pit",
  underground: "Underground",
  exploration: "Exploration",
  other: "Other",
};

export const LICENSE_STATUS_LABEL: Record<string, string> = {
  licensed: "Licensed",
  in_process: "In process",
  expired: "Expired",
  unknown: "Unknown",
};
