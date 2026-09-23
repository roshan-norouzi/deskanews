# Phase 6 — hot reads

The news list no longer returns `originalContent`. The social list no longer returns `originalText` or `rewrittenText`. The detail and publish routes still load those fields.

Dashboard newsroom totals are eight indexed counts. They follow the same rules as `computeNewsroomDashboardStats`. A title that is only spaces still counts as prepared in SQL; the in-memory helper trims.
