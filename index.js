// Fallback entry point for Railway deployments
// If Railway runs `node index.js` from the root of the repository, this will seamlessly forward it to the server.
require('./server/index.js');
