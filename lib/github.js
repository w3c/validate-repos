/* eslint-env node */

"use strict";

const octokit = require("./octokit.js");

const licenseQuery = `
  query {
    repository(owner: "w3c", name: "licenses") {
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
  }
`;

async function w3cLicenses() {
  let res = await octokit.graphql(licenseQuery);
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
    const res = await octokit.graphql(repoQuery, {org, cursor});
    for (const repo of res.organization.repositories.nodes) {
      const labels = repo.labels.nodes;
      // Fetch more labels if they are paginated
      for (let pageInfo = repo.labels.pageInfo; pageInfo.hasNextPage;) {
        const res = await octokit.graphql(labelQuery, {
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

async function listRepoContributors(owner, repo) {
  const res = await octokit.request('GET /repos/:owner/:repo/contributors', {
    owner, repo,
  });
  return res.data;
}

async function listRepoHooks(owner, repo) {
  const res = await octokit.request('GET /repos/:owner/:repo/hooks', {
    owner, repo,
  });
  return res.data;
}

module.exports = {
  w3cLicenses,
  listRepos,
  listRepoContributors,
  listRepoHooks,
};
