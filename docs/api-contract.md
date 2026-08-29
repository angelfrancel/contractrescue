# Reservation API Contract

## Create a reservation

`POST /api/reservations`

Request body:

```json
{
  "itemId": "item-001",
  "buyerId": "buyer-001"
}
```

### Successful reservation

- Status: `201 Created`
- Body includes `reservationId`, `itemId`, `buyerId`, and `status`.

### Duplicate reservation

When the requested item already has an active reservation:

- Status: `409 Conflict`
- Error code: `RESERVATION_CONFLICT`
- The client may show a conflict-specific message without retrying automatically.

This document is the product owner's written expectation. Implementations and tests must not silently override it.

