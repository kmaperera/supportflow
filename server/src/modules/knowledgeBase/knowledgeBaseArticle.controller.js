const service = require("./knowledgeBaseArticle.service");
const asyncHandler = require("../../utils/asyncHandler");

const createArticle = asyncHandler(async (req, res) => {
  const { categoryId, title, content } = req.body;
  const article = await service.createArticle({ categoryId, title, content, createdBy: req.user.id });
  res.status(201).json({ success: true, message: "Knowledge Base article created successfully", data: { article } });
});

const updateArticle = asyncHandler(async (req, res) => {
  const article = await service.updateArticle(req.params.articleId, req.body);
  res.status(200).json({ success: true, message: "Knowledge Base article updated successfully", data: { article } });
});

const publishArticle = asyncHandler(async (req, res) => {
  const article = await service.publishArticle(req.params.articleId);
  res.status(200).json({ success: true, message: "Knowledge Base article published successfully", data: { article } });
});

const unpublishArticle = asyncHandler(async (req, res) => {
  const article = await service.unpublishArticle(req.params.articleId);
  res.status(200).json({ success: true, message: "Knowledge Base article unpublished successfully", data: { article } });
});

const archiveArticle = asyncHandler(async (req, res) => {
  const article = await service.archiveArticle(req.params.articleId);
  res.status(200).json({ success: true, message: "Knowledge Base article archived successfully", data: { article } });
});

module.exports = { createArticle, updateArticle, publishArticle, unpublishArticle, archiveArticle };
