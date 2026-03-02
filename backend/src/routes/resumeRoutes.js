const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const {
  uploadResume,
  listResumes,
  deleteResume,
  getResumeExperience,
  updateResumeExperience,
  matchResumes,
} = require("../controllers/resumeController");

const router = express.Router();

const APP_ROOT = path.resolve(__dirname, "..", "..");
const RESUMES_DIR = path.join(APP_ROOT, "resumes");

function sanitizeFileName(name) {
  const base = String(name || "resume").trim() || "resume";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function uniqueFileName(dir, desiredName) {
  const parsed = path.parse(desiredName);
  const base = parsed.name || "resume";
  const ext = parsed.ext || "";

  let candidate = `${base}${ext}`;
  let i = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}-${i}${ext}`;
    i += 1;
    if (i > 9999) {
      // Extremely unlikely; fallback to timestamp
      return `${Date.now()}-${base}${ext}`;
    }
  }
  return candidate;
}

// Store uploaded files under backend/resumes/
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(RESUMES_DIR, { recursive: true });
    } catch {
      // ignore mkdir errors; multer will surface write errors if any
    }
    cb(null, RESUMES_DIR);
  },
  filename: (_req, file, cb) => {
    // Keep original file name (sanitized). If it already exists, add -2/-3... suffix.
    const sanitized = sanitizeFileName(file.originalname || "resume");
    const finalName = uniqueFileName(RESUMES_DIR, sanitized);
    cb(null, finalName);
  },
});

const upload = multer({ storage });

router.get("/", listResumes);
router.post("/upload", upload.single("resume"), uploadResume);
router.post("/match", matchResumes);

// Manage individual resumes
router.delete("/:fileName", deleteResume);
router.get("/:fileName/experience", getResumeExperience);
router.patch("/:fileName/experience", updateResumeExperience);

module.exports = router;
