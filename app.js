/*
 * GitHub Read/Write Test
 *
 * Responsibility:
 *   Demonstrate reading and writing a JSON file in a GitHub repository
 *   directly from a browser using the GitHub REST Contents API.
 *
 * IMPORTANT:
 *   This version is intentionally a proof-of-concept. The GitHub token is
 *   entered by the user and held only in browser memory. Do NOT hard-code
 *   a token in this file or publish one in the repository.
 */

const GITHUB_API = "https://api.github.com";

const ownerInput = document.getElementById("owner");
const repoInput = document.getElementById("repo");
const filePathInput = document.getElementById("filePath");
const branchInput = document.getElementById("branch");
const tokenInput = document.getElementById("token");
const jsonData = document.getElementById("jsonData");
const status = document.getElementById("status");

let currentFileSha = null;

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

function getSettings() {
  return {
    owner: ownerInput.value.trim(),
    repo: repoInput.value.trim(),
    filePath: filePathInput.value.trim(),
    branch: branchInput.value.trim(),
    token: tokenInput.value.trim()
  };
}

function apiHeaders(token) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

async function readFromGitHub() {
  const { owner, repo, filePath, branch, token } = getSettings();

  if (!owner || !repo || !filePath) {
    setStatus("Owner, repository, and file path are required.", "error");
    return;
  }

  setStatus("Reading from GitHub...");

  try {
    const url =
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
      `/contents/${filePath.split("/").map(encodeURIComponent).join("/")}` +
      `?ref=${encodeURIComponent(branch)}`;

    const response = await fetch(url, {
      headers: apiHeaders(token)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `GitHub returned HTTP ${response.status}`);
    }

    if (result.type !== "file") {
      throw new Error("The requested GitHub path is not a file.");
    }

    currentFileSha = result.sha;

    const decoded = decodeBase64Utf8(result.content);
    const parsed = JSON.parse(decoded);

    jsonData.value = JSON.stringify(parsed, null, 2);

    setStatus(
      `Read successful.
` +
      `File: ${filePath}
` +
      `SHA: ${currentFileSha}`,
      "success"
    );
  } catch (error) {
    setStatus(`Read failed: ${error.message}`, "error");
  }
}

async function writeToGitHub() {
  const { owner, repo, filePath, branch, token } = getSettings();

  if (!token) {
    setStatus("A GitHub token is required for writing.", "error");
    return;
  }

  if (!owner || !repo || !filePath) {
    setStatus("Owner, repository, and file path are required.", "error");
    return;
  }

  let parsed;

  try {
    parsed = JSON.parse(jsonData.value);
  } catch (error) {
    setStatus(`The JSON is invalid: ${error.message}`, "error");
    return;
  }

  if (!currentFileSha) {
    setStatus("Read the file first so the application has the current file SHA.", "error");
    return;
  }

  setStatus("Writing to GitHub...");

  try {
    const url =
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
      `/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`;

    const content = JSON.stringify(parsed, null, 2) + "\n";

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...apiHeaders(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Update ${filePath} from read/write test`,
        content: encodeBase64Utf8(content),
        sha: currentFileSha,
        branch
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `GitHub returned HTTP ${response.status}`);
    }

    currentFileSha = result.content?.sha || null;

    setStatus(
      `Write successful!
` +
      `Commit: ${result.commit?.html_url || "(commit created)"}
` +
      `New SHA: ${currentFileSha}`,
      "success"
    );
  } catch (error) {
    setStatus(`Write failed: ${error.message}`, "error");
  }
}

function incrementCounter() {
  try {
    const data = JSON.parse(jsonData.value);
    data.counter = Number(data.counter || 0) + 1;
    data.lastUpdated = new Date().toISOString();
    jsonData.value = JSON.stringify(data, null, 2);
    setStatus("Counter incremented locally. Click Write to GitHub to commit it.");
  } catch (error) {
    setStatus(`Cannot increment: ${error.message}`, "error");
  }
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

document.getElementById("readButton").addEventListener("click", readFromGitHub);
document.getElementById("writeButton").addEventListener("click", writeToGitHub);
document.getElementById("incrementButton").addEventListener("click", incrementCounter);

// Automatically perform the public read when the page opens.
readFromGitHub();
