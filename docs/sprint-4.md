# Sprint 4 — Lead Organization (Lightweight CRM)

Source of truth: [architecture.md](./architecture.md) §17.

## Objectives

- Implement the personal lead organizer: favorites, status, priority, follow-up date, and notes — explicitly not an outreach/automation CRM (§3, §20).
- Surface follow-ups due on the dashboard as a pull-based query, with no notifications or scheduled jobs.
- Implement bounded, streamed export to CSV/XLSX.
- Implement soft deletes for user-plane records.

## Deliverables

- `favorites` table and UI: save/unsave a business, set status (New/Reviewing/Qualified/Not a fit/Won), priority, `follow_up_at`.
- `notes` table and UI: attach/edit notes to a business, pin/unpin.
- Dashboard "follow-ups due today" section (pull-based query against `favorites.follow_up_at <= today`).
- Export endpoint (`/api/export`): streamed CSV/XLSX of selected leads, bounded size.
- Soft deletes (`deleted_at`) on `favorites` and `notes`, filtered centrally in `lib/db`.

**Working app milestone:** save, annotate, status-track, set follow-ups, and export leads.

## Progress

- [ ] Not started.
