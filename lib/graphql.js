/* eslint-env node */
/* istanbul ignore file */

"use strict";

const config = require("../config.json");
const Octokit = require("@octokit/core").Octokit
  .plugin(require("@octokit/plugin-throttling"));

const MAX_RETRIES = 3;

const octokit = new Octokit({
  auth: config.ghToken,
  throttle: {
    onRateLimit: (retryAfter, options) => {
      if (options.request.retryCount < MAX_RETRIES) {
        console.warn(`Rate limit exceeded, retrying after ${retryAfter} seconds`)
        return true;
      } else {
        console.error(`Rate limit exceeded, giving up after ${MAX_RETRIES} retries`);
        return false;
      }
    },
    onAbuseLimit: (retryAfter, options) => {
      if (options.request.retryCount < MAX_RETRIES) {
        console.warn(`Abuse detected triggered, retrying after ${retryAfter} seconds`)
        return true;
      } else {
        console.error(`Abuse detected triggered, giving up after ${MAX_RETRIES} retries`);
        return false;
      }
    }
  }
});

module.exports = octokit.graphql;
