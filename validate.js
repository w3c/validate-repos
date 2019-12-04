/* eslint-env node */

"use strict";

const graphql = require("./lib/graphql.js");
// github API v3 needed to check webhooks
const Octokat = require("octokat");

const validator = require("./lib/validator.js");
const w3cData = require("./lib/w3cData.js");
const w3cLicenses = require("./lib/w3cLicenses.js");
const config = require("./config.json");

const octo = new Octokat({token: config.ghToken});

const orgs = ["w3c", "WebAudio", "immersive-web", "webassembly", "w3ctag", "WICG", "w3cping"];
const errortypes = [
  "inconsistentgroups",
  "now3cjson",
  "invalidw3cjson",
  "illformedw3cjson",
  "incompletew3cjson",
  "nocontributing",
  "invalidcontributing",
  "nolicense",
  "nocodeofconduct",
  "invalidlicense",
  "noreadme",
  "noashnazg",
  "inconsistentstatus",
  "unprotectedbranch",
  "unprotectedbranchforadmin",
  "norequiredreview",
  "missingashnazghook",
  "duplicateashnazghooks"
];

async function fetchLabelPage(org, repo, acc = {edges: []}, cursor = null) {
  console.warn("Fetching labels for " + repo);
  let res;
  try {
    res = await graphql(`
 query {
    repository(owner:"${org}",name:"${repo}") {
        labels(first:10 ${cursor ? 'after:"' + cursor + '"' : ''}) {
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

}`);
  } catch (err) {
    console.error("query failed " + JSON.stringify(err));
  }
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
 query {
  organization(login:"${org}") {
    repositories(first:10 ${cursor ? 'after:"' + cursor + '"' : ''}) {
      edges {
        node {
          id, name, owner { login } , isArchived, homepageUrl, description, isPrivate, createdAt
          labels(first:10) {
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
          codeOfConduct { body }
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
 }`);
  } catch (err) {
    console.error(err);
  }
  // Fetch labels if they are paginated
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

async function validate() {
  const data = await w3cData();
  const licenses = await w3cLicenses();

  async function sequenced(index) {
    if (index === orgs.length) {
      return [];
    }
    const repos = await fetchRepoPage(orgs[index]);
    const next = await sequenced(index + 1);
    return repos.concat(next);
  }
  const allrepos = await sequenced(0);
  const fullName = r => r.owner.login + '/' + r.name;
  allrepos.sort((r1, r2) => fullName(r1).localeCompare(fullName(r2)));

  const allerrors = {};
  for (const type of errortypes) {
    allerrors[type] = [];
  }
  function pushErrors(repo, errors) {
    for (const [type, details] of errors) {
      if (!(type in allerrors)) {
        throw new Error(`Unexpected error type: ${type}`);
      }
      // Push just the repo name string if there are no details, and otherwise
      // add it as a `repo` property to the details object.
      if (details === null) {
        allerrors[type].push(fullName(repo));
      } else {
        allerrors[type].push({repo: fullName(repo), ...details});
      }
    }
  }
  const allgroups = new Set();
  const groupRepos = {};
  for (const r of allrepos) {
    if (!r || r.isArchived || r.isPrivate) {
      continue;
    }

    const repoData = data.get(r.owner.login, r.name);

    const {errors, groups, hasRecTrack} = validator.validateRepo(r, repoData, licenses);
    pushErrors(r, errors);
    for (const gid of groups) {
      allgroups.add(gid);
      if (!groupRepos[gid]) {
        groupRepos[gid] = [];
      }
      groupRepos[gid].push({
        name: r.name,
        fullName: fullName(r),
        // Only include `hasRecTrack` in report.json if it's true. This is
        // simply to match the original structure. TODO: include if false.
        hasRecTrack: hasRecTrack ? true : undefined,
      });
    }
    if (repoData.ashRepo) {
      const hooks = await octo.repos(fullName(r)).hooks.fetch();
      if (hooks && hooks.items) {
        const errors = validator.validateAshHooks(hooks.items);
        pushErrors(r, errors);
      }
    }
  }

  const {w3cgroups} = data;

  const results = {};
  results.errors = allerrors;
  results.timestamp = new Date();
  results.repos = allrepos;
  results.groups = w3cgroups.filter(g => allgroups.has(g.id)).reduce((acc, group) => {
    acc[group.id] = {...group, repos: groupRepos[group.id]};
    return acc;
  }, {});
  console.log(JSON.stringify(results, null, 2));
}

validate().catch((reason) => {
  console.error(reason);
  process.exit(1);
});
