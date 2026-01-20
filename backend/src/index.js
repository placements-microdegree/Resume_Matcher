const express = require("express");
const cors = require("cors");

require("dotenv").config();

const resumeRoutes = require("./routes/resumeRoutes");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Avoid noisy 404s from browsers requesting a favicon.
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// ✅ root route (prevents 404 on domain root)
app.get("/", (_req, res) => {
  res.send("Resume Matcher Backend Running ✅");
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/resumes", resumeRoutes);

const port = process.env.PORT || 9090;
const host = process.env.HOST || "0.0.0.0";

// ✅ Correct log (shows real host)
app.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`);
});
