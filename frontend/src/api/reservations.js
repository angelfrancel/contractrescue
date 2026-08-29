export const DUPLICATE_RESERVATION_STATUS = 409;

export function interpretReservationResponse(status) {
  if (status === 201) {
    return { outcome: "reserved", message: "Reservation confirmed." };
  }

  if (status === DUPLICATE_RESERVATION_STATUS) {
    return {
      outcome: "conflict",
      message: "This item has already been reserved."
    };
  }

  return {
    outcome: "unexpected_error",
    message: "We could not interpret the reservation response."
  };
}

