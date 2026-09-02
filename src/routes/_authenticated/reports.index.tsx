import { createFileRoute, redirect } from "@tanstack/react-router";

// "My work" now lives on the home page. Keep this route so existing links and
// bookmarks to /reports land on the merged view instead of a 404.
export const Route = createFileRoute("/_authenticated/reports/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => null,
});
