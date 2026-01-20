const fs = require("fs");
const path = require("path");

// Standard pdf-parse require for v2.4.5
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

const APP_ROOT = path.resolve(__dirname, "..", "..");
const PARSED_DIR = path.join(APP_ROOT, "parsed");

function ensureParsedDir() {
  if (!fs.existsSync(PARSED_DIR)) fs.mkdirSync(PARSED_DIR, { recursive: true });
}

function cachePathFor(filePath) {
  const base = path.basename(filePath);
  return path.join(PARSED_DIR, `${base}.txt`);
}

function isCacheFresh(originalPath, cachedPath) {
  try {
    const src = fs.statSync(originalPath);
    const cache = fs.statSync(cachedPath);
    return cache.mtimeMs >= src.mtimeMs;
  } catch {
    return false;
  }
}

async function parseByType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf8");
  }

  if (ext === ".pdf") {
    if (!PDFParse) {
      console.error("PDFParse class not found in module.");
      return "";
    }
    let parser = null;
    try {
      const buf = fs.readFileSync(filePath);
      parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      return result?.text || "";
    } catch (err) {
      console.error(`Error parsing PDF ${filePath}:`, err);
      return "";
    } finally {
      if (parser) {
        await parser.destroy().catch(() => {});
      }
    }
  }

  if (ext === ".docx") {
    try {
      const buf = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer: buf });
      return result?.value || "";
    } catch {
      return "";
    }
  }

  // Unsupported types (e.g., .doc without conversion)
  return "";
}

module.exports = async function parseResume(filePath) {
  ensureParsedDir();

  const cachedPath = cachePathFor(filePath);
  if (fs.existsSync(cachedPath) && isCacheFresh(filePath, cachedPath)) {
    return fs.readFileSync(cachedPath, "utf8");
  }

  const text = await parseByType(filePath);
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  fs.writeFileSync(cachedPath, normalized, "utf8");
  return normalized;
};
