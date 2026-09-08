const slaPolicyService = require("./slaPolicy.service");
const asyncHandler = require("../../utils/asyncHandler");

const getSlaPolicies = asyncHandler(async (req, res) => {
  const policies = await slaPolicyService.getAllPolicies();
  res.status(200).json({
    success: true,
    message: "SLA policies retrieved successfully",
    data: { policies },
  });
});

module.exports = { getSlaPolicies };
