const { body, param, query } = require("express-validator");

function validId(value) {
  return ["string", "number"].includes(typeof value) &&
    (typeof value !== "number" || Number.isSafeInteger(value)) && /^[1-9]\d*$/.test(String(value)) &&
    String(value).length <= 20 && BigInt(value) <= 18446744073709551615n;
}
function validRating(value) { return Number.isInteger(value) && value >= 1 && value <= 5; }
function validComment(value) { return value === undefined || (typeof value === "string" && Array.from(value.trim()).length <= 1000); }

const saveTicketFeedbackValidation = [
  param("ticketId").custom(validId).withMessage("Ticket ID must be a positive integer"),
  query().custom(value => Object.keys(value).length === 0).withMessage("Query parameters are not supported"),
  body().custom(value => value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every(key => ["rating", "comment"].includes(key))).withMessage("Only rating and comment may be provided"),
  body("rating").custom(validRating).withMessage("Rating must be an integer from 1 to 5"),
  body("comment").custom(validComment).withMessage("Comment must be a string of at most 1000 characters"),
];
module.exports = { saveTicketFeedbackValidation, validId, validRating, validComment };
