const service = require("./ticketFeedback.service");
const asyncHandler = require("../../utils/asyncHandler");

const saveTicketFeedback = asyncHandler(async (req, res) => {
  const feedback = await service.saveTicketFeedback({ ticketId: req.params.ticketId, userId: req.user.id,
    userRole: req.user.role, rating: req.body.rating, comment: req.body.comment });
  res.status(200).json({ success: true, message: "Ticket feedback saved successfully", data: { feedback } });
});
module.exports = { saveTicketFeedback };
