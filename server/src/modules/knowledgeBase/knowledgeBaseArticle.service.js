const repository = require("./knowledgeBaseArticle.repository");
const categories = require("./knowledgeBaseCategory.repository");
const ApiError = require("../../utils/ApiError");
const slugify = require("../../utils/slugify");
const { USER_ROLES } = require("../../constants/roles");

async function createArticle(values, db) {
  if (!values || typeof values !== "object" || Array.isArray(values) ||
      Object.keys(values).some(key => !["categoryId", "title", "content", "createdBy"].includes(key))) {
    throw new ApiError(422, "Only categoryId, title, content and authenticated createdBy may be provided");
  }
  const { categoryId, createdBy } = values;
  if (!Number.isSafeInteger(categoryId) || categoryId < 1) throw new ApiError(422, "Category ID must be a positive integer");
  // Authentication may preserve a BIGINT user ID as a decimal string.
  if (!["string", "number"].includes(typeof createdBy) ||
      (typeof createdBy === "number" && !Number.isSafeInteger(createdBy)) ||
      !/^[1-9]\d*$/.test(String(createdBy)) || String(createdBy).length > 20 ||
      BigInt(createdBy) > 18446744073709551615n) throw new ApiError(422, "Author ID must be a positive integer");
  if (typeof values.title !== "string") throw new ApiError(422, "Title must be a string");
  const title = values.title.trim();
  if (Array.from(title).length < 3 || Array.from(title).length > 200) throw new ApiError(422, "Title must be between 3 and 200 characters");
  if (typeof values.content !== "string" || !values.content.trim()) throw new ApiError(422, "Content must be a non-empty string");
  const content = values.content.trim();
  const category = await categories.findById(categoryId, db);
  if (!category) throw new ApiError(404, "Knowledge Base category not found");
  if (![true, 1, "1"].includes(category.is_active)) throw new ApiError(409, "Knowledge Base category is inactive");

  const base = slugify(title);
  let suffix = 1;
  let races = 0;
  let id;
  while (id === undefined) {
    const ending = suffix === 1 ? "" : `-${suffix}`;
    const slug = base.slice(0, 220 - ending.length).replace(/-+$/g, "") + ending;
    suffix++;
    if (await repository.findBySlug(slug, db)) continue;
    try {
      id = await repository.create({ categoryId, title, slug, content, createdBy }, db);
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;
      if (++races >= 5) throw new ApiError(409, "Could not allocate a unique article slug. Please retry");
    }
  }
  const row = await repository.findById(id, db);
  if (!row) throw new ApiError(500, "Created Knowledge Base article could not be retrieved");
  return mapArticle(row);
}

function mapArticle(row) {
  return {
    id: row.id, categoryId: row.category_id, categoryName: row.category_name,
    title: row.title, slug: row.slug, content: row.content, status: row.status,
    viewCount: row.view_count, createdBy: row.created_by, publishedAt: row.published_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function validateArticleId(articleId) {
  if (!["string", "number"].includes(typeof articleId) ||
      (typeof articleId === "number" && !Number.isSafeInteger(articleId)) ||
      !/^[1-9]\d*$/.test(String(articleId)) || String(articleId).length > 20 ||
      BigInt(articleId) > 18446744073709551615n) throw new ApiError(422, "Article ID must be a positive integer");
}

async function updateArticle(articleId, values, db) {
  validateArticleId(articleId);
  const existing = await repository.findById(articleId, db);
  if (!existing) throw new ApiError(404, "Knowledge Base article not found");
  if (!values || typeof values !== "object" || Array.isArray(values) || !Object.keys(values).length ||
      Object.keys(values).some(key => !["categoryId", "title", "content"].includes(key))) {
    throw new ApiError(422, "Provide at least one of categoryId, title or content only");
  }
  let categoryId = existing.category_id;
  let title = existing.title;
  let content = existing.content;
  if (Object.hasOwn(values, "categoryId")) {
    if (!Number.isSafeInteger(values.categoryId) || values.categoryId < 1) throw new ApiError(422, "Category ID must be a positive integer");
    categoryId = values.categoryId;
  }
  if (Object.hasOwn(values, "title")) {
    if (typeof values.title !== "string") throw new ApiError(422, "Title must be a string");
    title = values.title.trim();
    if (Array.from(title).length < 3 || Array.from(title).length > 200) throw new ApiError(422, "Title must be between 3 and 200 characters");
  }
  if (Object.hasOwn(values, "content")) {
    if (typeof values.content !== "string" || !values.content.trim()) throw new ApiError(422, "Content must be a non-empty string");
    content = values.content.trim();
  }
  if (String(categoryId) !== String(existing.category_id)) {
    const category = await categories.findById(categoryId, db);
    if (!category) throw new ApiError(404, "Knowledge Base category not found");
    if (![true, 1, "1"].includes(category.is_active)) throw new ApiError(409, "Knowledge Base category is inactive");
  }
  const titleChanged = title !== existing.title;
  if (!titleChanged && content === existing.content && String(categoryId) === String(existing.category_id)) return mapArticle(existing);
  const base = titleChanged ? slugify(title) : null;
  let suffix = 1;
  let races = 0;
  while (true) {
    let slug = existing.slug;
    if (titleChanged) {
      const ending = suffix === 1 ? "" : `-${suffix}`;
      slug = base.slice(0, 220 - ending.length).replace(/-+$/g, "") + ending;
      suffix++;
      const match = await repository.findBySlug(slug, db);
      if (match && String(match.id) !== String(existing.id)) continue;
    }
    try {
      await repository.updateById(articleId, { categoryId, title, slug, content }, db);
      break;
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;
      if (!titleChanged || ++races >= 5) throw new ApiError(409, "Could not allocate a unique article slug. Please retry");
    }
  }
  const row = await repository.findById(articleId, db);
  if (!row) throw new ApiError(404, "Knowledge Base article not found");
  return mapArticle(row);
}

async function requireArticle(articleId, db) {
  const row = await repository.findById(articleId, db);
  if (!row) throw new ApiError(404, "Knowledge Base article not found");
  return row;
}

async function publishArticle(articleId, db) {
  validateArticleId(articleId);
  const existing = await requireArticle(articleId, db);
  if (existing.status === "PUBLISHED") return mapArticle(existing);
  if (existing.status === "ARCHIVED") throw new ApiError(409, "Archived Knowledge Base article cannot be published");
  if (existing.status !== "DRAFT") throw new ApiError(409, "Knowledge Base article cannot be published from its current status");
  const category = await categories.findById(existing.category_id, db);
  if (!category) throw new ApiError(409, "Knowledge Base article category is missing");
  if (![true, 1, "1"].includes(category.is_active)) throw new ApiError(409, "Knowledge Base category is inactive");
  await repository.updateStatus(articleId, "PUBLISHED", new Date(), db);
  return mapArticle(await requireArticle(articleId, db));
}

async function unpublishArticle(articleId, db) {
  validateArticleId(articleId);
  const existing = await requireArticle(articleId, db);
  if (existing.status === "DRAFT") return mapArticle(existing);
  if (existing.status === "ARCHIVED") throw new ApiError(409, "Archived Knowledge Base article cannot be unpublished");
  if (existing.status !== "PUBLISHED") throw new ApiError(409, "Knowledge Base article cannot be unpublished from its current status");
  await repository.updateStatus(articleId, "DRAFT", null, db);
  return mapArticle(await requireArticle(articleId, db));
}

async function archiveArticle(articleId, db) {
  validateArticleId(articleId);
  const existing = await requireArticle(articleId, db);
  if (existing.status === "ARCHIVED" && existing.published_at === null) return mapArticle(existing);
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(existing.status)) {
    throw new ApiError(409, "Knowledge Base article cannot be archived from its current status");
  }
  // Also repair an archived row with an inconsistent publication timestamp.
  await repository.updateStatus(articleId, "ARCHIVED", null, db);
  return mapArticle(await requireArticle(articleId, db));
}

async function getArticleById(articleId, user, db) {
  validateArticleId(articleId);
  if (!user) throw new ApiError(401, "Authentication required");
  const row = await requireArticle(articleId, db);
  if (user.role !== USER_ROLES.ADMIN &&
      (![USER_ROLES.EMPLOYEE, USER_ROLES.TECHNICIAN].includes(user.role) ||
       row.status !== "PUBLISHED" || ![true, 1, "1"].includes(row.category_is_active))) {
    throw new ApiError(404, "Knowledge Base article not found");
  }
  if ([USER_ROLES.EMPLOYEE, USER_ROLES.TECHNICIAN].includes(user.role)) {
    const affectedRows = await repository.incrementViewCount(articleId, db);
    if (affectedRows !== 1) throw new ApiError(500, "Knowledge Base article view count could not be updated");
    return mapArticle(await requireArticle(articleId, db));
  }
  return mapArticle(row);
}

async function listArticles(options = {}, user, db) {
  if (!user) throw new ApiError(401, "Authentication required");
  if (!Object.values(USER_ROLES).includes(user.role)) throw new ApiError(403, "You do not have permission to access this resource");
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some(key => !["page", "limit", "search", "categoryId"].includes(key))) throw new ApiError(422, "Only page, limit, search and categoryId are supported");
  let search;
  if (options.search !== undefined) {
    if (typeof options.search !== "string") throw new ApiError(422, "Search must be a string");
    search = options.search.trim();
    if (Array.from(search).length > 200) throw new ApiError(422, "Search must not exceed 200 characters");
  }
  const normalized = {};
  for (const [key, fallback] of [["page", 1], ["limit", 10]]) {
    const value = options[key] === undefined ? fallback : options[key];
    if (!["string", "number"].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
        !Number.isSafeInteger(Number(value))) throw new ApiError(422, `${key} must be a positive integer`);
    normalized[key] = Number(value);
  }
  const { page, limit } = normalized;
  const offset = (page - 1) * limit;
  if (limit > 100 || !Number.isSafeInteger(offset)) throw new ApiError(422, "Invalid pagination range");
  const filters = user.role === USER_ROLES.ADMIN ? {} : { status: "PUBLISHED", activeCategoryOnly: true };
  if (search) filters.search = search;
  if (options.categoryId !== undefined) {
    const value = options.categoryId;
    if (!["string", "number"].includes(typeof value) || !/^[1-9]\d*$/.test(String(value)) ||
        !Number.isSafeInteger(Number(value))) throw new ApiError(422, "Category ID must be a positive integer");
    filters.categoryId = Number(value);
    if (!await categories.findById(filters.categoryId, db)) throw new ApiError(404, "Knowledge Base category not found");
  }
  const rows = await repository.findAll({ ...filters, limit, offset }, db);
  const totalRecords = await repository.countAll(filters, db);
  const totalPages = Math.ceil(totalRecords / limit);
  const articles = rows.map(row => {
    const { content, ...summary } = mapArticle(row);
    return summary;
  });
  return { articles, pagination: { currentPage: page, limit, totalRecords, totalPages,
    hasNext: page < totalPages, hasPrevious: page > 1 } };
}

async function getSuggestedArticles(values = {}, db) {
  if (!values || typeof values !== "object" || Array.isArray(values) ||
      Object.keys(values).some(key => !["title", "description"].includes(key))) throw new ApiError(422, "Only title and description are supported");
  const normalized = {};
  for (const key of ["title", "description"]) {
    if (values[key] !== undefined && typeof values[key] !== "string") throw new ApiError(422, `${key} must be a string`);
    normalized[key] = (values[key] || "").trim();
  }
  if (Array.from(normalized.title).length > 200) throw new ApiError(422, "Title must not exceed 200 characters");
  if (!normalized.title && !normalized.description) throw new ApiError(422, "Provide a non-empty title or description");
  const stopWords = new Set(["the", "a", "an", "to", "is", "my", "and", "or", "of", "for", "in", "on"]);
  const tokens = `${normalized.title} ${normalized.description}`.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  // Title terms come first; deduplicate and bound the SQL scoring expressions.
  const terms = [...new Set(tokens.filter(term => Array.from(term).length >= 3 && !stopWords.has(term)))].slice(0, 8);
  if (!terms.length) return [];
  const rows = await repository.findSuggestedArticles({ terms, limit: 5 }, db);
  return rows.map(row => ({ id: row.id, categoryId: row.category_id, categoryName: row.category_name,
    title: row.title, slug: row.slug, viewCount: row.view_count, publishedAt: row.published_at }));
}

module.exports = { createArticle, updateArticle, publishArticle, unpublishArticle, archiveArticle, getArticleById, listArticles, getSuggestedArticles };
