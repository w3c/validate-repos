/* eslint-env node */

"use strict";

const config = require("../config.json");
const graphql = require('@octokit/graphql').graphql.defaults({
  headers: {
    authorization: `token ${config.ghToken}`,
  },
});

module.exports = graphql;
