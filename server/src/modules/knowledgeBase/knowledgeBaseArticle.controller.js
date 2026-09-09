const service = require("./knowledgeBaseArticle.service");
const asyncHandler = require("../../utils/asyncHandler");

const createArticle = asyncHandler(async (req, res) => {
  const { categoryId, title, content } = req.body;
  const article = await service.createArticle({ categoryId, title, content, createdBy: req.user.id });
  res.status(201).json({ success: true, message: "Knowledge Base article created successfully", data: { article } });
});

module.exports = { createArticle };
