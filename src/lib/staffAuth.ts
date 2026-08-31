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
