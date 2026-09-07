const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorizeRoles = require("../../middleware/authorize");
const validate = require("../../middleware/validate");
const { USER_ROLES } = require("../../constants/roles");
const controller = require("./user.controller");
const { assignableTechniciansValidation, createUserValidation, updateUserValidation, userIdValidation, updateUserStatusValidation, updateUserRoleValidation } = require("./user.validation");

const router = express.Router();
router.use(authenticate, authorizeRoles(USER_ROLES.ADMIN));
router.get("/", controller.getUsers);
router.post("/", createUserValidation, validate, controller.createUser);
router.get("/assignable-technicians", assignableTechniciansValidation, validate, controller.getAssignableTechnicians);
router.get("/technician-workload", assignableTechniciansValidation, validate, controller.getTechnicianWorkload);
router.get("/:id", userIdValidation, validate, controller.getUserById);
router.patch("/:id", userIdValidation, updateUserValidation, validate, controller.updateUser);

router.patch("/:id/status", updateUserStatusValidation, validate, controller.updateUserStatus);

router.patch("/:id/role", updateUserRoleValidation, validate, controller.updateUserRole);

module.exports = router;


