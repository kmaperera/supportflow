// Call with the database-generated ticket ID, never a client-supplied number.
function generateTicketNumber(ticketId, year = new Date().getUTCFullYear()) {
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
    throw new TypeError("Ticket ID must be a positive safe integer");
  }
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new TypeError("Year must be a four-digit integer between 1000 and 9999");
  }

  return `SUP-${year}-${String(ticketId).padStart(6, "0")}`;
}

module.exports = { generateTicketNumber };
