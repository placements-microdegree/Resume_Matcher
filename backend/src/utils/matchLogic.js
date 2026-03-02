function normalize(text) {
  return String(text || "").toLowerCase();
}

function normalizeSkill(s) {
  const v = normalize(s).trim().replaceAll(/\s+/g, " ");

  // Common canonicalizations.
  if (v === "node.js" || v === "node js") return "nodejs";
  if (v === "next.js" || v === "next js") return "nextjs";
  if (v === "c#" || v === "c sharp") return "csharp";
  if (v === "c++" || v === "c plus plus") return "cplusplus";
  if (v === ".net" || v === "dot net") return "dotnet";
  if (v === "ci/cd" || v === "ci cd") return "cicd";
  return v;
}

function tokenize(text) {
  // Keep + and # for skills like c++ / c#.
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9#+]+/g)
    .filter(Boolean);
}

function extractExperienceFromExplicitYears(text) {
  // Heuristic: find patterns like "3 years", "5+ yrs", "2.5 years" and take the max.
  const re = /(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(?:years?|yrs?)\b/g;
  let max = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) max = max == null ? n : Math.max(max, n);
  }
  return max;
}

function parseMonthYear(s) {
  const v = String(s || "")
    .trim()
    .toLowerCase();
  if (!v) return null;

  const now = new Date();
  const current = { year: now.getFullYear(), month: now.getMonth() };
  if (/(present|current|now)/.test(v)) return current;

  // MM/YYYY
  const mm = /^(\d{1,2})\/(\d{4})$/.exec(v);
  if (mm) {
    const m = Number(mm[1]);
    const y = Number(mm[2]);
    if (Number.isFinite(m) && Number.isFinite(y) && m >= 1 && m <= 12) {
      return { year: y, month: m - 1 };
    }
  }

  // Month YYYY
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

  const my = /^([a-z]{3,9})\s+(\d{4})$/.exec(v);
  if (my) {
    const month = months[my[1]];
    const year = Number(my[2]);
    if (month != null && Number.isFinite(year)) return { year, month };
  }

  // YYYY
  const y = /^(\d{4})$/.exec(v);
  if (y) {
    const year = Number(y[1]);
    if (Number.isFinite(year)) return { year, month: 0 };
  }

  return null;
}

function monthIndex({ year, month }) {
  return year * 12 + month;
}

function buildDateTokenPattern() {
  return String.raw`(?:present|current|now|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}|\d{1,2}\/\d{4}|\d{4})`;
}

function normalizeRangeBounds(rawStart, rawEnd, startObj, endObj) {
  let start = monthIndex(startObj);
  let end = monthIndex(endObj);

  // If year-only end like "2022", interpret as end of year.
  if (/^\d{4}$/.test(String(rawEnd).trim())) {
    end = Number(rawEnd) * 12 + 11;
  }
  // If year-only start like "2020", interpret as start of year.
  if (/^\d{4}$/.test(String(rawStart).trim())) {
    start = Number(rawStart) * 12;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < start) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  // Ignore absurd ranges
  if (end - start > 12 * 80) return null;
  return [start, end];
}

function mergeMonthRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of sorted) {
    const last = merged.at(-1);
    if (!last) {
      merged.push([s, e]);
      continue;
    }
    if (s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

function extractExperienceFromDateRanges(text) {
  // Try to infer experience from date ranges like:
  // "Jan 2021 - Present", "2020 - 2022", "03/2019 to 11/2021"
  const t = String(text || "").toLowerCase();
  const ranges = [];

  const token = buildDateTokenPattern();
  const re = new RegExp(
    String.raw`(${token})\s*(?:-|–|—|to)\s*(${token})`,
    "g",
  );
  let m;
  while ((m = re.exec(t)) !== null) {
    const a = parseMonthYear(m[1]);
    const b = parseMonthYear(m[2]);
    if (!a || !b) continue;

    const normalized = normalizeRangeBounds(m[1], m[2], a, b);
    if (!normalized) continue;
    ranges.push(normalized);
  }

  if (!ranges.length) return null;

  const merged = mergeMonthRanges(ranges);

  let months = 0;
  for (const [s, e] of merged) {
    months += e - s + 1;
  }

  const years = months / 12;
  if (!Number.isFinite(years) || years <= 0) return null;
  return Number(years.toFixed(1));
}

function extractExperienceYears(resumeText) {
  const text = normalize(resumeText);
  const explicit = extractExperienceFromExplicitYears(text);
  const fromDates = extractExperienceFromDateRanges(text);
  if (explicit == null && fromDates == null) return null;
  if (explicit == null) return fromDates;
  if (fromDates == null) return explicit;
  return Math.max(explicit, fromDates);
}

function skillTokenVariants(canonicalSkill) {
  const s = normalizeSkill(canonicalSkill);
  const variants = [];

  // Phrase skills
  if (s.includes(" ")) {
    variants.push(s.split(" ").filter(Boolean));
  } else {
    variants.push([s]);
  }

  // Common variants
  if (s === "nodejs") variants.push(["node", "js"]);
  if (s === "nextjs") variants.push(["next", "js"]);
  if (s === "csharp") {
    variants.push(["c#"], ["c", "sharp"]);
  }
  if (s === "cplusplus") {
    variants.push(["c++"], ["cpp"], ["c", "plus", "plus"]);
  }
  if (s === "dotnet") {
    variants.push([".net"], ["dot", "net"]);
  }
  if (s === "cicd") {
    variants.push(["ci", "cd"], ["ci/cd"]);
  }

  // De-dupe
  const seen = new Set();
  const out = [];
  for (const v of variants) {
    const key = v.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function hasSkill(resumeTokens, resumeTokenString, skillCanonical) {
  const tokenSet = resumeTokens._set;
  const variants = skillTokenVariants(skillCanonical);
  for (const v of variants) {
    if (!v.length) continue;
    if (v.length === 1) {
      const needle = v[0];
      if (tokenSet.has(needle)) return true;
      continue;
    }
    const phrase = ` ${v.join(" ")} `;
    if (resumeTokenString.includes(phrase)) return true;
  }
  return false;
}

// Returns details compatible with frontend requirements.
module.exports = function matchLogic(
  resumeText,
  { skills, minExperience, experienceOverride = null },
) {
  const resume = normalize(resumeText);
  const tokens = tokenize(resume);
  const tokenSet = new Set(tokens);
  // Attach set for quick lookups without re-creating in loops.
  const resumeTokens = { list: tokens, _set: tokenSet };
  const resumeTokenString = ` ${tokens.join(" ")} `;

  const requested = (Array.isArray(skills) ? skills : [])
    .map(normalizeSkill)
    .filter(Boolean);

  const matchedSkills = [];
  const missingSkills = [];

  for (const s of requested) {
    if (hasSkill(resumeTokens, resumeTokenString, s)) matchedSkills.push(s);
    else missingSkills.push(s);
  }

  const extracted = extractExperienceYears(resumeText);
  const overrideNum =
    experienceOverride == null ? null : Number(experienceOverride);
  const experienceFound = extracted;
  const experienceUsed = Number.isFinite(overrideNum) ? overrideNum : extracted;

  const total = requested.length || 1;
  const base = (matchedSkills.length / total) * 100;

  const minExp = Number(minExperience) || 0;
  const exp = Number(experienceUsed ?? 0);

  // Smooth penalty curve: if exp is below minExp, scale down rather than a hard 0.7.
  // - when minExp=0 => no penalty
  // - when exp=0 and minExp>0 => 0.5
  // - when exp=minExp => 1.0
  let expPenalty = 1;
  if (minExp > 0 && exp < minExp) {
    expPenalty = 0.5 + 0.5 * Math.max(0, Math.min(1, exp / minExp));
  }

  const match = Math.max(0, Math.min(100, base * expPenalty));

  return {
    match,
    matchedSkills,
    missingSkills,
    experienceFound,
    experienceOverride: Number.isFinite(overrideNum) ? overrideNum : null,
    experienceUsed,
  };
};
