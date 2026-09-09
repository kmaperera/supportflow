const service = require("./articleFeedback.service");
const asyncHandler = require("../../utils/asyncHandler");

const setArticleFeedback = asyncHandler(async (req, res) => {
  const data = await service.setArticleFeedback({ articleId: req.params.articleId, userId: req.user.id,
    userRole: req.user.role, isHelpful: req.body.isHelpful });
  res.status(200).json({ success: true, message: "Knowledge Base article feedback saved successfully", data });
});

const getArticleFeedback = asyncHandler(async (req, res) => {
  const data = await service.getArticleFeedback({ articleId: req.params.articleId, userId: req.user.id, userRole: req.user.role });
  res.status(200).json({ success: true, message: "Knowledge Base article feedback retrieved successfully", data });
});

module.exports = { setArticleFeedback, getArticleFeedback };
