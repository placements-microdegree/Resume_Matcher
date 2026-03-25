const skillList = require("./skillList");

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "have",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "the",
  "their",
  "them",
  "this",
  "to",
  "we",
  "will",
  "with",
  "you",
]);

const GENERIC_TERMS = new Set([
  "ability",
  "candidate",
  "collaboration",
  "communication",
  "deliver",
  "developer",
  "engineering",
  "engineer",
  "experience",
  "good",
  "great",
  "knowledge",
  "looking",
  "must",
  "need",
  "preferred",
  "required",
  "responsible",
  "role",
  "skills",
  "solutions",
  "strong",
  "team",
  "using",
  "work",
  "working",
  "years",
]);

function normalize(text) {
  return String(text || "").toLowerCase();
}

function normalizeSpaces(text) {
  return normalize(text).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeTerm(raw) {
  let value = normalize(raw).trim();
  value = value.replace(/[()]/g, " ");
  value = value.replace(/\s+/g, " ");

  if (value === "node.js" || value === "node js") return "nodejs";
  if (value === "next.js" || value === "next js") return "nextjs";
  if (value === "react.js" || value === "react js") return "react";
  if (value === "c#" || value === "c sharp") return "csharp";
  if (value === "c++" || value === "c plus plus") return "cplusplus";
  if (value === ".net" || value === "dot net") return "dotnet";
  if (value === "ci/cd" || value === "ci cd" || value === "cicd pipeline") {
    return "cicd";
  }
  if (value === "vpcs") return "vpc";
  if (value === "google cloud") return "gcp";
  if (value === "microsoft azure") return "azure";
  return value;
}

function tokenize(text) {
  return normalize(text)
    .replace(/node\.js/g, "nodejs")
    .replace(/next\.js/g, "nextjs")
    .replace(/react\.js/g, "react")
    .replace(/ci\/cd/g, "cicd")
    .replace(/c\+\+/g, "cplusplus")
    .replace(/c#/g, "csharp")
    .split(/[^a-z0-9#+/-]+/g)
    .map(normalizeTerm)
    .filter(Boolean);
}

function termTokenVariants(term) {
  const value = normalizeTerm(term);
  if (!value) return [];

  const variants = [];

  if (value.includes(" ")) {
    variants.push(value.split(" ").filter(Boolean));
  } else {
    variants.push([value]);
  }

  if (value.includes("/")) {
    variants.push(value.split("/").filter(Boolean));
  }

  if (value === "nodejs") variants.push(["node", "js"]);
  if (value === "nextjs") variants.push(["next", "js"]);
  if (value === "react") variants.push(["reactjs"]);
  if (value === "azure") variants.push(["microsoft", "azure"]);
  if (value === "gcp") variants.push(["google", "cloud"]);
  if (value === "csharp") variants.push(["c#"], ["c", "sharp"]);
  if (value === "cplusplus") {
    variants.push(["c++"], ["cpp"], ["c", "plus", "plus"]);
  }
  if (value === "dotnet") variants.push([".net"], ["dot", "net"]);
  if (value === "cicd") variants.push(["ci", "cd"], ["ci/cd"]);
  if (value === "vpc") variants.push(["vpcs"]);

  const seen = new Set();
  const deduped = [];
  for (const variant of variants) {
    const key = variant.join(" ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(variant);
  }
  return deduped;
}

function hasTerm(tokenSet, tokenString, term) {
  for (const variant of termTokenVariants(term)) {
    if (variant.length === 1) {
      if (tokenSet.has(variant[0])) return true;
      continue;
    }
    const phrase = ` ${variant.join(" ")} `;
    if (tokenString.includes(phrase)) return true;
  }
  return false;
}

function detectKnownTerms(text, terms = skillList) {
  const tokens = tokenize(text);
  const tokenSet = new Set(tokens);
  const tokenString = ` ${tokens.join(" ")} `;

  return (Array.isArray(terms) ? terms : [])
    .map(normalizeTerm)
    .filter(Boolean)
    .filter((term, index, all) => all.indexOf(term) === index)
    .filter((term) => hasTerm(tokenSet, tokenString, term));
}

function extractSignificantTokens(text, { maxItems = 18 } = {}) {
  const counts = new Map();

  for (const token of tokenize(text)) {
    if (!token) continue;
    if (token.length < 3) continue;
    if (STOPWORDS.has(token)) continue;
    if (GENERIC_TERMS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      if (b[0].length !== a[0].length) return b[0].length - a[0].length;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, maxItems)
    .map(([token]) => token);
}

function extractExperienceFromExplicitYears(text) {
  const re = /(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(?:years?|yrs?)\b/g;
  let max = null;
  let match;

  while ((match = re.exec(text)) !== null) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      max = max == null ? value : Math.max(max, value);
    }
  }

  return max;
}

function parseMonthYear(value) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return null;

  const now = new Date();
  const current = { year: now.getFullYear(), month: now.getMonth() };
  if (/(present|current|now)/.test(input)) return current;

  const mm = /^(\d{1,2})\/(\d{4})$/.exec(input);
  if (mm) {
    const month = Number(mm[1]);
    const year = Number(mm[2]);
    if (Number.isFinite(month) && Number.isFinite(year) && month >= 1 && month <= 12) {
      return { year, month: month - 1 };
    }
  }

  const months = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };

  const my = /^([a-z]{3,9})\s+(\d{4})$/.exec(input);
  if (my) {
    const month = months[my[1]];
    const year = Number(my[2]);
    if (month != null && Number.isFinite(year)) return { year, month };
  }

  const yyyy = /^(\d{4})$/.exec(input);
  if (yyyy) {
    const year = Number(yyyy[1]);
    if (Number.isFinite(year)) return { year, month: 0 };
  }

  return null;
}

function monthIndex(value) {
  return value.year * 12 + value.month;
}

function normalizeRangeBounds(rawStart, rawEnd, startObj, endObj) {
  let start = monthIndex(startObj);
  let end = monthIndex(endObj);

  if (/^\d{4}$/.test(String(rawEnd).trim())) {
    end = Number(rawEnd) * 12 + 11;
  }

  if (/^\d{4}$/.test(String(rawStart).trim())) {
    start = Number(rawStart) * 12;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < start) [start, end] = [end, start];
  if (end - start > 12 * 80) return null;
  return [start, end];
}

function mergeMonthRanges(ranges) {
  if (!ranges.length) return [];

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [];

  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (!last) {
      merged.push([start, end]);
      continue;
    }

    if (start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  return merged;
}

function extractExperienceFromDateRanges(text) {
  const token =
    String.raw`(?:present|current|now|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}|\d{1,2}\/\d{4}|\d{4})`;
  const re = new RegExp(String.raw`(${token})\s*(?:-|–|—|to)\s*(${token})`, "g");
  const ranges = [];
  const input = normalize(text);

  let match;
  while ((match = re.exec(input)) !== null) {
    const startObj = parseMonthYear(match[1]);
    const endObj = parseMonthYear(match[2]);
    if (!startObj || !endObj) continue;

    const normalizedRange = normalizeRangeBounds(
      match[1],
      match[2],
      startObj,
      endObj,
    );
    if (normalizedRange) ranges.push(normalizedRange);
  }

  if (!ranges.length) return null;

  let months = 0;
  for (const [start, end] of mergeMonthRanges(ranges)) {
    months += end - start + 1;
  }

  const years = months / 12;
  if (!Number.isFinite(years) || years <= 0) return null;
  return Number(years.toFixed(1));
}

function extractExperienceYears(text) {
  const input = normalize(text);
  const explicit = extractExperienceFromExplicitYears(input);
  const dateRange = extractExperienceFromDateRanges(input);

  if (explicit == null && dateRange == null) return null;
  if (explicit == null) return dateRange;
  if (dateRange == null) return explicit;
  return Math.max(explicit, dateRange);
}

module.exports = {
  detectKnownTerms,
  extractExperienceYears,
  extractSignificantTokens,
  hasTerm,
  normalize,
  normalizeSpaces,
  normalizeTerm,
  tokenize,
};
