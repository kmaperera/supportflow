const helmet = require("helmet");

function securityHeaders(environment = process.env.NODE_ENV) {
  // Express serves JSON/downloads, not the separately hosted React document.
  const headers = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    strictTransportSecurity: environment === "production"
      ? { maxAge: 31536000, includeSubDomains: false, preload: false }
      : false,
    xFrameOptions: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    crossOriginEmbedderPolicy: false,
  });
  return (req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    headers(req, res, next);
  };
}

function privateApiResponse(req, res, next) {
  res.setHeader("Cache-Control", "private, no-store");
  next();
}

module.exports = { securityHeaders, privateApiResponse };
