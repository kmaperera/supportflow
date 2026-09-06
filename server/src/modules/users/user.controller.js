const service = require("./user.service");
const asyncHandler = require("../../utils/asyncHandler");

const createUser = asyncHandler(async (req, res) => {
  const user = await service.createUser(req.body);
  res.status(201).json({ success: true, message: "User created successfully", data: { user } });
});
const getUsers = asyncHandler(async (req, res) => {
  const { users, pagination } = await service.getUsers(req.query);
  res.status(200).json({ success: true, message: "Users retrieved successfully", data: { users }, pagination });
});
const getUserById = asyncHandler(async (req, res) => {
  const user = await service.getUserById(req.params.id);
  res.status(200).json({ success: true, message: "User retrieved successfully", data: { user } });
});
const updateUser = asyncHandler(async (req, res) => {
  const user = await service.updateUser(req.params.id, req.body);
  res.status(200).json({ success: true, message: "User updated successfully", data: { user } });
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const user = await service.updateUserStatus(req.params.id, req.body.isActive, req.user.id);
  res.status(200).json({
    success: true,
    message: "User status updated successfully",
    data: { user },
  });
});

module.exports = { createUser, getUsers, getUserById, updateUser, updateUserStatus };

