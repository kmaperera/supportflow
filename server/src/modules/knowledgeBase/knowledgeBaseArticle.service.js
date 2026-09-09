const repository = require("./knowledgeBaseArticle.repository");
const categories = require("./knowledgeBaseCategory.repository");
const ApiError = require("../../utils/ApiError");
const slugify = require("../../utils/slugify");

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
  return {
    id: row.id, categoryId: row.category_id, categoryName: row.category_name,
    title: row.title, slug: row.slug, content: row.content, status: row.status,
    viewCount: row.view_count, createdBy: row.created_by, publishedAt: row.published_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

module.exports = { createArticle };
