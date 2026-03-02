const path = require("path");
const fs = require("fs");

const parseResume = require("../utils/parseResume");
const matchLogic = require("../utils/matchLogic");

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
  // Store meta next to parsed cache
  return path.join(PARSED_DIR, `${fileName}.meta.json`);
}

function parsedTextPathForResumeFile(fileName) {
  // parseResume caches to `${base}.txt` where base = original filename
  return path.join(PARSED_DIR, `${fileName}.txt`);
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
  if (!fs.existsSync(RESUMES_DIR))
    fs.mkdirSync(RESUMES_DIR, { recursive: true });
  if (!fs.existsSync(PARSED_DIR)) fs.mkdirSync(PARSED_DIR, { recursive: true });
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

function listResumes(_req, res) {
  ensureDirs();
  const files = fs.readdirSync(RESUMES_DIR).filter(Boolean);

  // Optional debug payload: /api/resumes?debug=1
  // Useful for validating the running server's paths on a droplet/container.
  const debug = String(_req?.query?.debug || "") === "1";

  res.json(
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
  } catch (e) {
    return res.status(500).json({ error: "Failed to delete resume" });
  }

  // Best-effort cleanup of cache/meta
  try {
    if (parsedTxtPath && fs.existsSync(parsedTxtPath))
      fs.unlinkSync(parsedTxtPath);
  } catch {
    // ignore
  }
  try {
    if (metaPath && fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  } catch {
    // ignore
  }

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
    return res
      .status(400)
      .json({
        error:
          "experienceYearsOverride must be a number between 0 and 80, or null",
      });
  }

  const updated = { ...(meta || {}), experienceYearsOverride: n };
  writeResumeMeta(fileName, updated);

  return res.json({ ok: true, fileName, experienceYearsOverride: n });
}

async function matchResumes(req, res) {
  ensureDirs();

  // Debug/diagnostic: helps verify the server is running this handler.
  res.set("X-Resume-Matcher-Handler", "skills-minExperience-v1");

  const { skills = [], minExperience = 0 } = req.body || {};
  if (!Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({
      error: "skills must be a non-empty array",
      received: req.body ?? null,
    });
  }

  const minExp = Number(minExperience);
  if (!Number.isFinite(minExp) || minExp < 0) {
    return res
      .status(400)
      .json({ error: "minExperience must be a number >= 0" });
  }

  const files = fs.readdirSync(RESUMES_DIR).filter(Boolean);

  const results = [];
  for (const filename of files) {
    const fullPath = path.join(RESUMES_DIR, filename);
    let text = "";
    try {
      text = await parseResume(fullPath);
    } catch {
      text = "";
    }
    const meta = readResumeMeta(filename);
    const experienceOverride =
      meta && typeof meta === "object" && meta.experienceYearsOverride != null
        ? Number(meta.experienceYearsOverride)
        : null;

    const detail = matchLogic(text, {
      skills,
      minExperience: minExp,
      experienceOverride,
    });

    results.push({
      fileName: filename,
      match: detail.match,
      matchedSkills: detail.matchedSkills,
      missingSkills: detail.missingSkills,
      experienceFound: detail.experienceFound,
      experienceOverride: detail.experienceOverride ?? experienceOverride,
      experienceUsed: detail.experienceUsed,
    });
  }

  results.sort((a, b) => (b.match ?? 0) - (a.match ?? 0));
  res.json({ results });
}

module.exports = {
  uploadResume,
  listResumes,
  deleteResume,
  getResumeExperience,
  updateResumeExperience,
  matchResumes,
};
