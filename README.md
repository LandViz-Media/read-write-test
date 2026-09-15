# GitHub Read/Write Test

A small HTML/JavaScript proof-of-concept for reading and writing JSON data in a GitHub repository through the GitHub REST API.

## Repository

`LandViz-Media/read-write-test`

## Test application

The GitHub Pages site should be:

https://landviz-media.github.io/read-write-test/

## What it demonstrates

1. A browser application reads a public JSON file from GitHub.
2. The JSON is decoded and displayed in the browser.
3. The user can modify the JSON or increment the counter.
4. The browser sends the updated JSON to GitHub.
5. GitHub creates a commit containing the change.

## Files

```text
/
├── index.html
├── style.css
├── app.js
├── README.md
└── data/
    └── test-data.json
```

## Authentication

Reading a public repository does not require authentication.

Writing to the repository requires a GitHub authentication token with permission to write repository contents.

For this initial proof-of-concept, the user enters the token into the application. The application does not save the token in local storage, cookies, or repository files.

**Do not hard-code a GitHub token into `app.js`.**

### Recommended token configuration

Use a GitHub fine-grained Personal Access Token limited to this repository and grant only the repository Contents permission needed for the test.

## Important architecture note

This version is intentionally a simple proof-of-concept.

A browser application that contains a reusable GitHub credential would expose that credential to anyone who can inspect the application. For a production application, the write operation should be moved behind a secure serverless/API endpoint or another authenticated service.

The purpose of this repository is to establish and test the GitHub read/write mechanics before deciding on the final authentication architecture.

## Test procedure

1. Open the GitHub Pages site.
2. The application should automatically read `data/test-data.json`.
3. Verify that the JSON appears in the text area.
4. Enter a GitHub token with write access.
5. Click **Increment Counter**.
6. Click **Write to GitHub**.
7. Verify that GitHub reports a successful commit.
8. Reload the page.
9. Verify that the new counter value is read back from GitHub.

## GitHub API

The application uses the GitHub REST Contents API:

- `GET /repos/{owner}/{repo}/contents/{path}`
- `PUT /repos/{owner}/{repo}/contents/{path}`

The write operation includes the current file SHA, which GitHub requires when updating an existing file.
