const express = require("express");
const cors = require("cors");

const resumeRoutes = require("./routes/resumeRoutes");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/resumes", resumeRoutes);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
