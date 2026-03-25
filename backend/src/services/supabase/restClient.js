function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const apiKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "",
  ).trim();
  const schema = String(process.env.SUPABASE_DB_SCHEMA || "public").trim() || "public";

  return {
    url: url.replace(/\/+$/g, ""),
    apiKey,
    schema,
    enabled: Boolean(url && apiKey),
  };
}

function buildRestUrl(baseUrl, resource, query = {}) {
  const url = new URL(`${baseUrl}/rest/v1/${resource}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function requestSupabase(resource, options = {}) {
  const config = getSupabaseConfig();
  if (!config.enabled) {
    return { ok: false, skipped: true, reason: "missing-supabase-env" };
  }

  const {
    method = "GET",
    query,
    body,
    headers = {},
  } = options;

  const response = await fetch(buildRestUrl(config.url, resource, query), {
    method,
    headers: {
      apikey: config.apiKey,
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
      "Accept-Profile": config.schema,
      "Content-Profile": config.schema,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed with ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  return { ok: true, data };
}

module.exports = {
  getSupabaseConfig,
  requestSupabase,
};
