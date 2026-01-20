const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const {
  uploadResume,
  listResumes,
  matchResumes,
} = require("../controllers/resumeController");

const router = express.Router();

const APP_ROOT = path.resolve(__dirname, "..", "..");
const RESUMES_DIR = path.join(APP_ROOT, "resumes");

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
    // basic safe-ish filename
    const ts = Date.now();
    const original = (file.originalname || "resume").replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    cb(null, `${ts}-${original}`);
  },
});

const upload = multer({ storage });

router.get("/", listResumes);
router.post("/upload", upload.single("resume"), uploadResume);
router.post("/match", matchResumes);

module.exports = router;
