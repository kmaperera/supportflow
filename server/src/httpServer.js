require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env'), quiet: true });
require('./config/env').validateEnvironment();

const server = require('node:http').createServer(require('./app'));
require('./config/socket').initializeSocket(server);

// Importing this module never listens or runs migrations/seeds.
module.exports = server;
