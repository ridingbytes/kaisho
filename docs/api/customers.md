# Customers API

Customer and contract management.

**Prefix:** `/api/customers`

## List Customers

```
GET /api/customers?include_inactive=false
```

## Get Customer

```
GET /api/customers/{name}
```

## Create Customer

```
POST /api/customers
```

**Body:**

```json
{
  "name": "Acme Corp",
  "status": "active",
  "type": "agency",
  "color": "#14b8a6",
  "budget": 100,
  "repo": "acmeinc/main-app",
  "tags": ["enterprise"]
}
```

## Update Customer

```
PATCH /api/customers/{name}
```

Accepts any customer fields as a JSON object.

## Delete Customer

```
DELETE /api/customers/{name}
```

## Contracts

### List Contracts

```
GET /api/customers/{name}/contracts
```

### Add Contract

```
POST /api/customers/{name}/contracts
```

**Body:**

```json
{
  "name": "Q2 2026",
  "budget": 120,
  "start_date": "2026-04-01",
  "notes": "Includes design and development",
  "billable": true,
  "invoiced": 0
}
```

### Update Contract

```
PATCH /api/customers/{name}/contracts/{contract_name}
```

### Delete Contract

```
DELETE /api/customers/{name}/contracts/{contract_name}
```
