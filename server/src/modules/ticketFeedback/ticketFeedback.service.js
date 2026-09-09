const pool = require("../../config/database");
const tickets = require("../tickets/ticket.repository");
const repository = require("./ticketFeedback.repository");
const ApiError = require("../../utils/ApiError");
const { USER_ROLES } = require("../../constants/roles");
const { validId, validRating, validComment } = require("./ticketFeedback.validation");

async function saveTicketFeedback({ ticketId, userId, userRole, rating, comment }) {
  if (!validId(userId)) throw new ApiError(401, "Authentication required");
  if (userRole !== USER_ROLES.EMPLOYEE) throw new ApiError(403, "You do not have permission to access this resource");
  if (!validId(ticketId)) throw new ApiError(422, "Ticket ID must be a positive integer");
  if (!validRating(rating)) throw new ApiError(422, "Rating must be an integer from 1 to 5");
  if (!validComment(comment)) throw new ApiError(422, "Comment must be a string of at most 1000 characters");
  const normalizedComment = comment === undefined ? null : comment.trim() || null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Serialize saves and keep ownership/status stable using the existing lifecycle lock.
    if (!(await tickets.lockById(ticketId, connection))) throw new ApiError(404, "Ticket not found");
    const ticket = await tickets.findById(ticketId, connection);
    if (!ticket || String(ticket.created_by) !== String(userId)) throw new ApiError(404, "Ticket not found");
    if (ticket.status !== "CLOSED") throw new ApiError(409, "Ticket feedback can only be submitted for a closed ticket");
    const existing = await repository.findByTicketId(ticketId, connection);
    if (existing && String(existing.user_id) !== String(userId)) {
      throw new ApiError(409, "Ticket feedback ownership is inconsistent");
    }
    if (!existing) {
      await repository.create({ ticketId, userId, rating, comment: normalizedComment }, connection);
    } else if (Number(existing.rating) !== rating || existing.comment !== normalizedComment) {
      await repository.updateByTicketId({ ticketId, rating, comment: normalizedComment }, connection);
    }
    const row = await repository.findByTicketId(ticketId, connection);
    if (!row) throw new Error("Saved ticket feedback could not be retrieved");
    const feedback = { ticketId: Number(row.ticket_id), rating: Number(row.rating), comment: row.comment,
      createdAt: row.created_at, updatedAt: row.updated_at };
    await connection.commit();
    return feedback;
  } catch (error) {
    try { await connection.rollback(); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    connection.release();
  }
}
module.exports = { saveTicketFeedback };
