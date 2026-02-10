import React, { useState } from "react";
import SearchForm from "./components/SearchForm.jsx";
import ResultsTable from "./components/ResultsTable.jsx";
import ScrollToTopButton from "./components/ScrollToTopButton.jsx";

export default function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Resume Matcher</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pick skills + minimum experience to find matching resumes.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SearchForm onResults={setResults} onLoadingChange={setLoading} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <ResultsTable results={results} loading={loading} />
          </div>
        </div>

        <div className="mt-8 text-xs text-slate-500">
          Backend endpoint:{" "}
          <span className="font-mono">POST /api/resumes/match</span>
        </div>
      </div>

      <ScrollToTopButton />
    </div>
  );
}
