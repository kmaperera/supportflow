const router = require('express').Router();
const authenticate = require('../../middleware/authenticate');
const authorizeRoles = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const { USER_ROLES } = require('../../constants/roles');
const { listValidation } = require('./audit.validation');
router.get('/', authenticate, authorizeRoles(USER_ROLES.ADMIN), listValidation, validate, require('./audit.controller').getLogs);
module.exports = router;
