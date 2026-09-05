import { staffLoginLabel } from "@/lib/staffAuth";

type PersonIdentity = {
  full_name: string | null | undefined;
  email: string | null | undefined;
};

/** A safe directory label that does not require another person's email. */
export function personDisplayName(person: PersonIdentity, fallback = "Unknown user"): string {
  return person.full_name?.trim() || (person.email ? staffLoginLabel(person.email) : fallback);
}

/** Up to two initials for an avatar fallback, from a full name or an email. */
export function personInitials(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join("")
      .toUpperCase();
  }
  return email?.slice(0, 1).toUpperCase() || "U";
}
