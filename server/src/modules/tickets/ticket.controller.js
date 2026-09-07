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

module.exports = { createTicket, getMyTickets };

