"use strict";

const graphql = require("./graphql.js");


// Set up the config of this repository
async function licenses() {
  async function query() {
    let res = graphql(`
  query {
    repository(owner:"w3c",name:"licenses") {
      contributing: object(expression: "HEAD:WG-CONTRIBUTING.md") {
        ... on Blob {
          text
        }
      }
      contributingSw: object(expression: "HEAD:WG-CONTRIBUTING-SW.md") {
        ... on Blob {
          text
        }
      }
      license: object(expression: "HEAD:WG-LICENSE.md") {
        ... on Blob {
          text
        }
      }
      licenseSw: object(expression: "HEAD:WG-LICENSE-SW.md") {
        ... on Blob {
          text
        }
      }
    }
  rateLimit {
    limit
    cost
    remaining
    resetAt
  }
  }
  `);
    if (res) return res;
    console.error('Query for w3c/licenses failed, retrying');
    return query();
  }
  let res = await query();
  res = res.repository;

  if (res.contributing) {
    res.contributing = res.contributing.text;
  }
  if (res.contributingSw) {
    res.contributingSw = res.contributingSw.text;
  }
  if (res.license) {
    res.license = res.license.text;
  }
  if (res.licenseSw) {
    res.licenseSw = res.licenseSw.text;
  }
  return res;
}

module.exports = licenses;
