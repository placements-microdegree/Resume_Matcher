const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const parseResume = require("../utils/parseResume");
const extractJobProfile = require("../utils/jobProfile");
const matchLogic = require("../utils/matchLogic");
const { runHybridMatcher } = require("../utils/pythonMatcher");
const { persistMatchRun } = require("../services/analysisCacheService");

const APP_ROOT = path.resolve(__dirname, "..", "..");
const RESUMES_DIR = path.join(APP_ROOT, "resumes");
const PARSED_DIR = path.join(APP_ROOT, "parsed");

function resolveSafe(baseDir, unsafeName) {
  const base = path.resolve(baseDir);
  const target = path.resolve(baseDir, unsafeName);
  if (!target.startsWith(base + path.sep)) return null;
  return target;
}

function isSafeFileName(name) {
  if (!name) return false;
  if (name !== path.basename(name)) return false;
  if (name.includes("..")) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  return true;
}

function metaPathForResumeFile(fileName) {
  return path.join(PARSED_DIR, `${fileName}.meta.json`);
}

function readResumeMeta(fileName) {
  try {
    const metaPath = metaPathForResumeFile(fileName);
    if (!fs.existsSync(metaPath)) return {};
    const raw = fs.readFileSync(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeResumeMeta(fileName, meta) {
  const metaPath = metaPathForResumeFile(fileName);
  fs.writeFileSync(metaPath, JSON.stringify(meta || {}, null, 2), "utf8");
}

function ensureDirs() {
  if (!fs.existsSync(RESUMES_DIR)) {
    fs.mkdirSync(RESUMES_DIR, { recursive: true });
  }
  if (!fs.existsSync(PARSED_DIR)) {
    fs.mkdirSync(PARSED_DIR, { recursive: true });
  }
}

function buildJobHash(jobDescription, requiredExperience) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        jobDescription: String(jobDescription || "").trim(),
        requiredExperience: Number(requiredExperience) || 0,
      }),
      "utf8",
    )
    .digest("hex");
}

function buildImprovementRecord({
  fileName,
  jobDescription,
  requiredExperience,
  result,
}) {
  const firstLine = String(jobDescription || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find(Boolean);

  return {
    id: `${buildJobHash(jobDescription, requiredExperience)}:${Date.now()}`,
    jobHash: buildJobHash(jobDescription, requiredExperience),
    fileName,
    jobLabel: firstLine || String(jobDescription || "").trim().slice(0, 80),
    jobDescriptionSnippet: String(jobDescription || "").trim().slice(0, 280),
    requiredExperience: Number(requiredExperience) || 0,
    match: Number(result?.match || 0),
    bucket: String(result?.bucket || "low"),
    recommendation: String(result?.recommendation || ""),
    matchingSummary: String(result?.matchingSummary || ""),
    generatedResponse: String(result?.generatedResponse || ""),
    evidenceHighlights: Array.isArray(result?.evidenceHighlights)
      ? result.evidenceHighlights
      : [],
    matchedRequirements: Array.isArray(result?.matchedRequirements)
      ? result.matchedRequirements
      : [],
    missingRequirements: Array.isArray(result?.missingRequirements)
      ? result.missingRequirements
      : [],
    improvementSuggestions: Array.isArray(result?.improvementSuggestions)
      ? result.improvementSuggestions
      : [],
    improvementMessage: String(result?.improvementMessage || ""),
    analysisProvider: String(result?.analysisProvider || "local-rules"),
    analysisModel: result?.analysisModel == null ? null : String(result.analysisModel),
    analysisCached: Boolean(result?.analysisCached),
    updatedAt: new Date().toISOString(),
  };
}

function saveResumeImprovement(fileName, record) {
  const meta = readResumeMeta(fileName);
  const history = Array.isArray(meta?.improvementHistory)
    ? meta.improvementHistory
    : [];

  const filtered = history.filter(
    (item) =>
      item &&
      item.jobHash !== record.jobHash &&
      item.improvementMessage !== record.improvementMessage,
  );

  const nextHistory = [record, ...filtered].slice(0, 25);
  const nextMeta = {
    ...(meta || {}),
    latestImprovement: record,
    improvementHistory: nextHistory,
  };

  writeResumeMeta(fileName, nextMeta);
  return nextMeta;
}

function listResumeImprovementSummaries(_req, res) {
  ensureDirs();
  const files = fs.readdirSync(RESUMES_DIR).filter(Boolean);

  const items = files.map((fileName) => {
    const meta = readResumeMeta(fileName);
    const latestImprovement = meta?.latestImprovement || null;
    const history = Array.isArray(meta?.improvementHistory)
      ? meta.improvementHistory
      : [];

    return {
      fileName,
      latestImprovement,
      improvementCount: history.length,
      lastUpdatedAt: latestImprovement?.updatedAt || null,
    };
  });

  items.sort((a, b) => {
    const aTime = a.lastUpdatedAt ? Date.parse(a.lastUpdatedAt) : 0;
    const bTime = b.lastUpdatedAt ? Date.parse(b.lastUpdatedAt) : 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.fileName.localeCompare(b.fileName);
  });

  return res.json({ items });
}

function getResumeImprovements(req, res) {
  ensureDirs();
  const fileName = String(req.params.fileName || "");
  if (!isSafeFileName(fileName)) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  const resumePath = resolveSafe(RESUMES_DIR, fileName);
  if (!resumePath || !fs.existsSync(resumePath)) {
    return res.status(404).json({ error: "Resume not found" });
  }

  const meta = readResumeMeta(fileName);
  return res.json({
    fileName,
    latestImprovement: meta?.latestImprovement || null,
    history: Array.isArray(meta?.improvementHistory)
      ? meta.improvementHistory
      : [],
  });
}

async function uploadResume(req, res) {
  ensureDirs();

  if (!req.file) {
    return res
      .status(400)
      .json({ error: "No file uploaded. Use form-data field name: resume" });
  }

  return res.json({
    message: "Uploaded",
    filename: req.file.filename,
    path: req.file.path,
  });
}

function listResumes(req, res) {
  ensureDirs();
  const files = fs.readdirSync(RESUMES_DIR).filter(Boolean);
  const debug = String(req?.query?.debug || "") === "1";

  return res.json(
    debug
      ? {
          files,
          debug: {
            cwd: process.cwd(),
            appRoot: APP_ROOT,
            resumesDir: RESUMES_DIR,
            parsedDir: PARSED_DIR,
            resumesCount: files.length,
          },
        }
      : { files },
  );
}

function deleteResume(req, res) {
  ensureDirs();
  const fileName = String(req.params.fileName || "");
  if (!isSafeFileName(fileName)) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  const resumePath = resolveSafe(RESUMES_DIR, fileName);
  const parsedTxtPath = resolveSafe(PARSED_DIR, `${fileName}.txt`);
  const metaPath = resolveSafe(PARSED_DIR, `${fileName}.meta.json`);

  if (!resumePath) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const existed = fs.existsSync(resumePath);
  try {
    if (fs.existsSync(resumePath)) fs.unlinkSync(resumePath);
  } catch {
    return res.status(500).json({ error: "Failed to delete resume" });
  }

  try {
    if (parsedTxtPath && fs.existsSync(parsedTxtPath)) fs.unlinkSync(parsedTxtPath);
  } catch {}

  try {
    if (metaPath && fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  } catch {}

  return res.json({ ok: true, deleted: existed ? fileName : null });
}

function getResumeExperience(req, res) {
  ensureDirs();
  const fileName = String(req.params.fileName || "");
  if (!isSafeFileName(fileName)) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  const meta = readResumeMeta(fileName);
  const value = meta?.experienceYearsOverride ?? null;
  return res.json({ fileName, experienceYearsOverride: value });
}

function updateResumeExperience(req, res) {
  ensureDirs();
  const fileName = String(req.params.fileName || "");
  if (!isSafeFileName(fileName)) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  const body = req.body || {};
  const next =
    body.experienceYearsOverride ??
    body.experienceYears ??
    body.experience ??
    body.years ??
    null;

  const meta = readResumeMeta(fileName);

  if (next === null) {
    if (meta && typeof meta === "object") {
      delete meta.experienceYearsOverride;
    }
    writeResumeMeta(fileName, meta);
    return res.json({ ok: true, fileName, experienceYearsOverride: null });
  }

  const n = Number(next);
  if (!Number.isFinite(n) || n < 0 || n > 80) {
    return res.status(400).json({
      error:
        "experienceYearsOverride must be a number between 0 and 80, or null",
    });
  }

  const updated = { ...(meta || {}), experienceYearsOverride: n };
  writeResumeMeta(fileName, updated);
  return res.json({ ok: true, fileName, experienceYearsOverride: n });
}

function replaceResume(req, res) {
  ensureDirs();

  const fileName = String(req.params.fileName || "");
  if (!isSafeFileName(fileName)) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  if (!req.file?.buffer || !req.file?.originalname) {
    return res.status(400).json({
      error: "No replacement file uploaded. Use form-data field name: resume",
    });
  }

  const currentResumePath = resolveSafe(RESUMES_DIR, fileName);
  if (!currentResumePath || !fs.existsSync(currentResumePath)) {
    return res.status(404).json({ error: "Resume not found" });
  }

  const currentParsedPath = resolveSafe(PARSED_DIR, `${fileName}.txt`);
  const currentMetaPath = resolveSafe(PARSED_DIR, `${fileName}.meta.json`);

  const currentParsed = path.parse(fileName);
  const nextExt = path.extname(String(req.file.originalname || "")).toLowerCase();
  const safeExt = nextExt || currentParsed.ext || ".pdf";
  const nextFileName = `${currentParsed.name}${safeExt}`;
  const nextResumePath = resolveSafe(RESUMES_DIR, nextFileName);
  const nextParsedPath = resolveSafe(PARSED_DIR, `${nextFileName}.txt`);
  const nextMetaPath = resolveSafe(PARSED_DIR, `${nextFileName}.meta.json`);

  if (!nextResumePath || !nextParsedPath || !nextMetaPath) {
    return res.status(400).json({ error: "Invalid replacement target" });
  }

  if (
    nextFileName !== fileName &&
    fs.existsSync(nextResumePath) &&
    nextResumePath !== currentResumePath
  ) {
    return res.status(409).json({
      error:
        "A resume with the replacement file extension already exists for this candidate. Remove it first or use the same file type.",
    });
  }

  try {
    fs.writeFileSync(nextResumePath, req.file.buffer);

    if (nextFileName !== fileName && fs.existsSync(currentResumePath)) {
      fs.unlinkSync(currentResumePath);
    }

    if (currentParsedPath && fs.existsSync(currentParsedPath)) {
      fs.unlinkSync(currentParsedPath);
    }
    if (
      nextParsedPath &&
      nextParsedPath !== currentParsedPath &&
      fs.existsSync(nextParsedPath)
    ) {
      fs.unlinkSync(nextParsedPath);
    }

    if (
      currentMetaPath &&
      nextMetaPath &&
      currentMetaPath !== nextMetaPath &&
      fs.existsSync(currentMetaPath)
    ) {
      if (fs.existsSync(nextMetaPath)) fs.unlinkSync(nextMetaPath);
      fs.renameSync(currentMetaPath, nextMetaPath);
    }
  } catch {
    return res.status(500).json({ error: "Failed to replace resume" });
  }

  return res.json({
    ok: true,
    replaced: true,
    oldFileName: fileName,
    fileName: nextFileName,
    message:
      nextFileName === fileName
        ? "Resume replaced successfully"
        : `Resume replaced successfully and renamed to ${nextFileName}`,
  });
}

async function matchResumes(req, res) {
  ensureDirs();
  res.set("X-Resume-Matcher-Handler", "local-heuristic-v1");

  const { jobDescription = "", requiredExperience = 0 } = req.body || {};
  const normalizedJobDescription = String(jobDescription || "").trim();
  if (!normalizedJobDescription) {
    return res.status(400).json({
      error: "jobDescription must be a non-empty string",
      received: req.body ?? null,
    });
  }

  const requiredExp = Number(requiredExperience);
  if (!Number.isFinite(requiredExp) || requiredExp < 0) {
    return res
      .status(400)
      .json({ error: "requiredExperience must be a number >= 0" });
  }

  const files = fs.readdirSync(RESUMES_DIR).filter(Boolean);
  const jobProfile = extractJobProfile(normalizedJobDescription, requiredExp);
  const contexts = [];

  for (const fileName of files) {
    const fullPath = path.join(RESUMES_DIR, fileName);
    let text = "";
    try {
      text = await parseResume(fullPath);
    } catch {
      text = "";
    }

    const meta = readResumeMeta(fileName);
    const experienceOverride =
      meta && typeof meta === "object" && meta.experienceYearsOverride != null
        ? Number(meta.experienceYearsOverride)
        : null;

    contexts.push({
      fileName,
      rawText: text,
      experienceOverride,
    });
  }

  let matcher = {
    mode: "local-rules-v1",
    fallback: false,
    reason: null,
    models: null,
  };

  const hybridByFileName = new Map();
  try {
    const hybrid = await runHybridMatcher({
      jobDescription: normalizedJobDescription,
      requiredExperience: requiredExp,
      jobProfile,
      resumes: contexts.map((context) => ({
        fileName: context.fileName,
        text: context.rawText,
        experienceOverride: context.experienceOverride,
      })),
    });

    if (Array.isArray(hybrid?.results)) {
      for (const item of hybrid.results) {
        const key = String(item?.fileName || "");
        if (key) hybridByFileName.set(key, item);
      }
      matcher = {
        mode: String(hybrid?.meta?.matcher || "hybrid-ml-v1"),
        fallback: false,
        reason: null,
        models: {
          embeddingModel: hybrid?.meta?.embeddingModel || null,
          rerankModel: hybrid?.meta?.rerankModel || null,
        },
      };
      res.set("X-Resume-Matcher-Handler", matcher.mode);
    }
  } catch (err) {
    const fallbackReason = String(err?.message || "Hybrid matcher unavailable");
    matcher = {
      mode: "local-rules-v1",
      fallback: true,
      reason:
        fallbackReason.length > 280
          ? `${fallbackReason.slice(0, 277)}...`
          : fallbackReason,
      models: null,
    };
    res.set("X-Resume-Matcher-Handler", "local-heuristic-v1");
  }

  function buildRulesResult({ fileName, rawText, experienceOverride }) {
    const detail = matchLogic(rawText, {
      jobProfile,
      requiredExperience: requiredExp,
      experienceOverride,
      fileName,
    });

    return {
      fileName,
      match: detail.match,
      bucket: detail.bucket,
      recommendation: detail.recommendation || "",
      matchedRequirements: detail.matchedRequirements || [],
      missingRequirements: detail.missingRequirements || [],
      improvementSuggestions: detail.improvementSuggestions || [],
      improvementMessage: detail.improvementMessage || "",
      matchingSummary: detail.matchingSummary || "",
      generatedResponse: detail.generatedResponse || "",
      evidenceHighlights: detail.evidenceHighlights || [],
      experienceFound: detail.experienceFound,
      experienceOverride: detail.experienceOverride ?? experienceOverride,
      experienceUsed: detail.experienceUsed,
      scoreBreakdown: detail.scoreBreakdown || {},
      analysisProvider: "local-rules",
      analysisModel: null,
      analysisCached: false,
    };
  }

  for (const context of contexts) {
    const hybridResult = hybridByFileName.get(context.fileName);
    if (hybridResult && typeof hybridResult === "object") {
      context.result = {
        fileName: context.fileName,
        match: Number(hybridResult.match ?? 0),
        bucket: String(hybridResult.bucket || "low"),
        recommendation: String(hybridResult.recommendation || ""),
        matchedRequirements: Array.isArray(hybridResult.matchedRequirements)
          ? hybridResult.matchedRequirements
          : [],
        missingRequirements: Array.isArray(hybridResult.missingRequirements)
          ? hybridResult.missingRequirements
          : [],
        improvementSuggestions: Array.isArray(hybridResult.improvementSuggestions)
          ? hybridResult.improvementSuggestions
          : [],
        improvementMessage: String(hybridResult.improvementMessage || ""),
        matchingSummary: String(hybridResult.matchingSummary || ""),
        generatedResponse: String(hybridResult.generatedResponse || ""),
        evidenceHighlights: Array.isArray(hybridResult.evidenceHighlights)
          ? hybridResult.evidenceHighlights
          : [],
        experienceFound:
          hybridResult.experienceFound == null
            ? null
            : Number(hybridResult.experienceFound),
        experienceOverride:
          hybridResult.experienceOverride == null
            ? context.experienceOverride
            : Number(hybridResult.experienceOverride),
        experienceUsed:
          hybridResult.experienceUsed == null
            ? null
            : Number(hybridResult.experienceUsed),
        scoreBreakdown:
          hybridResult.scoreBreakdown && typeof hybridResult.scoreBreakdown === "object"
            ? hybridResult.scoreBreakdown
            : {},
        analysisProvider: String(hybridResult.analysisProvider || "hybrid-ml"),
        analysisModel:
          hybridResult.analysisModel == null
            ? matcher?.models
              ? `${matcher.models.embeddingModel || "unknown"} + ${matcher.models.rerankModel || "unknown"}`
              : null
            : String(hybridResult.analysisModel),
        analysisCached: Boolean(hybridResult.analysisCached),
      };
    } else {
      context.result = buildRulesResult(context);
    }
  }

  const results = contexts.map((context) => context.result);
  const bucketRank = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => {
    const bucketDiff = (bucketRank[a.bucket] ?? 99) - (bucketRank[b.bucket] ?? 99);
    if (bucketDiff !== 0) return bucketDiff;
    return (b.match ?? 0) - (a.match ?? 0);
  });

  const buckets = results.reduce(
    (acc, item) => {
      const key = item.bucket || "low";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );

  for (const context of contexts) {
    const record = buildImprovementRecord({
      fileName: context.fileName,
      jobDescription: normalizedJobDescription,
      requiredExperience: requiredExp,
      result: context.result,
    });
    saveResumeImprovement(context.fileName, record);
  }

  const persistence = await persistMatchRun({
    jobDescription: normalizedJobDescription,
    requiredExperience: requiredExp,
    jobProfile,
    documents: contexts.map((context) => ({
      ...context.result,
      rawText: context.rawText,
    })),
  });

  return res.json({
    results,
    buckets,
    jobProfile: {
      mustHaveKeywords: jobProfile.mustHaveKeywords || [],
      niceToHaveKeywords: jobProfile.niceToHaveKeywords || [],
      requiredExperience: requiredExp,
    },
    matcher,
    persistence,
  });
}

module.exports = {
  uploadResume,
  listResumes,
  listResumeImprovementSummaries,
  deleteResume,
  getResumeExperience,
  updateResumeExperience,
  getResumeImprovements,
  replaceResume,
  matchResumes,
};
