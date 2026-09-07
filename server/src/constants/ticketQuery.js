const TICKET_SORT_COLUMNS = Object.freeze({
  created_at: "t.created_at",
  updated_at: "t.updated_at",
  ticket_number: "t.ticket_number",
  title: "t.title",
  status: "t.status",
  priority: "p.sort_order",
});
const TICKET_SORT_FIELDS = Object.freeze(Object.keys(TICKET_SORT_COLUMNS));
const TICKET_SORT_DIRECTIONS = Object.freeze(["asc", "desc"]);
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

module.exports = Object.freeze({
  TICKET_SORT_COLUMNS, TICKET_SORT_FIELDS, TICKET_SORT_DIRECTIONS,
  DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT,
});
