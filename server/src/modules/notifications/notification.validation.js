const { query } = require("express-validator");

const getNotificationsValidation = [
  query().custom((value) => {
    if (Object.keys(value).some((key) => !["page", "limit", "unreadOnly"].includes(key))) {
      throw new Error("Unsupported notification query parameter");
    }
    return true;
  }),
  query("page").optional().custom((value) =>
    typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)))
    .withMessage("Page must be a positive integer"),
  query("limit").optional().custom((value) =>
    typeof value === "string" && /^[1-9]\d*$/.test(value) && Number(value) <= 100)
    .withMessage("Limit must be between 1 and 100"),
  query("unreadOnly").optional().custom((value) => value === "true" || value === "false")
    .withMessage("unreadOnly must be true or false"),
];

module.exports = { getNotificationsValidation };
