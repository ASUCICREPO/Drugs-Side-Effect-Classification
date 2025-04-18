/**
 * Function to create a message block with consistent structure and validation.
 *
 * @param {string} message - The content of the message.
 * @param {string} sentBy - The sender of the message ('USER' or 'BOT').
 * @param {string} [type='TEXT'] - The type of the message ('TEXT', 'FILE', 'SOURCES').
 * @param {string} [state='PROCESSING'] - The state ('PROCESSING', 'RECEIVED', 'SENT', 'STREAMING').
 * @param {string} [fileName=''] - The name of the file (if type is 'FILE').
 * @param {string} [fileStatus=''] - The status of the file (if type is 'FILE').
 * @param {Array} [sources=[]] - Array of source objects for BOT messages. << NEW PARAMETER
 * @returns {Object} - A message block object.
 * @throws Will throw an error if sentBy, type, or state are invalid.
 */
const createMessageBlock = (message, sentBy, type = "TEXT", state = "PROCESSING", fileName = "", fileStatus = "", sources = []) => {
  // Valid sender types
  const validSenders = ["USER", "BOT"];
  // Valid message types
  const validTypes = ["TEXT", "FILE", "SOURCES"]; // Keep SOURCES for potential direct use if needed elsewhere
  // Valid message states
  const validStates = ["PROCESSING", "RECEIVED", "SENT", "STREAMING"];

  // Validate the 'sentBy' parameter
  if (!validSenders.includes(sentBy)) {
    throw new Error(`Invalid sender: ${sentBy}. Must be 'USER' or 'BOT'.`);
  }

  // Validate the 'type' parameter
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid message type: ${type}. Must be 'TEXT', 'FILE', or 'SOURCES'.`);
  }

  // Validate the 'state' parameter
  if (!validStates.includes(state)) {
    throw new Error(`Invalid state: ${state}. Must be 'PROCESSING', 'RECEIVED', 'SENT', or 'STREAMING'.`);
  }

  // Return the message block object
  return {
    message,
    sentBy,
    type,
    state,
    fileName,
    fileStatus,
    sources, // <<< ADDED sources property
  };
};

export default createMessageBlock;
