const path = require("path");
const fs = require("fs");

const parseResume = require("../utils/parseResume");
const matchLogic = require("../utils/matchLogic");

const APP_ROOT = path.resolve(__dirname, "..", "..");
const RESUMES_DIR = path.join(APP_ROOT, "resumes");
const PARSED_DIR = path.join(APP_ROOT, "parsed");

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
    const detail = matchLogic(text, { skills, minExperience: minExp });

    results.push({
      fileName: filename,
      match: detail.match,
      matchedSkills: detail.matchedSkills,
      missingSkills: detail.missingSkills,
      experienceFound: detail.experienceFound,
    });
  }

  results.sort((a, b) => (b.match ?? 0) - (a.match ?? 0));
  res.json({ results });
}

module.exports = {
  uploadResume,
  listResumes,
  matchResumes,
};
