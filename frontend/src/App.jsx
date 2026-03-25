import React, { useEffect, useMemo, useState } from "react";
import SearchForm from "./components/SearchForm.jsx";
import ResultsTable from "./components/ResultsTable.jsx";
import ScrollToTopButton from "./components/ScrollToTopButton.jsx";
import ImprovementsPage from "./pages/ImprovementsPage.jsx";

function parseHashRoute(hashValue) {
  const hash = String(hashValue || "").trim();
  const cleaned = hash.replace(/^#/, "") || "/";
  const parts = cleaned.split("/").filter(Boolean);

  if (parts[0] === "improvements") {
    return {
      page: "improvements",
      fileName: parts[1] ? decodeURIComponent(parts.slice(1).join("/")) : "",
    };
  }

  return { page: "matcher", fileName: "" };
}

export default function App() {
  const [matchData, setMatchData] = useState({
    results: [],
    buckets: { high: 0, medium: 0, low: 0 },
    jobProfile: null,
    matcher: null,
    persistence: null,
  });
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState(() =>
    parseHashRoute(globalThis?.location?.hash || ""),
  );

  const apiBase = useMemo(() => {
    return import.meta.env.VITE_API_BASE || "http://localhost:8000";
  }, []);

  useEffect(() => {
    function onHashChange() {
      setRoute(parseHashRoute(globalThis?.location?.hash || ""));
    }

    globalThis.addEventListener?.("hashchange", onHashChange);
    return () => globalThis.removeEventListener?.("hashchange", onHashChange);
  }, []);

  const isImprovementsPage = route.page === "improvements";

  return (
    <div className="min-h-screen">
      <a
        href={isImprovementsPage ? "#/improvements" : "#results-panel"}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900"
      >
        {isImprovementsPage ? "Skip to improvement details" : "Skip to results"}
      </a>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <section className="hero-surface relative px-5 py-6 sm:px-8 sm:py-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-600 via-slate-900 to-slate-400" />

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="soft-badge">Minimal Resume Review</span>
              <h1 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">
                {isImprovementsPage
                  ? "Keep resume improvement notes in one place."
                  : "Rank resumes from a job description without drowning in tabs."}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                {isImprovementsPage
                  ? "Use the saved improvement library to reopen resume-specific notes later, copy feedback quickly, and keep a small history for future follow-up."
                  : "Paste the role, upload resumes, and get a clean shortlist with high, medium, and low matches plus practical improvement notes for each candidate."}
              </p>
            </div>

            <nav
              aria-label="Primary"
              className="flex flex-wrap items-center gap-2"
            >
              <a
                href="#/"
                className={
                  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition " +
                  (!isImprovementsPage
                    ? "bg-slate-900 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50")
                }
              >
                Matcher
              </a>
              <a
                href="#/improvements"
                className={
                  "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition " +
                  (isImprovementsPage
                    ? "bg-slate-900 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50")
                }
              >
                Improvement library
              </a>
            </nav>
          </div>
        </section>

        {isImprovementsPage ? (
          <section
            id="results-panel"
            aria-label="Saved resume improvement notes"
            className="mt-6 panel-surface p-5 sm:p-6"
          >
            <ImprovementsPage
              apiBase={apiBase}
              selectedFileName={route.fileName}
            />
          </section>
        ) : (
          <>
            <div className="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
              <aside className="xl:sticky xl:top-6 xl:self-start">
                <div className="panel-surface p-5 sm:p-6">
                  <SearchForm
                    apiBase={apiBase}
                    onMatchData={setMatchData}
                    onLoadingChange={setLoading}
                  />
                </div>
              </aside>

              <section
                id="results-panel"
                aria-label="Resume ranking results"
                className="panel-surface p-5 sm:p-6"
              >
                <ResultsTable
                  apiBase={apiBase}
                  results={matchData.results}
                  buckets={matchData.buckets}
                  jobProfile={matchData.jobProfile}
                  matcher={matchData.matcher}
                  persistence={matchData.persistence}
                  loading={loading}
                />
              </section>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200/70 bg-white/75 px-4 py-3 text-xs text-slate-500">
              API contract:{" "}
              <span className="font-mono text-slate-700">
                POST /api/resumes/match {`{ jobDescription, requiredExperience }`}
              </span>
            </div>
          </>
        )}
      </main>

      <ScrollToTopButton />
    </div>
  );
}
