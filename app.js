/*
 * GitHub Read/Write Test
 *
 * Responsibility:
 *   Provide the browser interface for reading and writing JSON data
 *   through the Cloudflare Worker.
 *
 * Architecture:
 *
 *   Browser
 *      |
 *      | GET /read
 *      | PUT /write
 *      v
 *   Cloudflare Worker
 *      |
 *      | authenticated GitHub API request
 *      v
 *   GitHub Repository
 *
 * IMPORTANT:
 *   This application never receives or stores the GitHub Personal
 *   Access Token. The token is stored securely as a Cloudflare
 *   Worker Secret.
 */


// ------------------------------------------------------------
// Configuration
// ------------------------------------------------------------

// URL of the Cloudflare Worker.
//
// The browser communicates with this URL instead of communicating
// directly with the GitHub API.
const WORKER_URL =
  "https://read-write-test-api.cjseeger.workers.dev";


// ------------------------------------------------------------
// Page elements
// ------------------------------------------------------------

const jsonData =
  document.getElementById("jsonData");

const status =
  document.getElementById("status");


// ------------------------------------------------------------
// State
// ------------------------------------------------------------

// GitHub requires the current file SHA when updating an existing
// file.
//
// The Cloudflare Worker returns this SHA when we read the file.
let currentFileSha = null;


// ------------------------------------------------------------
// Status display
// ------------------------------------------------------------

function setStatus(message, type = "") {

  status.textContent = message;

  status.className =
    `status ${type}`.trim();
}


// ------------------------------------------------------------
// Read data through Cloudflare Worker
// ------------------------------------------------------------

async function readFromGitHub() {

  setStatus(
    "Reading data through Cloudflare Worker..."
  );

  try {

    const response =
      await fetch(`${WORKER_URL}/read`, {
        method: "GET"
      });


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(
        result.error ||
        `Worker returned HTTP ${response.status}`
      );
    }


    // Save the GitHub SHA returned by the Worker.
    //
    // We need this later when we write the updated file.
    currentFileSha =
      result.sha;


    // Display the JSON data.
    jsonData.value =
      JSON.stringify(
        result.data,
        null,
        2
      );


    setStatus(
      `Read successful through Cloudflare Worker.\n` +
      `SHA: ${currentFileSha}`,
      "success"
    );

  } catch (error) {

    setStatus(
      `Read failed: ${error.message}`,
      "error"
    );
  }
}


// ------------------------------------------------------------
// Write data through Cloudflare Worker
// ------------------------------------------------------------

async function writeToGitHub() {

  // Make sure we have a SHA from a previous read.
  if (!currentFileSha) {

    setStatus(
      "Read the data first so the application has the current file SHA.",
      "error"
    );

    return;
  }


  // Convert the text area contents back into a JavaScript object.
  let data;

  try {

    data =
      JSON.parse(jsonData.value);

  } catch (error) {

    setStatus(
      `The JSON is invalid: ${error.message}`,
      "error"
    );

    return;
  }


  setStatus(
    "Writing data through Cloudflare Worker..."
  );


  try {

    const response =
      await fetch(`${WORKER_URL}/write`, {

        method: "PUT",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          // Data that should be written to GitHub.
          data: data,

          // SHA of the version we originally read.
          sha: currentFileSha
        })
      });


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(
        result.error ||
        `Worker returned HTTP ${response.status}`
      );
    }


    // GitHub returns a new SHA after the commit.
    //
    // Save it so another write can happen without
    // requiring another read first.
    currentFileSha =
      result.sha;


    setStatus(
      `Write successful through Cloudflare Worker!\n` +
      `Commit: ${result.commitUrl || "(commit created)"}\n` +
      `New SHA: ${currentFileSha}`,
      "success"
    );

  } catch (error) {

    setStatus(
      `Write failed: ${error.message}`,
      "error"
    );
  }
}


// ------------------------------------------------------------
// Increment counter
// ------------------------------------------------------------

function incrementCounter() {

  try {

    const data =
      JSON.parse(jsonData.value);


    data.counter =
      Number(data.counter || 0) + 1;


    data.lastUpdated =
      new Date().toISOString();


    jsonData.value =
      JSON.stringify(
        data,
        null,
        2
      );


    setStatus(
      "Counter incremented locally.\n" +
      "Click Write to GitHub to commit the change."
    );

  } catch (error) {

    setStatus(
      `Cannot increment counter: ${error.message}`,
      "error"
    );
  }
}


// ------------------------------------------------------------
// Button events
// ------------------------------------------------------------

document
  .getElementById("readButton")
  .addEventListener(
    "click",
    readFromGitHub
  );


document
  .getElementById("writeButton")
  .addEventListener(
    "click",
    writeToGitHub
  );


document
  .getElementById("incrementButton")
  .addEventListener(
    "click",
    incrementCounter
  );


// ------------------------------------------------------------
// Initial read
// ------------------------------------------------------------

// Automatically read the data when the page loads.
readFromGitHub();