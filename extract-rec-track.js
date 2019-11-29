/* eslint-env node */

"use strict";

const repos = require("./report.json").repos;

console.log(JSON.stringify(
  repos.filter(r => r.w3c && r.w3c["repo-type"]
    && (r.w3c["repo-type"] === "rec-track" ||
    r.w3c["repo-type"].includes("rec-track")))
    .map(r => r.owner.login + "/" + r.name),
  null,
  2)
);
