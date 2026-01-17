import React, { useMemo, useState } from "react";
import axios from "axios";

function toApiSkill(label) {
  const v = (label || "").trim().toLowerCase();
  if (v === "node.js") return "nodejs";
  if (v === "next.js") return "nextjs";
  if (v === "vpc" || v === "vpcs") return "vpc";
  return v;
}

function Tag({ children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      {children}
    </span>
  );
}

function Spinner() {
  return (
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
  );
}

export default function SearchForm({ onResults, onLoadingChange }) {
  const [skillsInput, setSkillsInput] = useState(
    "VPC, Subnets, Routes, GCP, Vertex AI, Gemini API"
  );
  const [minExperience, setMinExperience] = useState(2);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Derived list of tags for visual feedback
  const tags = useMemo(() => {
    return skillsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [skillsInput]);

  const apiBase = useMemo(() => {
    return import.meta.env.VITE_API_BASE;
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const skills = tags.map(toApiSkill).filter(Boolean);
    if (skills.length === 0) {
      setError("Please enter at least one skill.");
      return;
    }

    const years = Number(minExperience);
    if (!Number.isFinite(years) || years < 0) {
      setError("Minimum experience must be a valid number (0+).");
      return;
    }

    setLoading(true);
    onLoadingChange?.(true);
    try {
      const resp = await axios.post(`${apiBase}/api/resumes/match`, {
        skills,
        minExperience: years,
      });

      const data = resp?.data;
      const results = Array.isArray(data) ? data : data?.results ?? [];
      onResults?.(results);
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Request failed";
      setError(message);
      onResults?.([]);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">
            Search Criteria
          </h2>
          <span className="text-xs text-slate-500">
            Paste skills + experience
          </span>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-800">
          Skills (comma separated)
        </label>
        <textarea
          value={skillsInput}
          onChange={(e) => setSkillsInput(e.target.value)}
          placeholder="e.g. VPCs, Subnets, Routes, GCP, Vertex AI, Gemini API"
          className="h-32 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none shadow-inner focus:border-slate-400 transition-all resize-none"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag, idx) => (
            <Tag key={idx}>{tag}</Tag>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-800">
          Minimum experience (years)
        </label>
        <input
          type="number"
          min={0}
          step={1}
          value={minExperience}
          onChange={(e) => setMinExperience(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className={
          "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm " +
          (loading
            ? "bg-slate-400"
            : "bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400")
        }
      >
        {loading ? <Spinner /> : null}
        {loading ? "Finding…" : "Find Matching Resumes"}
      </button>

      <div className="text-xs text-slate-500">
        Sends:{" "}
        <span className="font-mono">
          {"{ skills: [...], minExperience: n }"}
        </span>
      </div>
    </form>
  );
}
