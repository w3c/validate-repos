/* eslint-env node */
/* istanbul ignore file */

"use strict";

const config = require("../config.json");
const {throttling} = require("@octokit/plugin-throttling");
const Octokit = require("@octokit/core").Octokit
  .plugin(throttling);

const MAX_RETRIES = 3;

const GH_TOKEN = (() => {
  try {
    return config.ghToken;
  } catch (err) {
    return process.env.GH_TOKEN;
  }
})();


const octokit = new Octokit({
  auth: GH_TOKEN,
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
        console.warn(`Abuse detection triggered, retrying after ${retryAfter} seconds`)
        return true;
      } else {
        console.error(`Abuse detection triggered, giving up after ${MAX_RETRIES} retries`);
        return false;
      }
    }
  }
});

module.exports = octokit;
