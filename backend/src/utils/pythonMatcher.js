const path = require("path");
const { spawn } = require("child_process");

const PYTHON_BIN = process.env.PYTHON_BIN || "python";
const SCRIPT_PATH = path.join(__dirname, "..", "ml", "hybrid_matcher.py");
const DEFAULT_TIMEOUT_MS = Number(process.env.HYBRID_MATCH_TIMEOUT_MS) || 180000;

function runHybridMatcher(payload, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const offlineMode =
      process.env.HYBRID_HF_OFFLINE == null
        ? "1"
        : String(process.env.HYBRID_HF_OFFLINE);

    const child = spawn(PYTHON_BIN, [SCRIPT_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE || offlineMode,
        TRANSFORMERS_OFFLINE: process.env.TRANSFORMERS_OFFLINE || offlineMode,
      },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {}
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        return reject(
          new Error(`Hybrid matcher timed out after ${timeoutMs}ms`),
        );
      }

      if (code !== 0) {
        const details = stderr.trim() || stdout.trim() || `Exit code ${code}`;
        return reject(new Error(`Hybrid matcher process failed: ${details}`));
      }

      const output = String(stdout || "").trim();
      if (!output) {
        return reject(new Error("Hybrid matcher returned no output"));
      }

      let parsed;
      try {
        parsed = JSON.parse(output);
      } catch {
        return reject(
          new Error(`Hybrid matcher returned invalid JSON: ${output.slice(0, 200)}`),
        );
      }

      if (!parsed?.ok) {
        const kind = parsed?.kind ? `[${parsed.kind}] ` : "";
        return reject(new Error(`${kind}${parsed?.error || "Hybrid matcher failed"}`));
      }

      return resolve(parsed);
    });

    try {
      child.stdin.write(JSON.stringify(payload || {}));
      child.stdin.end();
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

module.exports = {
  runHybridMatcher,
};
