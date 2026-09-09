const { body } = require("express-validator");

const setArticleFeedbackValidation = [
  body().custom(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => key !== "isHelpful")) {
      throw new Error("Only isHelpful may be provided");
    }
    return true;
  }),
  body("isHelpful").custom(value => typeof value === "boolean").withMessage("isHelpful must be a boolean"),
];

module.exports = { setArticleFeedbackValidation };
