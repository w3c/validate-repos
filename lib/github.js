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
      contributingCg: object(expression: "HEAD:CG-CONTRIBUTING.md") {
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
      licenseCg: object(expression: "HEAD:CG-LICENSE.md") {
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
  if (res.contributingCg) {
    res.contributingCg = res.contributingCg.text;
  }
  if (res.license) {
    res.license = res.license.text;
  }
  if (res.licenseSw) {
    res.licenseSw = res.licenseSw.text;
  }
  if (res.licenseCg) {
    res.licenseCg = res.licenseCg.text;
  }
  return res;
}

const repoQuery = `
  query ($org: String!, $cursor: String) {
    organization(login: $org) {
      repositories(first: 5, after: $cursor) {
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
          labels(first: 50) {
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
          autoPublish: object(expression: "HEAD:.github/workflows/auto-publish.yml") {
            ... on Blob {
              text
            }
          }
          travis: object(expression: "HEAD:.travis.yml") {
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
      labels(first: 50, after: $cursor) {
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
      labels.sort((l1, l2) => l1.name.localeCompare(l2.name));
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
  try {
    const ret = await octokit.request('GET /repos/:owner/:repo/hooks', {
      owner, repo,
    });
    return ret.data;
  } catch (e) {
    return [];
  }
}

module.exports = {
  w3cLicenses,
  listRepos,
  listRepoContributors,
  listRepoHooks,
};
