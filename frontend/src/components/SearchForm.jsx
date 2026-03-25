import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const SAMPLE_JOB_DESCRIPTION = `Senior DevOps Engineer

We are looking for a DevOps engineer with hands-on experience in AWS, Terraform, Kubernetes, CI/CD, Linux, and monitoring.

Responsibilities:
- Build and maintain CI/CD pipelines
- Manage cloud infrastructure on AWS
- Support Kubernetes deployments and container operations
- Improve observability using Grafana and Prometheus

Nice to have:
- Experience with GitHub Actions
- Exposure to incident response and SRE practices`;

function Spinner() {
  return (
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
  );
}

function SecondaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
      {...props}
    >
      {children}
    </button>
  );
}

function buildMatchRequestError(err) {
  const data = err?.response?.data || {};
  return data?.error || data?.message || err?.message || "Request failed";
}

export default function SearchForm({
  apiBase: apiBaseProp,
  onMatchData,
  onLoadingChange,
}) {
  const [jobDescription, setJobDescription] = useState("");
  const [requiredExperience, setRequiredExperience] = useState(2);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [resumeFiles, setResumeFiles] = useState([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [resumeNotice, setResumeNotice] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [replacingFileName, setReplacingFileName] = useState("");
  const replaceInputRefs = useRef({});

  const apiBase = useMemo(() => {
    return (
      apiBaseProp || import.meta.env.VITE_API_BASE || "http://localhost:8000"
    );
  }, [apiBaseProp]);

  const jdStats = useMemo(() => {
    const text = String(jobDescription || "").trim();
    if (!text) return { words: 0, lines: 0 };
    return {
      words: text.split(/\s+/g).filter(Boolean).length,
      lines: text.split(/\n+/g).filter((line) => line.trim()).length,
    };
  }, [jobDescription]);

  async function refreshResumes() {
    setResumeError("");
    setResumeLoading(true);
    try {
      const resp = await axios.get(`${apiBase}/api/resumes`);
      const files = resp?.data?.files;
      setResumeFiles(Array.isArray(files) ? files : []);
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Failed to list resumes";
      setResumeError(message);
      setResumeFiles([]);
    } finally {
      setResumeLoading(false);
    }
  }

  useEffect(() => {
    refreshResumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  async function uploadSelectedResumes() {
    setResumeError("");
    setResumeNotice("");
    const files = Array.from(selectedFiles || []).filter(Boolean);
    if (!files.length) {
      setResumeError("Pick at least one file to upload.");
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("resume", file);
        await axios.post(`${apiBase}/api/resumes/upload`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      setSelectedFiles([]);
      await refreshResumes();
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Upload failed";
      setResumeError(message);
    } finally {
      setUploading(false);
    }
  }

  async function deleteResume(fileName) {
    if (!fileName) return;
    setResumeError("");
    setResumeNotice("");
    try {
      await axios.delete(
        `${apiBase}/api/resumes/${encodeURIComponent(String(fileName))}`,
      );
      await refreshResumes();
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Delete failed";
      setResumeError(message);
    }
  }

  function openReplacePicker(fileName) {
    const input = replaceInputRefs.current?.[fileName];
    input?.click?.();
  }

  async function replaceResume(fileName, fileList) {
    const nextFile = Array.from(fileList || []).find(Boolean);
    if (!fileName || !nextFile) return;

    setResumeError("");
    setResumeNotice("");
    setReplacingFileName(fileName);

    try {
      const fd = new FormData();
      fd.append("resume", nextFile);
      const resp = await axios.put(
        `${apiBase}/api/resumes/${encodeURIComponent(String(fileName))}/replace`,
        fd,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      await refreshResumes();
      const message =
        resp?.data?.message ||
        "Resume replaced successfully. Rerun ranking to refresh results.";
      setResumeNotice(`${message}. Rerun ranking to refresh results.`);
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Replace failed";
      setResumeError(message);
    } finally {
      setReplacingFileName("");
      const input = replaceInputRefs.current?.[fileName];
      if (input) input.value = "";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const normalizedJobDescription = String(jobDescription || "").trim();
    if (!normalizedJobDescription) {
      setError("Please paste a job description.");
      return;
    }

    const years = Number(requiredExperience);
    if (!Number.isFinite(years) || years < 0) {
      setError("Required experience must be a valid number (0+).");
      return;
    }

    setLoading(true);
    onLoadingChange?.(true);
    try {
      const payload = {
        jobDescription: normalizedJobDescription,
        requiredExperience: years,
      };
      const resp = await axios.post(`${apiBase}/api/resumes/match`, payload);
      const data = resp?.data || {};
      onMatchData?.({
        results: Array.isArray(data) ? data : data.results ?? [],
        buckets: data?.buckets ?? { high: 0, medium: 0, low: 0 },
        jobProfile: data?.jobProfile ?? null,
        matcher: data?.matcher ?? null,
        persistence: data?.persistence ?? null,
      });
    } catch (err) {
      const message = buildMatchRequestError(err);
      setError(message);
      onMatchData?.({
        results: [],
        buckets: { high: 0, medium: 0, low: 0 },
        jobProfile: null,
        matcher: null,
        persistence: null,
      });
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4" aria-labelledby="job-description-heading">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Step 1
              </div>
              <h2
                id="job-description-heading"
                className="mt-1 text-lg font-bold text-slate-900"
              >
                Define the role
              </h2>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-500">
              <div>{jdStats.words} words</div>
              <div>{jdStats.lines} lines</div>
            </div>
          </div>

          <p className="text-sm leading-6 text-slate-600">
            Paste the full job description. The app extracts must-have and
            optional keywords automatically, so you do not need to list skills
            separately.
          </p>

          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              onClick={() => setJobDescription(SAMPLE_JOB_DESCRIPTION)}
            >
              Load sample JD
            </SecondaryButton>
            <SecondaryButton onClick={() => setJobDescription("")}>
              Clear
            </SecondaryButton>
          </div>
        </div>

        <div>
          <label
            htmlFor="job-description"
            className="mb-2 block text-sm font-semibold text-slate-800"
          >
            Job description
          </label>
          <textarea
            id="job-description"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            aria-describedby="job-description-help"
            placeholder="Paste the job description here. Include responsibilities, must-have skills, preferred skills, and role context."
            className="subtle-field h-52 resize-none px-4 py-4 leading-6"
          />
          <p
            id="job-description-help"
            className="mt-2 text-xs leading-5 text-slate-500"
          >
            Tip: include both must-have and nice-to-have sections if the JD has
            them. That improves ranking accuracy.
          </p>
        </div>

        <div>
          <label
            htmlFor="required-experience"
            className="mb-2 block text-sm font-semibold text-slate-800"
          >
            Required experience (years)
          </label>
          <input
            id="required-experience"
            type="number"
            min={0}
            step={1}
            value={requiredExperience}
            onChange={(e) => setRequiredExperience(e.target.value)}
            className="subtle-field"
          />
        </div>

        {error ? (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className={
            "inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition " +
            (loading
              ? "bg-slate-400"
              : "bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400")
          }
        >
          {loading ? <Spinner /> : null}
          {loading ? "Ranking resumes..." : "Rank resumes"}
        </button>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
          Request body:
          <div className="mt-1 font-mono text-slate-700">
            {"{ jobDescription: string, requiredExperience: number }"}
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="resume-library-heading">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Step 2
            </div>
            <h2
              id="resume-library-heading"
              className="mt-1 text-lg font-bold text-slate-900"
            >
              Manage resume library
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Upload resumes once, then rerun matching whenever the job
              description changes.
            </p>
          </div>

          <SecondaryButton onClick={refreshResumes} disabled={resumeLoading}>
            {resumeLoading ? "Refreshing..." : "Refresh"}
          </SecondaryButton>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
          <div className="grid gap-3">
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              onChange={(e) => setSelectedFiles(e.target.files)}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-100"
            />
            <button
              type="button"
              onClick={uploadSelectedResumes}
              disabled={uploading}
              className={
                "inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition " +
                (uploading
                  ? "bg-slate-400"
                  : "bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400")
              }
            >
              {uploading ? "Uploading..." : "Upload selected resumes"}
            </button>
          </div>
        </div>

        {resumeError ? (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            {resumeError}
          </div>
        ) : null}

        {resumeNotice ? (
          <div
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            role="status"
          >
            {resumeNotice}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Uploaded files
            </span>
            <span
              className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
              aria-live="polite"
            >
              {resumeFiles.length}
            </span>
          </div>

          <div className="max-h-56 overflow-auto p-3">
            {resumeLoading ? (
              <div className="rounded-2xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
                Loading resumes...
              </div>
            ) : resumeFiles.length ? (
              <div className="space-y-2">
                {resumeFiles.map((fileName) => (
                  <div
                    key={fileName}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">
                        {fileName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openReplacePicker(fileName)}
                      disabled={replacingFileName === fileName}
                      className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                      title="Replace resume"
                    >
                      {replacingFileName === fileName ? "Replacing..." : "Replace"}
                    </button>
                    <input
                      ref={(node) => {
                        if (node) replaceInputRefs.current[fileName] = node;
                        else delete replaceInputRefs.current[fileName];
                      }}
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="sr-only"
                      onChange={(e) => replaceResume(fileName, e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => deleteResume(fileName)}
                      className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      title="Delete resume"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
                No resumes uploaded yet. Add a few files to start ranking
                candidates against the job description.
              </div>
            )}
          </div>
        </div>
      </section>
    </form>
  );
}
