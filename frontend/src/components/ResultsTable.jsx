import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

async function copyToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function ScorePill({ value }) {
  const score = Number.isFinite(Number(value)) ? Number(value) : 0;
  const color =
    score >= 80
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : score >= 60
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-rose-50 text-rose-700 ring-rose-200";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${color}`}
    >
      {Math.round(score)}%
    </span>
  );
}

function BucketPill({ bucket }) {
  const value = String(bucket || "low").toLowerCase();
  const map = {
    high: "bg-emerald-100 text-emerald-800",
    medium: "bg-amber-100 text-amber-800",
    low: "bg-rose-100 text-rose-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
        map[value] || map.low
      }`}
    >
      {value}
    </span>
  );
}

function Chip({ children, tone = "slate" }) {
  const map = {
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        map[tone] || map.slate
      }`}
    >
      {children}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-20 animate-pulse rounded-3xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-3xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-3xl bg-slate-100" />
      </div>
      <div className="h-16 animate-pulse rounded-3xl bg-slate-100" />
      <div className="h-48 animate-pulse rounded-3xl bg-slate-100" />
    </div>
  );
}

function SummaryCard({ label, count, tone }) {
  const map = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  };

  return (
    <div
      className={`rounded-[1.5rem] border px-4 py-4 ${map[tone] || "border-slate-200 bg-slate-50 text-slate-800"}`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">
        {label}
      </div>
      <div className="mt-2 text-3xl font-extrabold">{count}</div>
    </div>
  );
}

function PersistenceBadge({ persistence }) {
  if (!persistence) return null;

  if (persistence.synced) {
    return (
      <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Synced to Supabase. Saved {persistence.savedResults || 0} resume analyses for this run.
      </div>
    );
  }

  if (persistence.enabled) {
    return (
      <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        Supabase is configured, but this run stayed local. Reason: {persistence.reason || "unknown"}.
      </div>
    );
  }

  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      Local mode is active. Add Supabase credentials when you want reusable cache storage.
    </div>
  );
}

function MatcherBadge({ matcher }) {
  if (!matcher) return null;
  const mode = String(matcher.mode || "").toLowerCase();
  const isHybrid = mode.includes("hybrid");

  if (matcher.fallback) {
    return (
      <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        Hybrid matching was unavailable for this run, so rules-based scoring was used.
        {matcher.reason ? ` Reason: ${matcher.reason}.` : ""}
      </div>
    );
  }

  if (isHybrid) {
    return (
      <div className="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Hybrid ML matching is active (semantic + rerank + fuzzy + entity signals).
      </div>
    );
  }

  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      Rules-based matching mode is active.
    </div>
  );
}

function SectionBlock({ title, hint, children }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </div>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function modeLabelForProvider(provider) {
  const value = String(provider || "").toLowerCase();
  return value.includes("hybrid") ? "Hybrid ML" : "Rules-based";
}

export default function ResultsTable({
  apiBase: apiBaseProp,
  results,
  loading,
  buckets,
  jobProfile,
  matcher,
  persistence,
}) {
  const [query, setQuery] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [copiedImprovementKey, setCopiedImprovementKey] = useState("");
  const [experienceDrafts, setExperienceDrafts] = useState({});
  const [experienceSaving, setExperienceSaving] = useState({});
  const [experienceNotice, setExperienceNotice] = useState({});
  const [experienceError, setExperienceError] = useState({});

  const apiBase = useMemo(() => {
    return apiBaseProp || import.meta.env.VITE_API_BASE || "http://localhost:8000";
  }, [apiBaseProp]);

  const normalized = useMemo(() => {
    const list = Array.isArray(results) ? results : [];
    return list.map((result, index) => ({
      _idx: index,
      fileName: result.fileName ?? result.filename ?? result.file ?? "unknown",
      match: result.match ?? result.score ?? 0,
      bucket: result.bucket ?? "low",
      matchedRequirements: Array.isArray(result.matchedRequirements)
        ? result.matchedRequirements
        : [],
      missingRequirements: Array.isArray(result.missingRequirements)
        ? result.missingRequirements
        : [],
      improvementSuggestions: Array.isArray(result.improvementSuggestions)
        ? result.improvementSuggestions
        : [],
      improvementMessage: result.improvementMessage ?? "",
      matchingSummary: result.matchingSummary ?? "",
      experienceFound: result.experienceFound ?? null,
      experienceOverride: result.experienceOverride ?? null,
      experienceUsed: result.experienceUsed ?? null,
      scoreBreakdown: result.scoreBreakdown ?? {},
      analysisProvider: result.analysisProvider ?? "local-rules",
      analysisModel: result.analysisModel ?? null,
    }));
  }, [results]);

  useEffect(() => {
    setExperienceDrafts((current) => {
      const next = { ...(current || {}) };
      for (const item of normalized) {
        if (next[item.fileName] == null && item.experienceOverride != null) {
          next[item.fileName] = String(item.experienceOverride);
        }
      }
      return next;
    });
  }, [normalized]);

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bucketRank = { high: 0, medium: 1, low: 2 };

    return normalized
      .filter((item) => {
        if (bucketFilter !== "all" && item.bucket !== bucketFilter) return false;
        if (!q) return true;
        return String(item.fileName).toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const bucketDiff =
          (bucketRank[a.bucket] ?? 99) - (bucketRank[b.bucket] ?? 99);
        if (bucketDiff !== 0) return bucketDiff;
        return (b.match ?? 0) - (a.match ?? 0);
      });
  }, [bucketFilter, normalized, query]);

  const mustHaveKeywords = jobProfile?.mustHaveKeywords || [];
  const optionalKeywords = jobProfile?.niceToHaveKeywords || [];

  async function handleCopyImprovement(item) {
    const ok = await copyToClipboard(item.improvementMessage || "");
    if (!ok) return;

    const key = `${item.fileName}-${item._idx}`;
    setCopiedImprovementKey(key);
    setTimeout(() => {
      setCopiedImprovementKey((current) => (current === key ? "" : current));
    }, 1400);
  }

  function readDraftValue(item) {
    const draft = experienceDrafts[item.fileName];
    if (draft != null) return draft;
    if (item.experienceOverride != null) return String(item.experienceOverride);
    return "";
  }

  async function saveExperienceOverride(item) {
    const fileName = String(item?.fileName || "").trim();
    if (!fileName) return;

    const raw = String(readDraftValue(item) || "").trim();
    const number = Number(raw);
    if (!raw) {
      setExperienceError((current) => ({
        ...(current || {}),
        [fileName]: "Enter years first, or use Clear.",
      }));
      return;
    }
    if (!Number.isFinite(number) || number < 0 || number > 80) {
      setExperienceError((current) => ({
        ...(current || {}),
        [fileName]: "Experience must be between 0 and 80.",
      }));
      return;
    }

    setExperienceSaving((current) => ({ ...(current || {}), [fileName]: true }));
    setExperienceError((current) => ({ ...(current || {}), [fileName]: "" }));
    setExperienceNotice((current) => ({ ...(current || {}), [fileName]: "" }));

    try {
      await axios.patch(
        `${apiBase}/api/resumes/${encodeURIComponent(fileName)}/experience`,
        { experienceYearsOverride: number },
      );
      setExperienceNotice((current) => ({
        ...(current || {}),
        [fileName]: `Saved ${number} years. Rerun ranking to apply.`,
      }));
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Failed to save override";
      setExperienceError((current) => ({ ...(current || {}), [fileName]: message }));
    } finally {
      setExperienceSaving((current) => ({ ...(current || {}), [fileName]: false }));
    }
  }

  async function clearExperienceOverride(item) {
    const fileName = String(item?.fileName || "").trim();
    if (!fileName) return;

    setExperienceSaving((current) => ({ ...(current || {}), [fileName]: true }));
    setExperienceError((current) => ({ ...(current || {}), [fileName]: "" }));
    setExperienceNotice((current) => ({ ...(current || {}), [fileName]: "" }));

    try {
      await axios.patch(
        `${apiBase}/api/resumes/${encodeURIComponent(fileName)}/experience`,
        { experienceYearsOverride: null },
      );
      setExperienceDrafts((current) => ({ ...(current || {}), [fileName]: "" }));
      setExperienceNotice((current) => ({
        ...(current || {}),
        [fileName]: "Override cleared. Rerun ranking to apply.",
      }));
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Failed to clear override";
      setExperienceError((current) => ({ ...(current || {}), [fileName]: message }));
    } finally {
      setExperienceSaving((current) => ({ ...(current || {}), [fileName]: false }));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Step 3
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            Review ranked resumes
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Compare high, medium, and low matches, then scan each resume for
            strengths, missing requirements, and suggested improvements.
          </p>
        </div>

        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div aria-live="polite">{Array.isArray(results) ? results.length : 0} resumes ranked</div>
          <div className="mt-1">
            Required experience:{" "}
            <span className="font-semibold text-slate-800">
              {jobProfile?.requiredExperience ?? 0} years
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryCard
              label="High match"
              count={buckets?.high ?? 0}
              tone="emerald"
            />
            <SummaryCard
              label="Medium match"
              count={buckets?.medium ?? 0}
              tone="amber"
            />
            <SummaryCard
              label="Low match"
              count={buckets?.low ?? 0}
              tone="rose"
            />
          </div>

          <PersistenceBadge persistence={persistence} />
          <MatcherBadge matcher={matcher} />

          {(mustHaveKeywords.length || optionalKeywords.length) && (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Extracted role keywords
              </div>

              {mustHaveKeywords.length ? (
                <div className="mt-3">
                  <div className="mb-2 text-sm font-semibold text-slate-800">
                    Must-have
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mustHaveKeywords.map((item) => (
                      <Chip key={`must-${item}`} tone="emerald">
                        {item}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}

              {optionalKeywords.length ? (
                <div className="mt-4">
                  <div className="mb-2 text-sm font-semibold text-slate-800">
                    Nice-to-have
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {optionalKeywords.map((item) => (
                      <Chip key={`optional-${item}`} tone="amber">
                        {item}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {filteredAndSorted.length ? (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Improvement notes
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Copy a resume-specific improvement note whenever you want to send feedback later.
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  {filteredAndSorted.length} notes available
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {filteredAndSorted.map((item) => (
                  <div
                    key={`${item.fileName}-note`}
                    className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-slate-900">
                            {item.fileName}
                          </div>
                          <BucketPill bucket={item.bucket} />
                          <ScorePill value={item.match} />
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                          {item.improvementMessage || item.matchingSummary}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyImprovement(item)}
                        className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        {copiedImprovementKey === `${item.fileName}-${item._idx}`
                          ? "Copied"
                          : "Copy note"}
                      </button>
                      <a
                        href={`#/improvements/${encodeURIComponent(item.fileName)}`}
                        className="inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        Open page
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Filter results
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Search by file name or narrow to a specific bucket.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by file name..."
                  aria-label="Search resumes by file name"
                  className="subtle-field sm:w-72"
                />

                <select
                  value={bucketFilter}
                  onChange={(e) => setBucketFilter(e.target.value)}
                  aria-label="Filter results by bucket"
                  className="subtle-field sm:w-44"
                >
                  <option value="all">All buckets</option>
                  <option value="high">High only</option>
                  <option value="medium">Medium only</option>
                  <option value="low">Low only</option>
                </select>
              </div>
            </div>
          </div>

          {!filteredAndSorted.length ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/80 p-10 text-center">
              <div className="text-base font-semibold text-slate-800">
                No results to show
              </div>
              <div className="mt-2 text-sm text-slate-500">
                {query.trim() || bucketFilter !== "all"
                  ? "Try a different search or bucket filter."
                  : "Run a ranking to populate the shortlist."}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAndSorted.map((item, index) => {
                const modeLabel = modeLabelForProvider(item.analysisProvider);
                return (
                  <article
                    key={`${item.fileName}-${item._idx}`}
                    className="result-card relative overflow-hidden"
                  >
                  <div
                    className={`absolute inset-y-0 left-0 w-1.5 ${
                      item.bucket === "high"
                        ? "bg-emerald-500"
                        : item.bucket === "medium"
                          ? "bg-amber-400"
                          : "bg-rose-400"
                    }`}
                    aria-hidden="true"
                  />

                  <div className="pl-2">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Rank #{index + 1}
                          </span>
                          <BucketPill bucket={item.bucket} />
                          <ScorePill value={item.match} />
                          <Chip tone="slate">{modeLabel}</Chip>
                        </div>

                        <h3 className="mt-3 text-lg font-bold text-slate-900">
                          {item.fileName}
                        </h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                          {item.matchingSummary || "No summary available yet."}
                        </p>
                      </div>

                      <div className="grid gap-2 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:grid-cols-3 lg:min-w-[330px] lg:grid-cols-1">
                        <div>
                          Matching mode
                          <div className="mt-1 font-bold text-slate-900">
                            {modeLabel}
                          </div>
                          {item.analysisModel ? (
                            <div className="mt-1 text-xs text-slate-500">
                              {item.analysisModel}
                            </div>
                          ) : null}
                        </div>
                        <div>
                          Requirement score
                          <div className="mt-1 font-bold text-slate-900">
                            {Math.round(item.scoreBreakdown?.requirementScore || 0)}%
                          </div>
                        </div>
                        <div>
                          Experience score
                          <div className="mt-1 font-bold text-slate-900">
                            {Math.round(item.scoreBreakdown?.experienceScore || 0)}%
                          </div>
                        </div>
                        {Number.isFinite(Number(item.scoreBreakdown?.semanticScore)) ? (
                          <div>
                            Semantic score
                            <div className="mt-1 font-bold text-slate-900">
                              {Math.round(item.scoreBreakdown?.semanticScore || 0)}%
                            </div>
                          </div>
                        ) : null}
                        {Number.isFinite(Number(item.scoreBreakdown?.rerankScore)) ? (
                          <div>
                            Rerank score
                            <div className="mt-1 font-bold text-slate-900">
                              {Math.round(item.scoreBreakdown?.rerankScore || 0)}%
                            </div>
                          </div>
                        ) : null}
                        <div>
                          Experience extracted
                          <div className="mt-1 font-bold text-slate-900">
                            {item.experienceFound ?? "Not clear"}
                          </div>
                        </div>
                        <div>
                          Experience used
                          <div className="mt-1 font-bold text-slate-900">
                            {item.experienceUsed ?? item.experienceFound ?? "Not clear"}
                          </div>
                        </div>
                        <div>
                          Manual override
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={80}
                              step={0.5}
                              value={readDraftValue(item)}
                              onChange={(event) => {
                                const value = event.target.value;
                                setExperienceDrafts((current) => ({
                                  ...(current || {}),
                                  [item.fileName]: value,
                                }));
                                setExperienceError((current) => ({
                                  ...(current || {}),
                                  [item.fileName]: "",
                                }));
                              }}
                              placeholder="Years"
                              className="subtle-field w-24 px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => saveExperienceOverride(item)}
                              disabled={Boolean(experienceSaving[item.fileName])}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => clearExperienceOverride(item)}
                              disabled={Boolean(experienceSaving[item.fileName])}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Clear
                            </button>
                          </div>
                          {experienceNotice[item.fileName] ? (
                            <div className="mt-1 text-xs text-emerald-700">
                              {experienceNotice[item.fileName]}
                            </div>
                          ) : null}
                          {experienceError[item.fileName] ? (
                            <div className="mt-1 text-xs text-rose-700">
                              {experienceError[item.fileName]}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-3">
                      <SectionBlock
                        title="Matched evidence"
                        hint="Keywords the resume surfaces clearly"
                      >
                        <div className="flex flex-wrap gap-2">
                          {item.matchedRequirements.length ? (
                            item.matchedRequirements.map((requirement) => (
                              <Chip
                                key={`${item.fileName}-match-${requirement}`}
                                tone="emerald"
                              >
                                {requirement}
                              </Chip>
                            ))
                          ) : (
                            <span className="text-sm text-slate-400">
                              No strong overlap detected.
                            </span>
                          )}
                        </div>
                      </SectionBlock>

                      <SectionBlock
                        title="Missing or weak"
                        hint="What the recruiter may not see quickly enough"
                      >
                        <div className="flex flex-wrap gap-2">
                          {item.missingRequirements.length ? (
                            item.missingRequirements.map((requirement) => (
                              <Chip
                                key={`${item.fileName}-gap-${requirement}`}
                                tone="rose"
                              >
                                {requirement}
                              </Chip>
                            ))
                          ) : (
                            <span className="text-sm text-slate-400">
                              No major extracted gaps for this role.
                            </span>
                          )}
                        </div>
                      </SectionBlock>

                      <SectionBlock
                        title="Resume improvements"
                        hint="Suggested edits to increase match quality"
                      >
                        {item.improvementSuggestions.length ? (
                          <ul className="space-y-2 text-sm leading-6 text-slate-700">
                            {item.improvementSuggestions.map((suggestion) => (
                              <li key={`${item.fileName}-improve-${suggestion}`}>
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-sm text-slate-400">
                            No specific improvement suggestions yet.
                          </span>
                        )}
                      </SectionBlock>
                    </div>
                  </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
