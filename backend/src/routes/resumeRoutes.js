const express = require("express");
const multer = require("multer");

const {
  uploadResume,
  listResumes,
  matchResumes,
} = require("../controllers/resumeController");

const router = express.Router();

// Store uploaded files under backend/resumes/
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "resumes"),
  filename: (_req, file, cb) => {
    // basic safe-ish filename
    const ts = Date.now();
    const original = (file.originalname || "resume").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
    cb(null, `${ts}-${original}`);
  },
});

const upload = multer({ storage });

router.get("/", listResumes);
router.post("/upload", upload.single("resume"), uploadResume);
router.post("/match", matchResumes);

module.exports = router;
