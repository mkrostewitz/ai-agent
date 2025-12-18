const normalizeText = (text) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/ {2,}/g, " ")
    // Ensure bullets start on a new line
    .replace(/(\S)\s+•\s*/g, "$1\n• ")
    .replace(/(\S)\s+-\s+/g, "$1\n- ");

export default normalizeText;
