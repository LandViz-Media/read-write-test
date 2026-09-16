/*
 * City Survey Demo Worker — responsibility: geocode submitted U.S. cities
 * and securely append survey responses to the GitHub JSON and GeoJSON files.
 */

const OWNER = "LandViz-Media";
const REPO = "city-survey-demo";
const BRANCH = "main";
const JSON_PATH = "data/testData.json";
const GEO_PATH = "data/testData.geojson";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/geocode" && request.method === "GET") {
        return await geocode(url, env);
      }

      if (url.pathname === "/write" && request.method === "PUT") {
        return await writeSurvey(request, env);
      }

      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true, service: "city-survey-demo-api" }, 200);
      }

      return json({
        error: "Not found",
        endpoints: ["/health", "/geocode?city=Denver&state=CO", "/write"]
      }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: error.message || "Server error" }, 500);
    }
  }
};

async function geocode(url, env) {
  const city = url.searchParams.get("city")?.trim();
  const state = url.searchParams.get("state")?.trim();

  if (!city || !state) {
    return json({ error: "Both city and state are required." }, 400);
  }

  const params = new URLSearchParams({
    city,
    state,
    country: "United States",
    format: "jsonv2",
    limit: "1"
  });

  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "LandViz-Media-city-survey-demo/1.0 (demo application)"
    }
  });

  if (!response.ok) {
    return json({ error: "The geocoding service is unavailable." }, 502);
  }

  const results = await response.json();

  if (!results.length) {
    return json(null, 200);
  }

  return json({
    lat: Number(results[0].lat),
    lon: Number(results[0].lon),
    name: results[0].display_name
  }, 200);
}

async function writeSurvey(request, env) {
  const body = await request.json();
  const respondent = validateRespondent(body.respondent);

  // Read the current versions immediately before writing so the GitHub SHA
  // used by each update represents the latest version of that file.
  const jsonFile = await getGitHubFile(env, JSON_PATH);
  const geoFile = await getGitHubFile(env, GEO_PATH);

  const surveyData = JSON.parse(decodeBase64(jsonFile.content));
  const geojsonData = JSON.parse(decodeBase64(geoFile.content));

  surveyData.respondents ??= [];
  geojsonData.features ??= [];

  // Guard against accidental duplicate submission if the same response ID
  // is retried by the browser.
  if (surveyData.respondents.some(item => item.id === respondent.id)) {
    return json({
      success: true,
      duplicate: true,
      message: "This response was already saved."
    }, 200);
  }

  surveyData.respondents.push(respondent);

  geojsonData.features.push({
    type: "Feature",
    properties: { ...respondent },
    geometry: {
      type: "Point",
      coordinates: [respondent.longitude, respondent.latitude]
    }
  });

  // Write JSON first, then GeoJSON. If the second write fails, attempt to
  // restore JSON so the two datasets remain synchronized.
  const jsonResult = await putGitHubFile(
    env,
    JSON_PATH,
    surveyData,
    jsonFile.sha,
    "Add survey response to JSON"
  );

  try {
    const geoResult = await putGitHubFile(
      env,
      GEO_PATH,
      geojsonData,
      geoFile.sha,
      "Add survey response to GeoJSON"
    );

    return json({
      success: true,
      respondent,
      jsonCommit: jsonResult.commit?.html_url,
      geojsonCommit: geoResult.commit?.html_url
    }, 200);
  } catch (error) {
    // Best-effort rollback of the JSON file if the GeoJSON write failed.
    try {
      await putGitHubFile(
        env,
        JSON_PATH,
        JSON.parse(decodeBase64(jsonFile.content)),
        jsonResult.content?.sha,
        "Rollback incomplete survey response"
      );
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError);
    }

    throw error;
  }
}

function validateRespondent(value) {
  if (!value || typeof value !== "object") {
    throw new Error("A respondent object is required.");
  }

  if (!value.id || !["M", "F"].includes(value.gender)) {
    throw new Error("Invalid respondent data.");
  }

  const n10 = Number(value.favoriteNumber10);
  const n100 = Number(value.favoriteNumber100);
  const lat = Number(value.latitude);
  const lon = Number(value.longitude);

  if (!Number.isInteger(n10) || n10 < 0 || n10 > 10) {
    throw new Error("Favorite number 0–10 is invalid.");
  }

  if (!Number.isInteger(n100) || n100 < 0 || n100 > 100) {
    throw new Error("Favorite number 0–100 is invalid.");
  }

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error("Invalid geocoded coordinates.");
  }

  for (const field of ["favoriteColor", "city", "state"]) {
    if (!String(value[field] ?? "").trim()) {
      throw new Error(`Missing ${field}.`);
    }
  }

  return {
    id: String(value.id),
    gender: value.gender,
    favoriteNumber10: n10,
    favoriteNumber100: n100,
    favoriteColor: String(value.favoriteColor).trim(),
    city: String(value.city).trim(),
    state: String(value.state).trim().toUpperCase(),
    latitude: lat,
    longitude: lon,
    displayName: String(value.displayName ?? ""),
    submittedAt: String(value.submittedAt ?? new Date().toISOString())
  };
}

async function getGitHubFile(env, path) {
  const response = await githubFetch(
    env,
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`
  );

  if (!response.ok) {
    throw new Error(`GitHub read failed: ${await response.text()}`);
  }

  return response.json();
}

async function putGitHubFile(env, path, value, sha, message) {
  const content = encodeBase64(JSON.stringify(value, null, 2) + "\n");

  const response = await githubFetch(
    env,
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content,
        sha,
        branch: BRANCH
      })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub write failed: ${await response.text()}`);
  }

  return response.json();
}

async function githubFetch(env, url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "User-Agent": "LandViz-Media-city-survey-demo",
      ...(options.headers || {})
    }
  });
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function json(value, status) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}
