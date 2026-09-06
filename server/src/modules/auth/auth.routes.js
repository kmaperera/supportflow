const express = require("express");
const { refresh, logout, logoutAll } = require("./auth.controller");

const router = express.Router();
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/logout-all", logoutAll);

module.exports = router;


