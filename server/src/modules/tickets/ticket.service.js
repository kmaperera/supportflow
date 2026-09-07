const pool = require("../../config/database");
const ticketRepository = require("./ticket.repository");
const { generateTicketNumber } = require("../../utils/ticketNumber");
const ApiError = require("../../utils/ApiError");

function mapTicket(row) {
  return {
    id: row.id, ticketNumber: row.ticket_number,
    title: row.title, description: row.description, status: row.status,
    createdBy: row.created_by,
    creator: { id: row.created_by, firstName: row.creator_first_name, lastName: row.creator_last_name, email: row.creator_email },
    category: { id: row.category_id, name: row.category_name },
    priority: { id: row.priority_id, name: row.priority_name, sortOrder: row.priority_sort_order },
    assignedTo: row.assigned_to,
    assignee: row.assigned_to == null ? null : {
      id: row.assigned_to, firstName: row.assignee_first_name,
      lastName: row.assignee_last_name, email: row.assignee_email,
    },
    firstResponseAt: row.first_response_at, resolvedAt: row.resolved_at,
    closedAt: row.closed_at, resolutionSummary: row.resolution_summary,
    slaResponseDueAt: row.sla_response_due_at, slaResolutionDueAt: row.sla_resolution_due_at,
    slaResponseBreached: Boolean(row.sla_response_breached),
    slaResolutionBreached: Boolean(row.sla_resolution_breached),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function createTicket(userId, ticketData) {
  const id = String(userId);
  if (!["string", "number"].includes(typeof userId) ||
      (typeof userId === "number" && !Number.isSafeInteger(userId)) ||
      !/^[1-9]\d*$/.test(id) || id.length > 20 || BigInt(id) > 18446744073709551615n) {
    throw new ApiError(400, "User ID must be a positive integer");
  }
  const { categoryId, priorityId, title, description } = ticketData;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const category = await ticketRepository.findCategoryById(categoryId, connection);
    if (!category) throw new ApiError(404, "Ticket category not found");
    if (!category.is_active) throw new ApiError(400, "Selected ticket category is inactive");
    const priority = await ticketRepository.findPriorityById(priorityId, connection);
    if (!priority) throw new ApiError(404, "Ticket priority not found");
    if (!priority.is_active) throw new ApiError(400, "Selected ticket priority is inactive");

    const ticketId = await ticketRepository.create({
      createdBy: userId, categoryId, priorityId, title, description,
    }, connection);
    const ticketNumber = generateTicketNumber(ticketId);
    const affectedRows = await ticketRepository.assignTicketNumber(ticketId, ticketNumber, connection);
    if (affectedRows !== 1) throw new Error("Ticket number assignment failed");
    const row = await ticketRepository.findById(ticketId, connection);
    if (!row) throw new Error("Created ticket could not be retrieved");
    const ticket = mapTicket(row);
    await connection.commit();
    return ticket;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original creation error if rollback also fails.
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { createTicket };
