const { body, param, query } = require("express-validator");

const { bodyFields, queryFields, pagination } = require('../../middleware/inputValidation');
const contentFits = value => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 65535;
const listArticlesValidation = [
  queryFields(['page', 'limit', 'search', 'categoryId']), ...pagination(10),
  query('search').optional().isString().bail().trim().isLength({ max: 200 }),
  query('categoryId').optional().custom(value => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))).withMessage('Category ID must be a positive integer'),
];
const suggestionsValidation = [
  bodyFields(['title', 'description']),
  body('title').optional().isString().bail().trim().isLength({ max: 200 }),
  body('description').optional().isString().bail().trim().isLength({ max: 5000 }),
  body().custom(value => typeof value?.title === 'string' && Boolean(value.title.trim()) || typeof value?.description === 'string' && Boolean(value.description.trim())).withMessage('Provide a non-empty title or description'),
];
const createArticleValidation = [
  body().custom(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some(key => !["categoryId", "title", "content"].includes(key))) {
      throw new Error("Only categoryId, title and content may be provided");
    }
    return true;
  }),
  body("categoryId").custom(value => Number.isSafeInteger(value) && value > 0)
    .withMessage("Category ID must be a positive integer"),
  body("title").isString().withMessage("Title must be a string").bail().trim()
    .isLength({ min: 3, max: 200 }).withMessage("Title must be between 3 and 200 characters"),
  body("content").isString().withMessage("Content must be a string").bail().trim()
    .notEmpty().withMessage("Content must not be empty").bail()
    .custom(contentFits).withMessage("Content must not exceed 65535 UTF-8 bytes"),
];

const articleIdValidation = () => param("articleId").custom(value => {
    if (!/^[1-9]\d*$/.test(value) || value.length > 20 || BigInt(value) > 18446744073709551615n) {
      throw new Error("Article ID must be a positive integer");
    }
    return true;
  });

const articleStatusValidation = [articleIdValidation()];

const updateArticleValidation = [
  articleIdValidation(),
  body().custom(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length ||
        Object.keys(value).some(key => !["categoryId", "title", "content"].includes(key))) {
      throw new Error("Provide at least one of categoryId, title or content only");
    }
    return true;
  }),
  body("categoryId").optional().custom(value => Number.isSafeInteger(value) && value > 0)
    .withMessage("Category ID must be a positive integer"),
  body("title").optional().isString().withMessage("Title must be a string").bail().trim()
    .isLength({ min: 3, max: 200 }).withMessage("Title must be between 3 and 200 characters"),
  body("content").optional().isString().withMessage("Content must be a string").bail().trim()
    .notEmpty().withMessage("Content must not be empty").bail()
    .custom(contentFits).withMessage("Content must not exceed 65535 UTF-8 bytes"),
];

module.exports = { listArticlesValidation, suggestionsValidation, createArticleValidation, updateArticleValidation, articleStatusValidation };
