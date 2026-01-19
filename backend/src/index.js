const express = require("express");
const cors = require("cors");

require("dotenv").config();

const resumeRoutes = require("./routes/resumeRoutes");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/resumes", resumeRoutes);

const port = process.env.PORT || 6000;
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`);
});
