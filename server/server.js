// Root Node entry takes precedence over src/app.js in Vercel discovery.
// Vercel's framework detector requires a direct Express import in the entry.
require('express');
// Export the HTTP server, including its Socket.IO upgrade listener.
module.exports = require('./src/httpServer');
