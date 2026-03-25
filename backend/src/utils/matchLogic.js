const {
  extractExperienceYears,
  hasTerm,
  normalizeTerm,
  tokenize,
} = require("./textMatching");

function toRoundedNumber(value) {
  return Number(Number(value || 0).toFixed(1));
}

function scoreExperience(requiredExperience, experienceUsed) {
  const minimum = Number(requiredExperience) || 0;
  if (minimum <= 0) return 100;

  const years = Number(experienceUsed);
  if (!Number.isFinite(years)) return 20;
  if (years >= minimum) return 100;

  const ratio = Math.max(0, Math.min(1, years / minimum));
  return 20 + ratio * 80;
}

function applyExperienceScoreCap(score, requiredExperience, experienceUsed) {
  const minimum = Number(requiredExperience) || 0;
  if (minimum <= 0) return Number(score || 0);

  const years = Number(experienceUsed);
  const nextScore = Number(score || 0);

  if (!Number.isFinite(years)) {
    return Math.min(nextScore, 59.9);
  }

  if (years >= minimum) return nextScore;

  const ratio = years / minimum;
  if (ratio < 0.5) {
    return Math.min(nextScore, 44.9);
  }

  return Math.min(nextScore, 74.9);
}

function bucketForScore(score) {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function formatExperienceNote(requiredExperience, experienceUsed) {
  const minimum = Number(requiredExperience) || 0;
  if (minimum <= 0) return null;

  const years = Number(experienceUsed);
  if (!Number.isFinite(years)) {
    return `Resume does not clearly show the ${minimum}+ years requested.`;
  }

  if (years >= minimum) {
    return `Experience clears the ${minimum}+ year requirement.`;
  }

  return `Resume shows about ${years} years against the ${minimum}+ year target.`;
}

function buildSummary(bucket, matchedRequirements, missingRequirements, experienceNote) {
  const topMatches = matchedRequirements.slice(0, 3);
  const topGaps = missingRequirements.slice(0, 2);

  if (bucket === "high") {
    const headline = topMatches.length
      ? `Strong overlap on ${topMatches.join(", ")}.`
      : "Strong overall alignment with the job description.";
    return experienceNote ? `${headline} ${experienceNote}` : headline;
  }

  if (bucket === "medium") {
    const headline = topMatches.length
      ? `Partial match with ${topMatches.join(", ")}.`
      : "Partial overlap with the job description.";
    const gap = topGaps.length ? ` Biggest gaps: ${topGaps.join(", ")}.` : "";
    return `${headline}${gap}${experienceNote ? ` ${experienceNote}` : ""}`.trim();
  }

  const headline = topGaps.length
    ? `Limited overlap so far. Missing visible evidence for ${topGaps.join(", ")}.`
    : "Limited overlap with the requested role.";
  return `${headline}${experienceNote ? ` ${experienceNote}` : ""}`.trim();
}

function buildImprovementSuggestions({
  matchedRequirements,
  missingRequirements,
  requiredExperience,
  experienceUsed,
}) {
  const suggestions = [];

  if (missingRequirements.length) {
    suggestions.push(
      `Add clear evidence for ${missingRequirements
        .slice(0, 3)
        .join(", ")} if you have that experience.`,
    );
  }

  if (matchedRequirements.length) {
    suggestions.push(
      `Move ${matchedRequirements
        .slice(0, 3)
        .join(", ")} closer to the resume summary or latest project bullets.`,
    );
  }

  const minimum = Number(requiredExperience) || 0;
  const years = Number(experienceUsed);
  if (minimum > 0 && !Number.isFinite(years)) {
    suggestions.push(
      "Make total relevant experience easier to verify by showing dates more clearly.",
    );
  } else if (minimum > 0 && Number.isFinite(years) && years < minimum) {
    suggestions.push(
      "Group related work together so the recruiter can quickly see relevant experience depth.",
    );
  }

  suggestions.push(
    "Quantify impact with metrics so the strongest matching skills feel more credible.",
  );

  return suggestions.slice(0, 4);
}

function buildImprovementMessage({
  fileName,
  bucket,
  match,
  matchingSummary,
  missingRequirements,
  improvementSuggestions,
}) {
  const lines = [
    `Resume: ${fileName || "Candidate"}`,
    `Current match: ${Math.round(Number(match) || 0)}% (${String(bucket || "low").toUpperCase()})`,
  ];

  if (matchingSummary) {
    lines.push(`Summary: ${matchingSummary}`);
  }

  if (missingRequirements?.length) {
    lines.push(`Missing or weak areas: ${missingRequirements.join(", ")}`);
  }

  if (improvementSuggestions?.length) {
    lines.push("Suggested improvements:");
    for (const suggestion of improvementSuggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join("\n");
}

function matchLogic(
  resumeText,
  { jobProfile, requiredExperience, experienceOverride = null, fileName = "" },
) {
  const tokens = tokenize(resumeText);
  const tokenSet = new Set(tokens);
  const tokenString = ` ${tokens.join(" ")} `;

  const mustHave = (jobProfile?.mustHaveKeywords || []).map(normalizeTerm).filter(Boolean);
  const optional = (jobProfile?.niceToHaveKeywords || [])
    .map(normalizeTerm)
    .filter(Boolean);
  const fallback = (jobProfile?.fallbackKeywords || [])
    .map(normalizeTerm)
    .filter(Boolean);

  const matchedMustHave = [];
  const missingMustHave = [];
  for (const term of mustHave) {
    if (hasTerm(tokenSet, tokenString, term)) matchedMustHave.push(term);
    else missingMustHave.push(term);
  }

  const matchedOptional = [];
  const missingOptional = [];
  for (const term of optional) {
    if (hasTerm(tokenSet, tokenString, term)) matchedOptional.push(term);
    else missingOptional.push(term);
  }

  const matchedFallback = [];
  const missingFallback = [];
  for (const term of fallback) {
    if (mustHave.includes(term) || optional.includes(term)) continue;
    if (hasTerm(tokenSet, tokenString, term)) matchedFallback.push(term);
    else missingFallback.push(term);
  }

  let requirementScore = 0;
  if (mustHave.length || optional.length) {
    const mustScore = mustHave.length ? (matchedMustHave.length / mustHave.length) * 100 : 100;
    const optionalScore = optional.length
      ? (matchedOptional.length / optional.length) * 100
      : 0;
    requirementScore = mustHave.length
      ? mustScore * 0.8 + optionalScore * 0.2
      : optionalScore;
  } else if (fallback.length) {
    requirementScore = (matchedFallback.length / fallback.length) * 100;
  }

  const experienceFound = extractExperienceYears(resumeText);
  const overrideNum =
    experienceOverride == null ? null : Number(experienceOverride);
  const experienceUsed = Number.isFinite(overrideNum) ? overrideNum : experienceFound;
  const experienceScore = scoreExperience(requiredExperience, experienceUsed);

  const rawScore = Math.max(
    0,
    Math.min(100, requirementScore * 0.75 + experienceScore * 0.25),
  );
  const finalScore = applyExperienceScoreCap(
    rawScore,
    requiredExperience,
    experienceUsed,
  );
  const bucket = bucketForScore(finalScore);

  const matchedRequirements = [...matchedMustHave, ...matchedOptional, ...matchedFallback]
    .filter((term, index, all) => all.indexOf(term) === index)
    .slice(0, 8);

  const missingRequirements = [...missingMustHave, ...missingOptional, ...missingFallback]
    .filter((term, index, all) => all.indexOf(term) === index)
    .slice(0, 8);

  const experienceNote = formatExperienceNote(requiredExperience, experienceUsed);
  const improvementSuggestions = buildImprovementSuggestions({
    matchedRequirements,
    missingRequirements,
    requiredExperience,
    experienceUsed,
  });
  const matchingSummary = buildSummary(
    bucket,
    matchedRequirements,
    missingRequirements,
    experienceNote,
  );

  return {
    match: toRoundedNumber(finalScore),
    bucket,
    matchedRequirements,
    missingRequirements,
    improvementSuggestions,
    matchingSummary,
    improvementMessage: buildImprovementMessage({
      fileName,
      bucket,
      match: finalScore,
      matchingSummary,
      missingRequirements,
      improvementSuggestions,
    }),
    experienceFound,
    experienceOverride: Number.isFinite(overrideNum) ? overrideNum : null,
    experienceUsed,
    scoreBreakdown: {
      requirementScore: toRoundedNumber(requirementScore),
      experienceScore: toRoundedNumber(experienceScore),
    },
  };
}

matchLogic.bucketForScore = bucketForScore;
matchLogic.buildImprovementMessage = buildImprovementMessage;
matchLogic.applyExperienceScoreCap = applyExperienceScoreCap;

module.exports = matchLogic;
