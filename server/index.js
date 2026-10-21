'use strict';
// Preserve the existing npm start / node server/index.js entrypoint.
const server = require('../server');
module.exports = server;
if (require.main === module) server.start();
