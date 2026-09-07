const { USER_ROLES } = require("../../constants/roles");
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

async function getMyTickets(userId, query = {}) {
  const id = String(userId);
  if (!["string", "number"].includes(typeof userId) ||
      (typeof userId === "number" && !Number.isSafeInteger(userId)) ||
      !/^[1-9]\d*$/.test(id) || id.length > 20 || BigInt(id) > 18446744073709551615n) {
    throw new ApiError(400, "User ID must be a positive integer");
  }
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 10);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) ||
      limit < 1 || limit > 100 || !Number.isSafeInteger(offset)) {
    throw new ApiError(400, "Invalid pagination options");
  }
  const options = {
    search: query.search?.trim(), status: query.status,
    categoryId: query.categoryId, priorityId: query.priorityId,
    sortBy: query.sortBy ?? "created_at", order: (query.order ?? "desc").toLowerCase(),
    limit, offset,
  };
  const [rows, totalRecords] = await Promise.all([
    ticketRepository.findByCreator(userId, options),
    ticketRepository.countByCreator(userId, options),
  ]);
  const totalPages = Math.ceil(totalRecords / limit);
  return {
    tickets: rows.map(mapTicket),
    pagination: {
      currentPage: page, limit, totalRecords, totalPages,
      hasNext: page < totalPages, hasPrevious: page > 1,
    },
  };
}

function isValidTicketUserId(value) {
  if (!["string", "number"].includes(typeof value) ||
      (typeof value === "number" && !Number.isSafeInteger(value))) return false;
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && id.length <= 20 && BigInt(id) <= 18446744073709551615n;
}

async function getTicketById(ticketId, currentUser) {
  if (!isValidTicketUserId(ticketId)) {
    throw new ApiError(400, "Ticket ID must be a positive integer");
  }
  if (!currentUser || !isValidTicketUserId(currentUser.id) ||
      typeof currentUser.role !== "string" || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }

  const ticket = await ticketRepository.findById(ticketId);
  if (!ticket) throw new ApiError(404, "Ticket not found");

  const userId = String(currentUser.id);
  const allowed = currentUser.role === USER_ROLES.ADMIN ||
    (currentUser.role === USER_ROLES.EMPLOYEE && String(ticket.created_by) === userId) ||
    (currentUser.role === USER_ROLES.TECHNICIAN &&
      (ticket.assigned_to === null || String(ticket.assigned_to) === userId));
  if (!allowed) throw new ApiError(404, "Ticket not found");
  return mapTicket(ticket);
}

async function updateEmployeeTicket(ticketId, currentUserId, updateData) {
  if (!isValidTicketUserId(ticketId) || !isValidTicketUserId(currentUserId)) {
    throw new ApiError(400, "Ticket ID and user ID must be positive integers");
  }
  const ticket = await ticketRepository.findById(ticketId);
  if (!ticket || String(ticket.created_by) !== String(currentUserId)) {
    throw new ApiError(404, "Ticket not found");
  }
  if (!["OPEN", "ASSIGNED"].includes(ticket.status)) {
    throw new ApiError(409, "Ticket can no longer be edited in its current status");
  }

  const allowed = ["categoryId", "priorityId", "title", "description"];
  const details = {};
  for (const key of allowed) {
    if (Object.hasOwn(updateData, key)) details[key] = updateData[key];
  }
  if (!Object.keys(details).length) throw new ApiError(400, "At least one editable field is required");

  if (details.categoryId !== undefined && String(details.categoryId) !== String(ticket.category_id)) {
    const category = await ticketRepository.findCategoryById(details.categoryId);
    if (!category) throw new ApiError(404, "Ticket category not found");
    if (!category.is_active) throw new ApiError(400, "Selected ticket category is inactive");
  }
  if (details.priorityId !== undefined && String(details.priorityId) !== String(ticket.priority_id)) {
    const priority = await ticketRepository.findPriorityById(details.priorityId);
    if (!priority) throw new ApiError(404, "Ticket priority not found");
    if (!priority.is_active) throw new ApiError(400, "Selected ticket priority is inactive");
  }
  await ticketRepository.updateEmployeeDetails(ticketId, details);
  const updated = await ticketRepository.findById(ticketId);
  if (!updated) throw new ApiError(404, "Ticket not found");
  return mapTicket(updated);
}

async function getTicketQueue(currentUser, query = {}) {
  if (!currentUser || !isValidTicketUserId(currentUser.id) || !currentUser.role) {
    throw new ApiError(401, "Authentication required");
  }
  if (![USER_ROLES.TECHNICIAN, USER_ROLES.ADMIN].includes(currentUser.role)) {
    throw new ApiError(403, "You do not have permission to access this resource");
  }
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 10);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) ||
      limit < 1 || limit > 100 || !Number.isSafeInteger(offset)) {
    throw new ApiError(400, "Invalid pagination options");
  }
  const options = {
    currentUserId: currentUser.id, currentUserRole: currentUser.role,
    search: query.search?.trim(), status: query.status,
    categoryId: query.categoryId, priorityId: query.priorityId,
    assignedTo: query.assignedTo, assignment: query.assignment,
    sortBy: query.sortBy, order: (query.order ?? "desc").toLowerCase(), limit, offset,
  };
  const [rows, totalRecords] = await Promise.all([
    ticketRepository.findQueue(options), ticketRepository.countQueue(options),
  ]);
  const totalPages = Math.ceil(totalRecords / limit);
  return {
    tickets: rows.map(mapTicket),
    pagination: { currentPage: page, limit, totalRecords, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
  };
}

module.exports = { getTicketQueue, createTicket, getMyTickets, getTicketById, updateEmployeeTicket };




