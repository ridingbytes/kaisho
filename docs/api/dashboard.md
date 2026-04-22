# Dashboard API

Summary metrics and time insights.

**Prefix:** `/api/dashboard`

## Dashboard Summary

```
GET /api/dashboard
```

Returns key metrics: task counts, inbox count, active timer,
customer budgets.

## Time Insights

```
GET /api/dashboard/time-insights?period=month
```

Returns daily and per-customer aggregations with billable totals.

```json
{
  "daily": [
    {"date": "2026-04-20", "hours": 6.5},
    {"date": "2026-04-21", "hours": 7.0}
  ],
  "by_customer": [
    {"customer": "Acme Corp", "hours": 42.5, "billable": 38.0}
  ],
  "total_hours": 120.5,
  "billable_hours": 98.0
}
```
