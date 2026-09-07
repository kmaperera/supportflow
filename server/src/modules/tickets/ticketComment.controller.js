const service = require("./ticketComment.service");
const asyncHandler = require("../../utils/asyncHandler");

const createPublicComment = asyncHandler(async (req, res) => {
  const comment = await service.createPublicComment(req.params.id, req.body.content, req.user);
  res.status(201).json({
    success: true, message: "Comment added successfully", data: { comment },
  });
});

module.exports = { createPublicComment };
