# Ren Report demo accounts

The seed is intended only for a local or isolated staging database. It creates four accounts with a known password, so do not run it against production.

| Role    | Email                    | Password         | Report capability       |
| ------- | ------------------------ | ---------------- | ----------------------- |
| Admin   | `admin@renreport.test`   | `RenReport!2026` | View and submit         |
| Boss    | `boss@renreport.test`    | `RenReport!2026` | View all; cannot submit |
| Manager | `manager@renreport.test` | `RenReport!2026` | View all; cannot submit |
| Staff   | `staff@renreport.test`   | `RenReport!2026` | View and submit         |

The seed also creates Executive, Mine Operations, and Geology & Safety departments; an active Zoloto demo mine; compensation records; explicit enabled and disabled role-permission rows; project memberships; and one sample report per persona.

With Docker running, reset the local project to apply migrations and seed data:

```sh
supabase db reset
```

Then run the RLS capability test:

```sh
supabase test db supabase/tests/capability_matrix_rls.sql
```

The test impersonates every persona inside a rolled-back transaction. It checks own-report visibility, feed visibility, report insert/update access, audit visibility, and permission-matrix writes against the live RLS policies.
