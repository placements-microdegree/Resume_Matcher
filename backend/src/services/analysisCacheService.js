const crypto = require("crypto");

const { getSupabaseConfig, requestSupabase } = require("./supabase/restClient");

const PROMPT_VERSION = process.env.ANALYSIS_PROMPT_VERSION || "phase1-v1";

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function safeJson(value) {
  return value && typeof value === "object" ? value : {};
}

async function upsertJobRecord(jobDescription, requiredExperience, jobProfile) {
  const jobHash = sha256(
    JSON.stringify({
      jobDescription: String(jobDescription || "").trim(),
      requiredExperience: Number(requiredExperience) || 0,
      promptVersion: PROMPT_VERSION,
    }),
  );

  const payload = {
    job_hash: jobHash,
    raw_text: String(jobDescription || "").trim(),
    required_experience: Number(requiredExperience) || 0,
    parsed_requirements: {
      clauses: jobProfile?.clauses || [],
      fallbackKeywords: jobProfile?.fallbackKeywords || [],
    },
    must_have_keywords: jobProfile?.mustHaveKeywords || [],
    nice_to_have_keywords: jobProfile?.niceToHaveKeywords || [],
  };

  const result = await requestSupabase("job_descriptions", {
    method: "POST",
    query: {
      on_conflict: "job_hash",
      select: "id,job_hash",
    },
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: payload,
  });

  return result?.data?.[0] || null;
}

async function upsertResumeRecord(document) {
  const rawText = String(document?.rawText || "");
  const contentHash = sha256(rawText);

  const payload = {
    file_name: String(document?.fileName || "unknown"),
    content_hash: contentHash,
    raw_text: rawText,
    extracted_experience:
      document?.experienceFound == null ? null : Number(document.experienceFound),
    extracted_json: safeJson({
      scoreBreakdown: document?.scoreBreakdown || {},
      matchedRequirements: document?.matchedRequirements || [],
      missingRequirements: document?.missingRequirements || [],
    }),
  };

  const result = await requestSupabase("resumes", {
    method: "POST",
    query: {
      on_conflict: "content_hash",
      select: "id,content_hash",
    },
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: payload,
  });

  return result?.data?.[0] || null;
}

async function upsertAnalysisRecord(jobId, resumeId, document) {
  const payload = {
    resume_id: resumeId,
    job_id: jobId,
    prompt_version: PROMPT_VERSION,
    final_score: Number(document?.match || 0),
    semantic_score: Number(document?.scoreBreakdown?.llmScore || 0),
    keyword_score: Number(document?.scoreBreakdown?.requirementScore || 0),
    experience_score: Number(document?.scoreBreakdown?.experienceScore || 0),
    bucket: String(document?.bucket || "low"),
    matched_items: document?.matchedRequirements || [],
    missing_items: document?.missingRequirements || [],
    improvement_points: document?.improvementSuggestions || [],
    llm_model: document?.analysisModel || null,
    llm_response: {
      provider: document?.analysisProvider || "heuristic",
      cached: Boolean(document?.analysisCached),
      matchingSummary: document?.matchingSummary || "",
      improvementMessage: document?.improvementMessage || "",
    },
  };

  await requestSupabase("resume_job_analyses", {
    method: "POST",
    query: {
      on_conflict: "resume_id,job_id,prompt_version",
    },
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: payload,
  });
}

async function persistMatchRun({ jobDescription, requiredExperience, jobProfile, documents }) {
  const config = getSupabaseConfig();
  if (!config.enabled) {
    return { enabled: false, synced: false, reason: "missing-supabase-env" };
  }

  try {
    const job = await upsertJobRecord(jobDescription, requiredExperience, jobProfile);
    if (!job?.id) {
      return { enabled: true, synced: false, reason: "job-upsert-failed" };
    }

    let syncedResults = 0;
    for (const document of documents || []) {
      const resume = await upsertResumeRecord(document);
      if (!resume?.id) continue;
      await upsertAnalysisRecord(job.id, resume.id, document);
      syncedResults += 1;
    }

    return {
      enabled: true,
      synced: true,
      jobId: job.id,
      savedResults: syncedResults,
    };
  } catch (error) {
    return {
      enabled: true,
      synced: false,
      reason: error?.message || "unknown-supabase-error",
    };
  }
}

module.exports = {
  persistMatchRun,
};
