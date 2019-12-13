/* eslint-env node */

"use strict";

const config = require("../config.json");

const graphql = require("./graphql.js");
// github API v3 needed to check webhooks
const Octokat = require("octokat");
const octo = new Octokat({token: config.ghToken});

const repoQuery = `
  query ($org: String!, $cursor: String) {
    organization(login: $org) {
      repositories(first: 10, after: $cursor) {
        nodes {
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
          labels(first: 100) {
            nodes {
              name
              color
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
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;

const labelQuery = `
  query ($org: String!, $repo: String!, $cursor: String!) {
    repository(owner: $org, name: $repo) {
      labels(first: 100, after: $cursor) {
        nodes {
          name
          color
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
`;

async function *listRepos(org) {
  for (let cursor = null; ;) {
    const res = await graphql(repoQuery, {org, cursor});
    for (const repo of res.organization.repositories.nodes) {
      const labels = repo.labels.nodes;
      // Fetch more labels if they are paginated
      for (let pageInfo = repo.labels.pageInfo; pageInfo.hasNextPage;) {
        const res = await graphql(labelQuery, {
          org,
          repo: repo.name,
          cursor: pageInfo.endCursor
        });
        labels.push(...res.repository.labels.nodes);
        pageInfo = res.repository.labels.pageInfo;
      }
      repo.labels = labels;
      yield repo;
    }
    if (res.organization.repositories.pageInfo.hasNextPage) {
      cursor = res.organization.repositories.pageInfo.endCursor;
    } else {
      break;
    }
  }
}

async function listRepoHooks(org, repo) {
  const hooks = await octo.repos(`${org}/${repo}`).hooks.fetch();
  return hooks.items;
}

module.exports = {listRepos, listRepoHooks};
