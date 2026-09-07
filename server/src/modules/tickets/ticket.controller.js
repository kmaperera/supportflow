const service = require("./ticket.service");
const asyncHandler = require("../../utils/asyncHandler");

const createTicket = asyncHandler(async (req, res) => {
  const { categoryId, priorityId, title, description } = req.body;
  const ticket = await service.createTicket(req.user.id, { categoryId, priorityId, title, description });
  res.status(201).json({ success: true, message: "Ticket created successfully", data: { ticket } });
});

module.exports = { createTicket };
