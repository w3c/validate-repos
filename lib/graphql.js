/* eslint-env node */

"use strict";

const config = require("../config.json");
const fetch = require("node-fetch");

const GH_API = "https://api.github.com/graphql";

// use https://developer.github.com/v4/explorer/ to debug queries

const GH_HEADERS = {
  "Accept": "application/vnd.github.v4.idl",
  "User-Agent": "graphql-github/0.1",
  "Content-Type": "application/json",
  "Authorization": "bearer " + config.ghToken
};

async function graphql(query) {
  const options = {
    method: 'POST',
    headers: GH_HEADERS,
    body: JSON.stringify({query})
  };

  const obj = await fetch(GH_API, options).then(res => res.json());

  if (obj.errors) {
    const ghErr = obj.errors[0]; // just return the first error
    const err = new Error(ghErr.message, "unknown", -1);
    if (ghErr.type) {
      err.type = ghErr.type;
    }
    err.all = obj.errors;
    throw err;
  }
  return obj.data;
}

module.exports = graphql;
