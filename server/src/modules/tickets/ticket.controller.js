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

module.exports = { selfAssignTicket, getTicketQueue, createTicket, getMyTickets, getTicketById, updateEmployeeTicket };





