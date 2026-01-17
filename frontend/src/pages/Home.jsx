import React, { useMemo, useState } from "react";
import SearchForm from "../components/SearchForm";
import ResultsTable from "../components/ResultsTable";

export default function Home() {
  const [jobDescription, setJobDescription] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const apiBase = useMemo(() => {
    return import.meta.env.VITE_API_BASE || "http://localhost:5000";
  }, []);

  async function onMatch() {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`${apiBase}/api/resumes/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Match failed");
      setResults(data.results || []);
    } catch (e) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>Resume Matcher</h1>
      <SearchForm
        jobDescription={jobDescription}
        setJobDescription={setJobDescription}
        onMatch={onMatch}
        loading={loading}
      />
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <ResultsTable results={results} />
    </div>
  );
}
