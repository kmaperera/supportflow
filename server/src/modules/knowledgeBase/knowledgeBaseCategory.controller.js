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

module.exports = { createCategory };
