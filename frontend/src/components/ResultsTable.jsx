import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

async function copyToClipboard(text) {
  const value = String(text ?? "");
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
  const v = Number(value);
  const score = Number.isFinite(v) ? v : 0;

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

function Chip({ children, tone = "slate" }) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        map[tone] || map.slate
      }`}
    >
      {children}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
      <div className="h-9 w-full animate-pulse rounded bg-slate-100" />
      <div className="h-40 w-full animate-pulse rounded bg-slate-100" />
    </div>
  );
}

export default function ResultsTable({
  apiBase: apiBaseProp,
  results,
  loading,
}) {
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [copiedKey, setCopiedKey] = useState(null);
  const copyTimerRef = useRef(null);

  const [expEdits, setExpEdits] = useState({});
  const [expSaving, setExpSaving] = useState({});
  const [expError, setExpError] = useState({});
  const [expSaved, setExpSaved] = useState({});

  const normalized = useMemo(() => {
    const list = Array.isArray(results) ? results : [];
    return list.map((r, idx) => ({
      _idx: idx,
      fileName: r.fileName ?? r.filename ?? r.file ?? "unknown",
      match: r.match ?? r.score ?? 0,
      matchedSkills: Array.isArray(r.matchedSkills) ? r.matchedSkills : [],
      missingSkills: Array.isArray(r.missingSkills) ? r.missingSkills : [],
      experienceFound: r.experienceFound ?? r.experience ?? r.years ?? null,
      experienceOverride: r.experienceOverride ?? null,
      experienceUsed: r.experienceUsed ?? null,
    }));
  }, [results]);

  // Initialize editable experience values from incoming results.
  useEffect(() => {
    const next = {};
    for (const r of normalized) {
      if (!r?.fileName) continue;
      const seed =
        r.experienceOverride != null
          ? r.experienceOverride
          : r.experienceFound != null
            ? r.experienceFound
            : "";
      next[r.fileName] = seed;
    }
    setExpEdits(next);
    setExpError({});
    setExpSaved({});
  }, [normalized]);

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? normalized.filter((r) => String(r.fileName).toLowerCase().includes(q))
      : normalized;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const am = Number(a.match) || 0;
      const bm = Number(b.match) || 0;
      if (bm !== am) return dir * (bm - am);
      return a._idx - b._idx;
    });
  }, [normalized, query, sortDir]);

  const apiBase = useMemo(() => {
    return (
      apiBaseProp || import.meta.env.VITE_API_BASE || "http://localhost:8000"
    );
  }, [apiBaseProp]);

  async function saveExperienceOverride(fileName) {
    const raw = expEdits?.[fileName];
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 80) {
      setExpError((m) => ({
        ...m,
        [fileName]: "Enter a number between 0 and 80",
      }));
      return;
    }

    setExpSaving((m) => ({ ...m, [fileName]: true }));
    setExpError((m) => ({ ...m, [fileName]: "" }));
    setExpSaved((m) => ({ ...m, [fileName]: false }));
    try {
      await axios.patch(
        `${apiBase}/api/resumes/${encodeURIComponent(String(fileName))}/experience`,
        { experienceYearsOverride: n },
      );
      setExpSaved((m) => ({ ...m, [fileName]: true }));
      // Note: match % won't update until user reruns match.
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Save failed";
      setExpError((m) => ({ ...m, [fileName]: message }));
    } finally {
      setExpSaving((m) => ({ ...m, [fileName]: false }));
      setTimeout(() => {
        setExpSaved((m) => ({ ...m, [fileName]: false }));
      }, 1500);
    }
  }

  async function clearExperienceOverride(fileName) {
    setExpSaving((m) => ({ ...m, [fileName]: true }));
    setExpError((m) => ({ ...m, [fileName]: "" }));
    setExpSaved((m) => ({ ...m, [fileName]: false }));
    try {
      await axios.patch(
        `${apiBase}/api/resumes/${encodeURIComponent(String(fileName))}/experience`,
        { experienceYearsOverride: null },
      );
      setExpSaved((m) => ({ ...m, [fileName]: true }));
    } catch (err) {
      const message =
        err?.response?.data?.error || err?.message || "Clear failed";
      setExpError((m) => ({ ...m, [fileName]: message }));
    } finally {
      setExpSaving((m) => ({ ...m, [fileName]: false }));
      setTimeout(() => {
        setExpSaved((m) => ({ ...m, [fileName]: false }));
      }, 1500);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Results</h2>
          <p className="mt-1 text-xs text-slate-500">
            Sort by match %, filter by filename.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          {Array.isArray(results) ? results.length : 0} resumes
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by filename…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 sm:w-72"
              />
            </div>

            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              title="Toggle sort direction"
            >
              Sort: Match {sortDir === "desc" ? "↓" : "↑"}
            </button>
          </div>

          {!filteredAndSorted.length ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center">
              <div className="text-sm font-semibold text-slate-800">
                No results
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {query.trim()
                  ? "Try a different filename filter."
                  : "Run a search to see matches."}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                      Rank
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                      File Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                      Match %
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                      Experience Found
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                      Experience Override
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                      Matched Skills
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                      Missing Skills
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredAndSorted.map((r, i) => (
                    <tr
                      key={`${r.fileName}-${r._idx}`}
                      className="hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {r.fileName}
                      </td>
                      <td className="px-4 py-3">
                        <ScorePill value={r.match} />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div className="space-y-1">
                          <div>
                            {r.experienceFound ?? (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>
                          {r.experienceOverride != null ? (
                            <div className="text-xs text-slate-500">
                              Used: {r.experienceUsed ?? r.experienceOverride}{" "}
                              (override)
                            </div>
                          ) : r.experienceUsed != null ? (
                            <div className="text-xs text-slate-500">
                              Used: {r.experienceUsed}
                            </div>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={expEdits?.[r.fileName] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setExpEdits((m) => ({
                                ...(m || {}),
                                [r.fileName]: v,
                              }));
                              setExpError((m) => ({
                                ...(m || {}),
                                [r.fileName]: "",
                              }));
                            }}
                            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-slate-400"
                            placeholder="Years"
                          />

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => saveExperienceOverride(r.fileName)}
                              disabled={!!expSaving?.[r.fileName]}
                              className="inline-flex items-center rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                            >
                              {expSaving?.[r.fileName] ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                clearExperienceOverride(r.fileName)
                              }
                              disabled={!!expSaving?.[r.fileName]}
                              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              title="Remove override and use extracted experience"
                            >
                              Clear
                            </button>

                            {expSaved?.[r.fileName] ? (
                              <span className="text-xs font-semibold text-emerald-700">
                                Saved
                              </span>
                            ) : null}
                          </div>

                          {expError?.[r.fileName] ? (
                            <div className="text-xs text-rose-700">
                              {expError[r.fileName]}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {r.matchedSkills?.length ? (
                            r.matchedSkills.map((s) => (
                              <Chip key={`${r.fileName}-m-${s}`} tone="emerald">
                                {s}
                              </Chip>
                            ))
                          ) : (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.missingSkills?.length ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-600">
                                {r.missingSkills.length} missing
                              </span>
                              <button
                                type="button"
                                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={async () => {
                                  const key = `${r.fileName}-${r._idx}`;
                                  const text = r.missingSkills.join(", ");
                                  const ok = await copyToClipboard(text);
                                  if (ok) {
                                    setCopiedKey(key);
                                    if (copyTimerRef.current) {
                                      clearTimeout(copyTimerRef.current);
                                    }
                                    copyTimerRef.current = setTimeout(
                                      () => setCopiedKey(null),
                                      1200,
                                    );
                                  }
                                }}
                                title="Copy missing skills (comma separated)"
                              >
                                {copiedKey === `${r.fileName}-${r._idx}`
                                  ? "Copied"
                                  : "Copy"}
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {r.missingSkills.map((s) => (
                                <Chip key={`${r.fileName}-x-${s}`} tone="rose">
                                  {s}
                                </Chip>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
