const EventEmitter = require('events');

class JobbieEventBus extends EventEmitter {}

// Singleton event bus instance to share events across modules
const eventBus = new JobbieEventBus();
// Increase max listeners if many automations run concurrently
eventBus.setMaxListeners(50);

module.exports = eventBus;
