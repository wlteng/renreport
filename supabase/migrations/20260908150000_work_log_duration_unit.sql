-- A work log records the duration as it was entered.
--
-- A five day site visit is five days, not 120 hours: pay is counted per day
-- for daily staff and per hour for hourly staff, so the unit has to survive.
-- hours_spent stays as the normalized figure older reports and totals use.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS duration_value NUMERIC(8, 2) NOT NULL DEFAULT 0
    CHECK (duration_value >= 0 AND duration_value <= 44640),
  ADD COLUMN IF NOT EXISTS duration_unit TEXT NOT NULL DEFAULT 'hours'
    CHECK (duration_unit IN ('days', 'hours', 'mins'));

-- Everything recorded before this change was entered in hours.
UPDATE public.reports
SET duration_value = hours_spent
WHERE duration_value = 0 AND hours_spent > 0;
