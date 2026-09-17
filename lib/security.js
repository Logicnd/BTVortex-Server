function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

function validateMessage(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Message text is required' };
  }
  const clean = text.trim();
  if (clean.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  if (clean.length > 500) {
    return { valid: false, error: 'Message exceeds maximum length of 500 characters' };
  }
  return { valid: true, text: clean };
}

module.exports = { sanitizeText, validateMessage };
