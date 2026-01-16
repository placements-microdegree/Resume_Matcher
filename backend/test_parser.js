const parseResume = require("./src/utils/parseResume");
const path = require("path");
const fs = require("fs");

async function examineResumes() {
  const resumesDir = path.join(process.cwd(), "resumes");
  const files = fs.readdirSync(resumesDir).filter(f => f.toLowerCase().endsWith(".pdf")).slice(0, 3);

  for (const file of files) {
    const fullPath = path.join(resumesDir, file);
    console.log(`\n--- EXAMINING: ${file} ---`);
    try {
      const text = await parseResume(fullPath);
      console.log("TEXT PREVIEW (First 1000 chars):");
      console.log(text.substring(0, 1000));
      console.log("\n--- END PREVIEW ---\n");
    } catch (err) {
      console.error(`Failed to parse ${file}:`, err);
    }
  }
}

examineResumes();
