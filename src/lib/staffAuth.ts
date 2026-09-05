import { supabase } from "@/integrations/supabase/client";

export const STAFF_LOGIN_DOMAIN = "staff.renreport.invalid";

export const normalizeStaffUsername = (value: string) => value.trim().toLowerCase();

export const staffUsernameToEmail = (username: string) =>
  `${normalizeStaffUsername(username)}@${STAFF_LOGIN_DOMAIN}`;

export const loginIdentifierToEmail = (identifier: string) => {
  const normalized = identifier.trim().toLowerCase();
  return normalized.includes("@") ? normalized : staffUsernameToEmail(normalized);
};

export const isStaffLoginEmail = (email: string) => email.endsWith(`@${STAFF_LOGIN_DOMAIN}`);

export const staffLoginLabel = (email: string) => {
  const suffix = `@${STAFF_LOGIN_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
};

/**
 * Turn whatever the user typed into the address Supabase Auth expects.
 *
 * A username is now stored on the profile rather than being implied by the
 * login address, so an admin can rename someone without breaking their login.
 * The lookup only ever returns synthetic staff addresses, so it cannot be used
 * to discover a real email. Falls back to the historical
 * `<username>@staff.renreport.invalid` transform when the lookup finds nothing,
 * which keeps accounts created before this change working.
 */
export async function resolveLoginEmail(identifier: string): Promise<string> {
  const normalized = identifier.trim().toLowerCase();
  if (normalized.includes("@")) return normalized;

  const { data, error } = await supabase.rpc("login_email_for_username", {
    p_username: normalized,
  });
  if (!error && typeof data === "string" && data.length > 0) return data;
  return staffUsernameToEmail(normalized);
}
