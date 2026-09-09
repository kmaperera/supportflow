const { USER_ROLES } = require("../../constants/roles");

const READER_FILTERS = Object.freeze({ status: "PUBLISHED", activeCategoryOnly: true });

function isReader(role) {
  return [USER_ROLES.EMPLOYEE, USER_ROLES.TECHNICIAN].includes(role);
}

function canReadArticle(article, role) {
  return Boolean(article && (role === USER_ROLES.ADMIN ||
    (isReader(role) && article.status === READER_FILTERS.status &&
      [true, 1, "1"].includes(article.category_is_active))));
}

module.exports = { READER_FILTERS, isReader, canReadArticle };
