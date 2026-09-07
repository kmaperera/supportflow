const service = require("./ticket.service");
const asyncHandler = require("../../utils/asyncHandler");

const createTicket = asyncHandler(async (req, res) => {
  const { categoryId, priorityId, title, description } = req.body;
  const ticket = await service.createTicket(req.user.id, { categoryId, priorityId, title, description });
  res.status(201).json({ success: true, message: "Ticket created successfully", data: { ticket } });
});

const getMyTickets = asyncHandler(async (req, res) => {
  const { tickets, pagination } = await service.getMyTickets(req.user.id, req.query);
  res.status(200).json({
    success: true, message: "Tickets retrieved successfully",
    data: { tickets }, pagination,
  });
});

const getTicketById = asyncHandler(async (req, res) => {
  const ticket = await service.getTicketById(req.params.id, req.user);
  res.status(200).json({
    success: true,
    message: "Ticket retrieved successfully",
    data: { ticket },
  });
});

const updateEmployeeTicket = asyncHandler(async (req, res) => {
  const ticket = await service.updateEmployeeTicket(req.params.id, req.user.id, req.body);
  res.status(200).json({
    success: true, message: "Ticket updated successfully", data: { ticket },
  });
});

const getAssignedTicketsForTechnician = asyncHandler(async (req, res) => {
  const { tickets, pagination } = await service.getAssignedTicketsForTechnician(req.user.id, req.query);
  res.status(200).json({
    success: true, message: "Assigned tickets retrieved successfully", data: { tickets }, pagination,
  });
});

const getTicketQueue = asyncHandler(async (req, res) => {
  const { tickets, pagination } = await service.getTicketQueue(req.user, req.query);
  res.status(200).json({
    success: true, message: "Ticket queue retrieved successfully", data: { tickets }, pagination,
  });
});

const selfAssignTicket = asyncHandler(async (req, res) => {
  const ticket = await service.selfAssignTicket(req.params.id, req.user);
  res.status(200).json({
    success: true, message: "Ticket assigned to you successfully", data: { ticket },
  });
});

const unassignTicketByAdmin = asyncHandler(async (req, res) => {
  const ticket = await service.unassignTicketByAdmin(req.params.id, req.user);
  res.status(200).json({
    success: true, message: "Ticket unassigned successfully", data: { ticket },
  });
});

const assignTicketByAdmin = asyncHandler(async (req, res) => {
  const ticket = await service.assignTicketByAdmin(req.params.id, req.body.technicianId, req.user);
  res.status(200).json({
    success: true, message: "Ticket assigned successfully", data: { ticket },
  });
});

const updateTicketStatus = asyncHandler(async (req, res) => {
  const ticket = await service.updateTicketStatus(req.params.id, req.body.status, req.user);
  res.status(200).json({
    success: true, message: "Ticket status updated successfully", data: { ticket },
  });
});

const updateTicketPriority = asyncHandler(async (req, res) => {
  const ticket = await service.updateTicketPriority(req.params.id, req.body.priorityId, req.user);
  res.status(200).json({
    success: true, message: "Ticket priority updated successfully", data: { ticket },
  });
});

const resolveTicket = asyncHandler(async (req, res) => {
  const ticket = await service.resolveTicket(req.params.id, req.body.resolutionSummary, req.user);
  res.status(200).json({
    success: true, message: "Ticket resolved successfully", data: { ticket },
  });
});

const closeTicket = asyncHandler(async (req, res) => {
  const ticket = await service.closeTicket(req.params.id, req.user);
  res.status(200).json({
    success: true, message: "Ticket closed successfully", data: { ticket },
  });
});

const reopenTicket = asyncHandler(async (req, res) => {
  const ticket = await service.reopenTicket(req.params.id, req.user);
  res.status(200).json({
    success: true, message: "Ticket reopened successfully", data: { ticket },
  });
});

const getTicketAssignmentHistory = asyncHandler(async (req, res) => {
  const history = await service.getTicketAssignmentHistory(req.params.id, req.user);
  res.status(200).json({
    success: true, message: "Ticket assignment history retrieved successfully", data: { history },
  });
});

const getTicketStatusHistory = asyncHandler(async (req, res) => {
  const history = await service.getTicketStatusHistory(req.params.id, req.user);
  res.status(200).json({
    success: true, message: "Ticket status history retrieved successfully", data: { history },
  });
});

module.exports = { getAssignedTicketsForTechnician, unassignTicketByAdmin, getTicketAssignmentHistory, getTicketStatusHistory, reopenTicket, closeTicket, resolveTicket, updateTicketPriority, updateTicketStatus, assignTicketByAdmin, selfAssignTicket, getTicketQueue, createTicket, getMyTickets, getTicketById, updateEmployeeTicket };






