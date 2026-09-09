const repository = require("./articleFeedback.repository");
const articles = require("./knowledgeBaseArticle.repository");
const ApiError = require("../../utils/ApiError");
const { USER_ROLES } = require("../../constants/roles");

function validateId(value) {
  if (!["string", "number"].includes(typeof value) ||
      (typeof value === "number" && !Number.isSafeInteger(value)) ||
      !/^[1-9]\d*$/.test(String(value)) || String(value).length > 20 ||
      BigInt(value) > 18446744073709551615n) throw new ApiError(422, "ID must be a positive integer");
}

async function checkAccess({ articleId, userId, userRole }, writing, db) {
  validateId(articleId);
  if (userId === undefined || userId === null) throw new ApiError(401, "Authentication required");
  validateId(userId);
  if (writing && userRole === USER_ROLES.ADMIN) throw new ApiError(403, "Administrators cannot submit Knowledge Base article feedback");
  if (!Object.values(USER_ROLES).includes(userRole)) throw new ApiError(403, "You do not have permission to access this resource");
  const article = await articles.findById(articleId, db);
  if (!article || (userRole !== USER_ROLES.ADMIN &&
      (article.status !== "PUBLISHED" || ![true, 1, "1"].includes(article.category_is_active)))) {
    throw new ApiError(404, "Knowledge Base article not found");
  }
}

const helpful = value => [true, 1, "1"].includes(value);

async function summary(articleId, db) {
  const row = await repository.getSummaryByArticleId(articleId, db);
  return { helpfulCount: Number(row.helpful_count), notHelpfulCount: Number(row.not_helpful_count), totalFeedback: Number(row.total_feedback) };
}

async function getArticleFeedback(values, db) {
  await checkAccess(values, false, db);
  const { articleId, userId, userRole } = values;
  const row = userRole === USER_ROLES.ADMIN ? null : await repository.findByArticleAndUser(articleId, userId, db);
  return { feedback: row ? { isHelpful: helpful(row.is_helpful) } : null, summary: await summary(articleId, db) };
}

async function setArticleFeedback(values, db) {
  if (typeof values.isHelpful !== "boolean") throw new ApiError(422, "isHelpful must be a boolean");
  await checkAccess(values, true, db);
  const { articleId, userId, isHelpful } = values;
  let existing = await repository.findByArticleAndUser(articleId, userId, db);
  if (!existing) {
    try {
      await repository.create({ articleId, userId, isHelpful }, db);
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;
      existing = await repository.findByArticleAndUser(articleId, userId, db);
      if (!existing) throw new ApiError(409, "Knowledge Base article feedback changed concurrently. Please retry");
    }
  }
  if (existing && helpful(existing.is_helpful) !== isHelpful) {
    await repository.updateByArticleAndUser(articleId, userId, isHelpful, db);
  }
  return { feedback: { articleId, isHelpful }, summary: await summary(articleId, db) };
}

module.exports = { setArticleFeedback, getArticleFeedback };
