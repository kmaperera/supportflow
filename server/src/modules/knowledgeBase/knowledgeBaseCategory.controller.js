const service = require("./knowledgeBaseCategory.service");
const asyncHandler = require("../../utils/asyncHandler");

const createCategory = asyncHandler(async (req, res) => {
  const category = await service.createCategory(req.body);
  res.status(201).json({
    success: true,
    message: "Knowledge Base category created successfully",
    data: { category },
  });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await service.updateCategory(req.params.categoryId, req.body);
  res.status(200).json({ success: true, message: "Knowledge Base category updated successfully", data: { category } });
});

const setCategoryActiveStatus = asyncHandler(async (req, res) => {
  const category = await service.setCategoryActiveStatus(req.params.categoryId, req.body.isActive);
  res.status(200).json({ success: true, message: "Knowledge Base category status updated successfully", data: { category } });
});

module.exports = { createCategory, updateCategory, setCategoryActiveStatus };
