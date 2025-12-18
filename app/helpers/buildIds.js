// Simple helper to keep IDs unique per upload
function buildIds(count, prefix) {
  const timestamp = Date.now();
  return Array.from({length: count}, (_, i) => `${prefix}-${timestamp}-${i}`);
}
export default buildIds;
