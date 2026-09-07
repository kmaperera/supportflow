const { body, query, param } = require("express-validator");

const positiveId = (value) => {
  if (!(["string", "number"].includes(typeof value)) ||
      (typeof value === "number" && !Number.isSafeInteger(value))) return false;
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && id.length <= 20 && BigInt(id) <= 18446744073709551615n;
};

const createTicketValidation = [
  body().custom((value) => {
    const allowed = ["categoryId", "priorityId", "title", "description"];
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error("Only categoryId, priorityId, title, and description are allowed");
    }
    return true;
  }),
  body("categoryId").custom(positiveId).withMessage("Category ID must be a positive integer"),
  body("priorityId").custom(positiveId).withMessage("Priority ID must be a positive integer"),
  body("title").isString().withMessage("Title is required").bail()
    .trim().isLength({ min: 5, max: 200 }).withMessage("Title must be 5 to 200 characters"),
  body("description").isString().withMessage("Description is required").bail()
    .trim().isLength({ min: 10, max: 5000 }).withMessage("Description must be 10 to 5000 characters"),
];

const getMyTicketsValidation = [
  query().custom((value) => {
    const allowed = ["page", "limit", "search", "status", "categoryId", "priorityId", "sortBy", "order"];
    if (Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error("Unsupported ticket query parameter");
    }
    return true;
  }),
  query("page").optional().custom((value) => positiveId(value) && Number.isSafeInteger(Number(value)))
    .withMessage("Page must be a positive integer"),
  query("limit").optional().custom((value) => positiveId(value) && Number(value) <= 100)
    .withMessage("Limit must be between 1 and 100"),
  query("search").optional().isString().bail().trim().isLength({ max: 200 }),
  query("categoryId").optional().custom(positiveId).withMessage("Invalid category ID"),
  query("priorityId").optional().custom(positiveId).withMessage("Invalid priority ID"),
  query("status").optional().isString().bail()
    .isIn(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "REOPENED"]),
  query("sortBy").optional().isString().bail()
    .isIn(["created_at", "updated_at", "ticket_number", "title", "status", "priority"]),
  query("order").optional().isString().bail().toLowerCase().isIn(["asc", "desc"]),
];

const ticketIdValidation = [
  param("id").custom(positiveId).withMessage("Ticket ID must be a positive integer"),
];

const updateEmployeeTicketValidation = [
  ...ticketIdValidation,
  body().custom((value) => {
    const allowed = ["categoryId", "priorityId", "title", "description"];
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        !Object.keys(value).length || Object.keys(value).some((key) => !allowed.includes(key))) {
      throw new Error("Supply at least one of categoryId, priorityId, title, or description; other fields are not allowed");
    }
    return true;
  }),
  body("categoryId").optional().custom(positiveId).withMessage("Invalid category ID"),
  body("priorityId").optional().custom(positiveId).withMessage("Invalid priority ID"),
  body("title").optional().isString().bail().trim().isLength({ min: 5, max: 200 })
    .withMessage("Title must be 5 to 200 characters"),
  body("description").optional().isString().bail().trim().isLength({ min: 10, max: 5000 })
    .withMessage("Description must be 10 to 5000 characters"),
];

const ticketQueueValidation = [
  query().custom((value) => {
    const allowed = ["page", "limit", "search", "status", "categoryId", "priorityId", "assignedTo", "assignment", "sortBy", "order"];
    if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Unsupported queue query parameter");
    return true;
  }),
  query("page").optional().custom((value) => positiveId(value) && Number.isSafeInteger(Number(value)))
    .withMessage("Page must be a positive integer"),
  query("limit").optional().custom((value) => positiveId(value) && Number(value) <= 100)
    .withMessage("Limit must be between 1 and 100"),
  query("search").optional().isString().bail().trim().isLength({ max: 200 }),
  query("categoryId").optional().custom(positiveId),
  query("priorityId").optional().custom(positiveId),
  query("assignedTo").optional().custom(positiveId),
  query("status").optional().isString().bail()
    .isIn(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED", "REOPENED"]),
  query("assignment").optional().isString().bail().isIn(["unassigned", "assigned", "mine"]),
  query("sortBy").optional().isString().bail()
    .isIn(["created_at", "updated_at", "ticket_number", "title", "status", "priority"]),
  query("order").optional().isString().bail().toLowerCase().isIn(["asc", "desc"]),
];

module.exports = { ticketQueueValidation, createTicketValidation, getMyTicketsValidation, ticketIdValidation, updateEmployeeTicketValidation };




