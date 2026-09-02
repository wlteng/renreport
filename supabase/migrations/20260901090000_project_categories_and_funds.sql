-- Generalize projects beyond mining and add a simple project-fund baseline.
ALTER TABLE public.projects
  ADD COLUMN category TEXT NOT NULL DEFAULT 'mine',
  ADD COLUMN fund_amount NUMERIC(14,2),
  ADD COLUMN fund_currency TEXT NOT NULL DEFAULT 'USD',
  ADD CONSTRAINT projects_category_check CHECK (
    category IN ('mine', 'website', 'software', 'construction', 'investment', 'operations', 'other')
  ),
  ADD CONSTRAINT projects_fund_nonnegative CHECK (fund_amount IS NULL OR fund_amount >= 0),
  ADD CONSTRAINT projects_fund_currency_check CHECK (fund_currency IN ('CNY', 'RUB', 'USD', 'MYR'));

COMMENT ON COLUMN public.projects.category IS
  'High-level project category used to adapt the project form and detail page.';
COMMENT ON COLUMN public.projects.fund_amount IS
  'Starting project fund. Current fund is derived after non-rejected same-currency expenses.';
COMMENT ON COLUMN public.projects.fund_currency IS
  'ISO currency for the starting project fund.';

UPDATE public.permissions
SET label = 'Manage projects',
    description = 'Create and update projects across all supported categories.'
WHERE key = 'manage_projects';
