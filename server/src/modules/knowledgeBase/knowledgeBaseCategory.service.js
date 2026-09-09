const repository = require("./knowledgeBaseCategory.repository");
const ApiError = require("../../utils/ApiError");

function normalizeCategory(values) {
  if (!values || typeof values !== "object" || Array.isArray(values) ||
      Object.keys(values).some(key => !["name", "description"].includes(key))) {
    throw new ApiError(422, "Only name and description may be provided");
  }
  if (typeof values.name !== "string") {
    throw new ApiError(422, "Name must be a string between 2 and 100 characters");
  }
  const name = values.name.trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 100) {
    throw new ApiError(422, "Name must be between 2 and 100 characters");
  }
  let description = values.description ?? null;
  if (description !== null) {
    if (typeof description !== "string") throw new ApiError(422, "Description must be a string or null");
    description = description.trim();
    if (Array.from(description).length > 255) throw new ApiError(422, "Description must not exceed 255 characters");
    description = description || null;
  }

  return { name, description };
}

async function createCategory(values, db) {
  const { name, description } = normalizeCategory(values);
  // The equality lookup uses the same database collation as the unique name index.
  if (await repository.findByName(name, db)) {
    throw new ApiError(409, "Knowledge Base category already exists");
  }
  let id;
  try {
    id = await repository.create({ name, description }, db);
  } catch (error) {
    // A concurrent request may insert the same name after the lookup.
    if (error.code === "ER_DUP_ENTRY") {
      throw new ApiError(409, "Knowledge Base category already exists");
    }
    throw error;
  }
  const row = await repository.findById(id, db);
  if (!row) throw new ApiError(500, "Created Knowledge Base category could not be retrieved");
  return mapCategory(row);
}

function mapCategory(row) {
  return {
    id: row.id, name: row.name, description: row.description,
    isActive: [true, 1, "1"].includes(row.is_active),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function validateCategoryId(value) {
  if (!["string", "number"].includes(typeof value) ||
      (typeof value === "number" && !Number.isSafeInteger(value)) ||
      !/^[1-9]\d*$/.test(String(value)) || String(value).length > 20 ||
      BigInt(value) > 18446744073709551615n) {
    throw new ApiError(422, "Category ID must be a positive integer");
  }
}

async function requireCategory(categoryId, db) {
  const row = await repository.findById(categoryId, db);
  if (!row) throw new ApiError(404, "Knowledge Base category not found");
  return row;
}

async function updateCategory(categoryId, values, db) {
  validateCategoryId(categoryId);
  const existing = await requireCategory(categoryId, db);
  if (!values || typeof values !== "object" || Array.isArray(values) ||
      !Object.keys(values).length ||
      Object.keys(values).some(key => !["name", "description"].includes(key)) ||
      Object.values(values).some(value => value === undefined)) {
    throw new ApiError(422, "Provide at least one of name or description only");
  }
  const { name, description } = normalizeCategory({
    name: existing.name, description: existing.description, ...values,
  });
  if (name !== existing.name) {
    const duplicate = await repository.findByName(name, db);
    if (duplicate && String(duplicate.id) !== String(existing.id)) {
      throw new ApiError(409, "Knowledge Base category already exists");
    }
  }
  if (name === existing.name && description === existing.description) return mapCategory(existing);
  try {
    await repository.updateById(categoryId, { name, description }, db);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw new ApiError(409, "Knowledge Base category already exists");
    throw error;
  }
  return mapCategory(await requireCategory(categoryId, db));
}

async function setCategoryActiveStatus(categoryId, isActive, db) {
  validateCategoryId(categoryId);
  if (typeof isActive !== "boolean") throw new ApiError(422, "isActive must be a boolean");
  const existing = await requireCategory(categoryId, db);
  if (mapCategory(existing).isActive === isActive) return mapCategory(existing);
  await repository.setActiveStatus(categoryId, isActive, db);
  return mapCategory(await requireCategory(categoryId, db));
}

module.exports = { createCategory, updateCategory, setCategoryActiveStatus };
