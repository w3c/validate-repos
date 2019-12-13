/* eslint-env node */

"use strict";

const config = require("../config.json");

const graphql = require("./graphql.js");
// github API v3 needed to check webhooks
const Octokat = require("octokat");
const octo = new Octokat({token: config.ghToken});

async function fetchLabelPage(org, repo, acc = {edges: []}, cursor) {
  console.warn("Fetching labels for " + repo);
  let res;
  try {
    res = await graphql(`
      query ($org: String!, $repo: String!, $cursor: String!) {
        repository(owner: $org, name: $repo) {
          labels(first: 10, after: $cursor) {
            edges {
              node {
                name
                color
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      }
    `, {org, repo, cursor});
  } catch (err) {
    // istanbul ignore next
    console.error("query failed " + JSON.stringify(err));
  }
  // istanbul ignore else
  if (res && res.repository) {
    const labels = {edges: acc.edges.concat(res.repository.labels.edges)};
    if (res.repository.labels.pageInfo.hasNextPage) {
      return fetchLabelPage(org, repo, labels, res.repository.labels.pageInfo.endCursor);
    } else {
      return {"repo": {"owner": org, "name": repo}, labels};
    }
  } else {
    console.error("Fetching label for " + repo + " at cursor " + cursor + " failed with " + JSON.stringify(res) + ", not retrying");
    return {"repo": {"owner": org, "name": repo}, "labels": acc};
    //return fetchLabelPage(org, repo, acc, cursor);
  }
}

async function fetchRepoPage(org, acc = [], cursor = null) {
  let res;
  try {
    res = await graphql(`
      query ($org: String!, $cursor: String) {
        organization(login: $org) {
          repositories(first: 10, after: $cursor) {
            edges {
              node {
                id
                name
                owner {
                  login
                }
                isArchived
                homepageUrl
                description
                isPrivate
                createdAt
                labels(first: 10) {
                  edges {
                    node {
                      name
                      color
                    }
                  }
                  pageInfo {
                    endCursor
                    hasNextPage
                  }
                }
                defaultBranch: defaultBranchRef {
                  name
                }
                branchProtectionRules(first: 5) {
                  nodes {
                    pattern
                    requiredApprovingReviewCount
                    requiredStatusCheckContexts
                    isAdminEnforced
                  }
                }
                w3cjson: object(expression: "HEAD:w3c.json") {
                  ... on Blob {
                    text
                  }
                }
                prpreviewjson: object(expression: "HEAD:.pr-preview.json") {
                  ... on Blob {
                    text
                  }
                }
                contributing: object(expression: "HEAD:CONTRIBUTING.md") {
                  ... on Blob {
                    text
                  }
                }
                license: object(expression: "HEAD:LICENSE.md") {
                  ... on Blob {
                    text
                  }
                }
                codeOfConduct {
                  body
                }
                readme: object(expression: "HEAD:README.md") {
                  ... on Blob {
                    text
                  }
                }
              }
              cursor
            }
            pageInfo {
              endCursor
              hasNextPage
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
    `, {org, cursor});
  } catch (err) {
    // istanbul ignore next
    console.error(err);
  }
  // Fetch labels if they are paginated
  // istanbul ignore else
  if (res && res.organization) {
    console.error("GitHub rate limit: " + JSON.stringify(res.rateLimit));
    return Promise.all(
      res.organization.repositories.edges
        .filter(e => e.node.labels.pageInfo.hasNextPage)
        .map(e => fetchLabelPage(e.node.owner.login, e.node.name, e.node.labels, e.node.labels.pageInfo.endCursor))
    ).then((labelsPerRepos) => {
      const data = acc.concat(res.organization.repositories.edges.map(e => e.node));
      labelsPerRepos.forEach(({repo, labels}) => {
        data.find(r => r.owner.login == repo.owner && r.name == repo.name).labels = labels;
      });
      // Clean up labels data structure
      data.forEach(r => {
        if (r.labels && r.labels.edges) {
          r.labels = r.labels.edges.map(e => e.node);
        }
      });
      if (res.organization.repositories.pageInfo.hasNextPage) {
        return fetchRepoPage(org, data, res.organization.repositories.pageInfo.endCursor);
      } else {
        return data;
      }
    });
  } else {
    console.error("Fetching repo results at cursor " + cursor + " failed, retrying");
    return fetchRepoPage(org, acc, cursor);
  }
}

async function fetchRepoHooks(org, repo) {
  const hooks = await octo.repos(`${org}/${repo}`).hooks.fetch();
  return hooks.items;
}

module.exports = {fetchRepoPage, fetchRepoHooks};
