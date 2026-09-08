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

const updateSlaPolicy = asyncHandler(async (req, res) => {
  const { responseTimeMinutes, resolutionTimeMinutes } = req.body;
  const policy = await slaPolicyService.updatePolicy(req.params.policyId, {
    responseTimeMinutes,
    resolutionTimeMinutes,
  });
  res.status(200).json({
    success: true,
    message: "SLA policy updated successfully",
    data: { policy },
  });
});

module.exports = { getSlaPolicies, updateSlaPolicy };
