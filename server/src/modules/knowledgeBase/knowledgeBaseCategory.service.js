const repository = require("./knowledgeBaseCategory.repository");
const ApiError = require("../../utils/ApiError");

async function createCategory(values, db) {
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
  return {
    id: row.id, name: row.name, description: row.description,
    isActive: [true, 1, "1"].includes(row.is_active),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

module.exports = { createCategory };
