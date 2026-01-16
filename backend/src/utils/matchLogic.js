function normalize(text) {
  return String(text || "").toLowerCase();
}

function normalizeSkill(s) {
  const v = normalize(s).trim();
  if (v === "node.js") return "nodejs";
  if (v === "next.js") return "nextjs";
  return v;
}

function extractExperienceYears(resumeText) {
  const text = normalize(resumeText);

  // Heuristic: find patterns like "3 years", "5+ yrs", etc. and take the max.
  const re = /(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/g;
  let max = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) max = max == null ? n : Math.max(max, n);
  }
  return max;
}

// Returns details compatible with frontend requirements.
module.exports = function matchLogic(resumeText, { skills, minExperience }) {
  const resume = normalize(resumeText);
  const requested = (Array.isArray(skills) ? skills : [])
    .map(normalizeSkill)
    .filter(Boolean);

  const matchedSkills = [];
  const missingSkills = [];

  for (const s of requested) {
    if (resume.includes(s)) matchedSkills.push(s);
    else missingSkills.push(s);
  }

  const experienceFound = extractExperienceYears(resumeText);

  const total = requested.length || 1;
  const base = (matchedSkills.length / total) * 100;

  const minExp = Number(minExperience) || 0;
  const exp = Number(experienceFound ?? 0);
  const expPenalty = exp < minExp ? 0.7 : 1.0;

  const match = Math.max(0, Math.min(100, base * expPenalty));

  return {
    match,
    matchedSkills,
    missingSkills,
    experienceFound,
  };
};
