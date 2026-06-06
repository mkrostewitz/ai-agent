export const REGISTRATION_FIELD_KEYS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "company",
  "address",
];

export const DEFAULT_REGISTRATION_SETTINGS = {
  enabled: true,
  fields: {
    first_name: {show: true, required: true},
    last_name: {show: true, required: true},
    phone: {show: true, required: false},
    email: {show: true, required: true},
    company: {show: false, required: false},
    address: {show: false, required: false},
  },
};

function booleanValue(value, fallback = false) {
  if (typeof value === "boolean") return value;

  const text = String(value || "").trim().toLowerCase();
  if (!text) return fallback;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function normalizeRegistrationSettings(input = {}) {
  const source = objectValue(input);
  const sourceFields = objectValue(source.fields);

  const fields = REGISTRATION_FIELD_KEYS.reduce((result, key) => {
    const defaultField = DEFAULT_REGISTRATION_SETTINGS.fields[key];
    const field = objectValue(sourceFields[key]);
    const show = booleanValue(field.show, defaultField.show);

    result[key] = {
      show,
      required: show && booleanValue(field.required, defaultField.required),
    };

    return result;
  }, {});

  return {
    enabled: booleanValue(source.enabled, DEFAULT_REGISTRATION_SETTINGS.enabled),
    fields,
  };
}
