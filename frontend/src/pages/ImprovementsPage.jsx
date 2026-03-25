import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

function formatDate(value) {
  if (!value) return "No saved date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No saved date";
  return date.toLocaleString();
}

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

function OverviewItem({ item, selected, onSelect }) {
  const latest = item?.latestImprovement;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.fileName)}
      className={
        "w-full rounded-[1.25rem] border px-4 py-4 text-left transition " +
        (selected
          ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_44px_-28px_rgba(15,23,42,0.55)]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {item.fileName}
          </div>
          <div
            className={`mt-2 text-xs ${selected ? "text-slate-200" : "text-slate-500"}`}
          >
            {item.improvementCount || 0} saved note
            {item.improvementCount === 1 ? "" : "s"}
          </div>
        </div>

        {latest?.bucket ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
              selected
                ? "bg-white/15 text-white"
                : latest.bucket === "high"
                  ? "bg-emerald-100 text-emerald-800"
                  : latest.bucket === "medium"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-rose-100 text-rose-800"
            }`}
          >
            {latest.bucket}
          </span>
        ) : null}
      </div>

      <div
        className={`mt-3 text-sm leading-6 ${
          selected ? "text-slate-100" : "text-slate-600"
        }`}
      >
        {latest?.matchingSummary || "No saved improvement note yet. Run ranking first."}
      </div>
    </button>
  );
}

function DetailCard({ title, meta, children, actions }) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {meta}
          </div>
          <h3 className="mt-1 text-lg font-bold text-slate-900">{title}</h3>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ImprovementsPage({ apiBase, selectedFileName }) {
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

  async function loadOverview() {
    setItemsLoading(true);
    setItemsError("");
    try {
      const resp = await axios.get(`${apiBase}/api/resumes/improvements`);
      setItems(Array.isArray(resp?.data?.items) ? resp.data.items : []);
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load saved improvements";
      setItemsError(message);
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const effectiveFileName = useMemo(() => {
    if (selectedFileName) return selectedFileName;
    return items.find((item) => item.improvementCount > 0)?.fileName || "";
  }, [items, selectedFileName]);

  useEffect(() => {
    if (!effectiveFileName) {
      setDetail(null);
      return;
    }

    let ignore = false;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailError("");
      try {
        const resp = await axios.get(
          `${apiBase}/api/resumes/${encodeURIComponent(String(effectiveFileName))}/improvements`,
        );
        if (!ignore) setDetail(resp?.data || null);
      } catch (err) {
        const message =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load resume improvements";
        if (!ignore) {
          setDetail(null);
          setDetailError(message);
        }
      } finally {
        if (!ignore) setDetailLoading(false);
      }
    }

    loadDetail();
    return () => {
      ignore = true;
    };
  }, [apiBase, effectiveFileName]);

  function goToResume(fileName) {
    globalThis.location.hash = `#/improvements/${encodeURIComponent(fileName)}`;
  }

  async function copyNote(key, message) {
    const ok = await copyToClipboard(message);
    if (!ok) return;

    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((current) => (current === key ? "" : current));
    }, 1400);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Saved notes
          </div>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            Resume improvement library
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Open any resume to review its saved improvement notes later, copy a
            message, and keep a small history of how it matched different job
            descriptions.
          </p>
        </div>

        <button
          type="button"
          onClick={loadOverview}
          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Refresh saved notes
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Resume list
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {items.length} resume{items.length === 1 ? "" : "s"} tracked
            </div>
          </div>

          {itemsError ? (
            <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {itemsError}
            </div>
          ) : null}

          {itemsLoading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-[1.25rem] bg-slate-100" />
              <div className="h-24 animate-pulse rounded-[1.25rem] bg-slate-100" />
              <div className="h-24 animate-pulse rounded-[1.25rem] bg-slate-100" />
            </div>
          ) : items.length ? (
            <div className="space-y-3">
              {items.map((item) => (
                <OverviewItem
                  key={item.fileName}
                  item={item}
                  selected={item.fileName === effectiveFileName}
                  onSelect={goToResume}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
              No saved improvement notes yet. Run a resume ranking first so the
              app can store improvement feedback for each resume.
            </div>
          )}
        </aside>

        <div className="space-y-4">
          {detailError ? (
            <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {detailError}
            </div>
          ) : null}

          {detailLoading ? (
            <>
              <div className="h-40 animate-pulse rounded-[1.5rem] bg-slate-100" />
              <div className="h-52 animate-pulse rounded-[1.5rem] bg-slate-100" />
            </>
          ) : detail?.fileName ? (
            <>
              <DetailCard
                meta="Resume"
                title={detail.fileName}
                actions={
                  <a
                    href="#/"
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Back to matcher
                  </a>
                }
              >
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Latest saved
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {formatDate(detail.latestImprovement?.updatedAt)}
                    </div>
                  </div>
                  <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Current bucket
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {detail.latestImprovement?.bucket || "No saved data"}
                    </div>
                  </div>
                  <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      History size
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      {Array.isArray(detail.history) ? detail.history.length : 0}
                    </div>
                  </div>
                </div>
              </DetailCard>

              {detail.latestImprovement ? (
                <DetailCard
                  meta="Latest note"
                  title={detail.latestImprovement.jobLabel || "Saved resume feedback"}
                  actions={
                    <button
                      type="button"
                      onClick={() =>
                        copyNote(
                          `${detail.fileName}-latest`,
                          detail.latestImprovement.improvementMessage,
                        )
                      }
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      {copiedKey === `${detail.fileName}-latest`
                        ? "Copied"
                        : "Copy latest note"}
                    </button>
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                      {Math.round(Number(detail.latestImprovement.match) || 0)}% match
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                      {detail.latestImprovement.bucket || "low"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {detail.latestImprovement.requiredExperience || 0}+ years requested
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {detail.latestImprovement.matchingSummary}
                  </p>

                  <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Copy-ready note
                    </div>
                    <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {detail.latestImprovement.improvementMessage}
                    </pre>
                  </div>
                </DetailCard>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
                  This resume does not have a saved improvement note yet. Run a
                  new ranking and the note will appear here.
                </div>
              )}

              <DetailCard
                meta="History"
                title="Saved improvement history"
              >
                {Array.isArray(detail.history) && detail.history.length ? (
                  <div className="space-y-3">
                    {detail.history.map((entry, index) => (
                      <div
                        key={entry.id || `${entry.jobHash}-${index}`}
                        className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {entry.jobLabel || "Saved job description"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Saved on {formatDate(entry.updatedAt)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              copyNote(
                                `${detail.fileName}-${entry.id || index}`,
                                entry.improvementMessage,
                              )
                            }
                            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            {copiedKey === `${detail.fileName}-${entry.id || index}`
                              ? "Copied"
                              : "Copy note"}
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                            {Math.round(Number(entry.match) || 0)}% match
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                            {entry.bucket || "low"}
                          </span>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {entry.matchingSummary}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    No saved history for this resume yet.
                  </div>
                )}
              </DetailCard>
            </>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-sm text-slate-500">
              Select a resume from the left to view its saved improvement notes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
