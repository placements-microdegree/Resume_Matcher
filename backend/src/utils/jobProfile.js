const {
  detectKnownTerms,
  extractSignificantTokens,
  normalizeSpaces,
} = require("./textMatching");

const OPTIONAL_MARKERS = [
  "bonus",
  "good to have",
  "nice to have",
  "plus",
  "preferred",
];

const REQUIRED_MARKERS = [
  "experience with",
  "experience in",
  "hands on",
  "must have",
  "need",
  "required",
  "solid",
  "strong",
];

function splitIntoClauses(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u2022\u25CF\u25AA\u25E6]/g, "\n")
    .split(/[\n.;]+/g)
    .map((part) => normalizeSpaces(part.replace(/^[\-\d)\s]+/, "")))
    .filter(Boolean)
    .filter((part) => part.length >= 8);
}

function clausePriority(clause) {
  if (OPTIONAL_MARKERS.some((marker) => clause.includes(marker))) return "optional";
  if (REQUIRED_MARKERS.some((marker) => clause.includes(marker))) return "required";
  return "general";
}

function buildKeywordBuckets(clauses) {
  const required = new Set();
  const optional = new Set();

  for (const clause of clauses) {
    const terms = detectKnownTerms(clause);
    if (!terms.length) continue;

    const priority = clausePriority(clause);
    const target = priority === "optional" ? optional : required;

    for (const term of terms) {
      if (priority !== "optional") optional.delete(term);
      target.add(term);
    }
  }

  return {
    required: [...required],
    optional: [...optional].filter((term) => !required.has(term)),
  };
}

module.exports = function extractJobProfile(jobDescription, requiredExperience = 0) {
  const rawText = String(jobDescription || "").trim();
  const clauses = splitIntoClauses(rawText);
  const buckets = buildKeywordBuckets(clauses);

  const fallbackKeywords = extractSignificantTokens(rawText, { maxItems: 12 }).filter(
    (term) =>
      !buckets.required.includes(term) && !buckets.optional.includes(term),
  );

  const mustHaveKeywords = buckets.required.length
    ? buckets.required
    : fallbackKeywords.slice(0, 8);

  return {
    rawText,
    requiredExperience: Number(requiredExperience) || 0,
    mustHaveKeywords,
    niceToHaveKeywords: buckets.optional.slice(0, 8),
    fallbackKeywords,
    clauses: clauses.slice(0, 20),
  };
};
