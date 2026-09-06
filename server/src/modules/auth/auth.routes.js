const express = require("express");
const { refresh, logout } = require("./auth.controller");

const router = express.Router();
router.post("/refresh", refresh);
router.post("/logout", logout);

module.exports = router;

