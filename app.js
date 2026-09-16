/*
 * City Survey Demo — responsibility: load survey data, render the charts/map,
 * geocode submitted cities through the Cloudflare Worker, and save the updated
 * JSON and GeoJSON datasets through that same Worker.
 */

const JSON_URL = "data/testData.json";
const GEOJSON_URL = "data/testData.geojson";

// Deploy the included worker as a separate Cloudflare Worker named
// city-survey-demo-api, then change this URL if Cloudflare gives it a
// different workers.dev address.
const WRITE_API_URL = "https://city-survey-demo-api.cjseeger.workers.dev";

let data = { respondents: [] };
let geo = { type: "FeatureCollection", features: [] };
let genderChart;
let scatterChart;
let map;
let layer;

window.addEventListener("DOMContentLoaded", init);

async function init() {
  map = L.map("map").setView([39.5, -98.35], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  try {
    await load();
    render();
    document.querySelector("#status").textContent = "Data loaded";
  } catch (error) {
    document.querySelector("#status").textContent = "Load error";
    console.error(error);
  }

  document.querySelector("#form").addEventListener("submit", submitSurvey);
}

async function load() {
  const [jsonResponse, geojsonResponse] = await Promise.all([
    fetch(JSON_URL, { cache: "no-store" }),
    fetch(GEOJSON_URL, { cache: "no-store" })
  ]);

  if (!jsonResponse.ok || !geojsonResponse.ok) {
    throw new Error("Could not load the survey data files.");
  }

  data = await jsonResponse.json();
  geo = await geojsonResponse.json();
}

function render() {
  renderGender();
  renderScatter();
  renderMap();
  document.querySelector("#count").textContent =
    `${data.respondents.length} respondent${data.respondents.length === 1 ? "" : "s"}`;
}

function renderGender() {
  const male = data.respondents.filter(d => d.gender === "M").length;
  const female = data.respondents.filter(d => d.gender === "F").length;
  const total = data.respondents.length || 1;

  if (genderChart) genderChart.destroy();

  genderChart = new Chart(document.querySelector("#genderChart"), {
    type: "bar",
    data: {
      labels: ["Male", "Female"],
      datasets: [{
        data: [male / total * 100, female / total * 100],
        backgroundColor: ["#4778b8", "#d58b43"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => `${context.raw.toFixed(1)}%`
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { callback: value => `${value}%` },
          title: { display: true, text: "Percent" }
        }
      }
    }
  });
}

function renderScatter() {
  const points = data.respondents.map(respondent => ({
    x: Number(respondent.favoriteNumber100),
    y: Number(respondent.favoriteNumber10),
    c: cssColor(respondent.favoriteColor) ? respondent.favoriteColor : "#667085",
    respondent
  }));

  if (scatterChart) scatterChart.destroy();

  scatterChart = new Chart(document.querySelector("#scatterChart"), {
    type: "scatter",
    data: {
      datasets: [{
        data: points,
        pointRadius: 7,
        pointHoverRadius: 10,
        pointBackgroundColor: context => context.raw?.c || "#667085",
        pointBorderColor: "#344054"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: context => {
              const respondent = context.raw.respondent;
              return `${respondent.favoriteColor}: (${context.raw.x}, ${context.raw.y})`;
            }
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          title: { display: true, text: "Favorite number (0–100)" }
        },
        y: {
          min: 0,
          max: 10,
          title: { display: true, text: "Favorite number (0–10)" }
        }
      }
    }
  });
}

function renderMap() {
  if (layer) map.removeLayer(layer);

  layer = L.geoJSON(geo, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: 7,
      fillColor: cssColor(feature.properties?.favoriteColor)
        ? feature.properties.favoriteColor
        : "#2457a6",
      color: "#344054",
      weight: 1,
      fillOpacity: 0.85
    }),
    onEachFeature: (feature, leafletLayer) => {
      const p = feature.properties || {};
      leafletLayer.bindPopup(
        `<b>${esc(p.city)}, ${esc(p.state)}</b>` +
        `<br>Gender: ${esc(p.gender)}` +
        `<br>Color: ${esc(p.favoriteColor)}` +
        `<br>Numbers: ${esc(p.favoriteNumber10)}, ${esc(p.favoriteNumber100)}`
      );
    }
  }).addTo(map);

  if (layer.getBounds().isValid()) {
    map.fitBounds(layer.getBounds().pad(0.15));
  }
}

async function submitSurvey(event) {
  event.preventDefault();

  const button = document.querySelector("#submit");
  button.disabled = true;

  try {
    const respondent = {
      id: `r-${Date.now()}`,
      gender: document.querySelector("#gender").value,
      favoriteNumber10: Number(document.querySelector("#n10").value),
      favoriteNumber100: Number(document.querySelector("#n100").value),
      favoriteColor: document.querySelector("#color").value.trim(),
      city: document.querySelector("#city").value.trim(),
      state: document.querySelector("#state").value.trim().toUpperCase(),
      submittedAt: new Date().toISOString()
    };

    msg("Geocoding city…");

    const location = await geocode(respondent.city, respondent.state);

    if (!location) {
      throw new Error("City/state not found. Please check the city and state and try again.");
    }

    respondent.latitude = location.lat;
    respondent.longitude = location.lon;
    respondent.displayName = location.name;

    msg("Writing response to GitHub…");
    await saveToGitHub(respondent);

    // Update the local display only after GitHub confirms both writes.
    data.respondents.push(respondent);
    geo.features.push({
      type: "Feature",
      properties: { ...respondent },
      geometry: {
        type: "Point",
        coordinates: [respondent.longitude, respondent.latitude]
      }
    });

    render();
    event.target.reset();
    document.querySelector("#status").textContent = "Saved to GitHub";
    msg(`Saved ${respondent.city}, ${respondent.state}.`);
  } catch (error) {
    console.error(error);
    msg(error.message || "The response could not be saved.", true);
  } finally {
    button.disabled = false;
  }
}

async function geocode(cityName, stateName) {
  const params = new URLSearchParams({
    city: cityName,
    state: stateName
  });

  const response = await fetch(`${WRITE_API_URL}/geocode?${params}`);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Geocoding failed: ${message}`);
  }

  return response.json();
}

async function saveToGitHub(respondent) {
  if (!WRITE_API_URL) {
    throw new Error("Write service is not configured.");
  }

  const response = await fetch(`${WRITE_API_URL}/write`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ respondent })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Save failed: ${message}`);
  }

  return response.json();
}

function cssColor(value) {
  const style = new Option().style;
  style.color = value;
  return style.color !== "";
}

function msg(text, bad = false) {
  const element = document.querySelector("#formStatus");
  element.textContent = text;
  element.style.color = bad ? "#b42318" : "#475467";
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
