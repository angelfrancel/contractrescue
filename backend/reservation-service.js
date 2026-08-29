const reservations = new Map();
let nextId = 1;

export function resetReservations() {
  reservations.clear();
  nextId = 1;
}

export function createReservation({ itemId, buyerId }) {
  if (!itemId || !buyerId) {
    return {
      status: 400,
      body: { code: "INVALID_REQUEST", message: "itemId and buyerId are required." }
    };
  }

  if (reservations.has(itemId)) {
    // Intentionally wrong for the initial demo baseline.
    // The written contract and frontend expect HTTP 409.
    return {
      status: 400,
      body: {
        code: "RESERVATION_CONFLICT",
        message: "This item already has an active reservation."
      }
    };
  }

  const reservation = {
    reservationId: `res-${String(nextId++).padStart(3, "0")}`,
    itemId,
    buyerId,
    status: "active"
  };
  reservations.set(itemId, reservation);

  return { status: 201, body: reservation };
}

