export function cleanKnowledgeNamespace(value, fallback = "") {
  const namespace = String(value || "").trim();
  return namespace || fallback;
}

export function knowledgeNamespaceMatch(value) {
  const namespace = cleanKnowledgeNamespace(value);
  if (!namespace) return {};

  return {
    $or: [{namespace}, {"metadata.namespace": namespace}],
  };
}

export function vectorNamespaceFilter(value) {
  const namespace = cleanKnowledgeNamespace(value);
  return namespace ? {namespace} : undefined;
}
