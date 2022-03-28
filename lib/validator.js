/* eslint-env node */

"use strict";

// for some repos, having the w3c.json administrative file is felt as awkward
// we hard-code their equivalent here
const hardcodedRepoData = {
  'w3c/markup-validator': {
    'contacts': 'sideshowbarker',
    'repo-type': 'tool'
  },
  'w3c/css-validator': {
    'contacts': 'ylafon',
    'repo-type': 'tool'
  },
  'w3c/respec': {
    'contacts': 'marcoscaceres',
    'repo-type': 'tool'
  },
  'w3c/respec-hljs': {
    'contacts': 'marcoscaceres',
    'repo-type': 'tool'
  },
  'w3c/webidl2.js': {
    'contacts': 'marcoscaceres',
    'repo-type': 'tool'
  },
}

const hardcodedNotPermissiveLicensesGroups = [
  83726, 34314, 87227, 35422, 76043
];

const hasIntersection = (a1, a2) => a1.find(x => a2.includes(x));

// extract from https://w3c.github.io/w3c.json.html with [...document.querySelectorAll('#repo-type + dd .value')].map(n => n.textContent)
const validRepoTypes = ['rec-track', 'note', 'cg-report', 'process', 'homepage', 'article', 'tool', 'project', 'others', 'workshop', 'tests', 'translation', 'registry'];

const arrayify = x => Array.isArray(x) ? x : [x];

const nlToSpace = str => str.replace(/\n/g, " ").replace(/ {2}/g, " ").trim();
const httpToHttps = str => str.replace(/http:\/\/www.w3.org\//g, "https://www.w3.org/");

const mdMatch = (md, ref) => nlToSpace(httpToHttps(md.toLowerCase())).indexOf(nlToSpace(ref.toLowerCase())) !== -1;

const fullName = r => r.owner.login + '/' + r.name;

// Also potentially sets `r.prpreview` and `r.w3c`.
function validateRepo(r, data, licenses, w3cgroups) {
  const {contributing, contributingSw, license, licenseSw} = licenses;

  const errors = [];
  function reportError(type, details = null) {
    errors.push([type, details]);
  }

  if (!r.readme) {
    reportError('noreadme');
  }
  if (!r.codeofconduct) {
    reportError('nocodeofconduct');
  }
  let shouldBeRepoManaged = false;
  const hasRecTrack = {ashnazg: null, repotype: null, tr: null}; // TODO detect conflicting information (repo-type vs ash-nazg vs TR doc)

  const {specs} = data;
  if (specs && specs.length) {
    hasRecTrack.tr = specs.some(s => s.recTrack);
  }

  const {ashRepo} = data;
  if (ashRepo) {
    hasRecTrack.ashnazg = ashRepo.groups.some(g => g.groupType === "WG");
  }
  if (r.prpreviewjson) {
    try {
      r.prpreview = JSON.parse(r.prpreviewjson.text);
    } catch (e) {
      //reportError('illformedprpreviewcjson');
    }
  }

  let conf = null;
  if (r.w3cjson) {
    try {
      conf = JSON.parse(r.w3cjson.text);
    } catch (e) {
      reportError('illformedw3cjson');
    }
  } else if (hardcodedRepoData[fullName(r)]) {
    conf = hardcodedRepoData[fullName(r)];
  }

  let groups = [];
  if (conf) {
    r.w3c = conf;
    // TODO: replace with JSON schema?
    if (!conf["repo-type"]) {
      reportError('incompletew3cjson', {error: "repo-type" + (Object.values(hasRecTrack).every(x => x === null) ? " (unknown)" : (hasRecTrack.tr || hasRecTrack.ashnazg ? " (rec-track)" : " (not rec-track)"))});
    } else {
      conf["repo-type"] = arrayify(conf["repo-type"]);
      hasRecTrack.repotype = conf["repo-type"].includes('rec-track');

      const unknownTypes = conf['repo-type'].filter(t => !validRepoTypes.includes(t));
      if (unknownTypes.length) {
        reportError('invalidw3cjson', {error: "unknown types: " + JSON.stringify(unknownTypes)});
      }
    }
    if (!conf.group && conf["repo-type"] && hasIntersection(["rec-track", "note", "cg-report"], conf["repo-type"])) {
      reportError('incompletew3cjson', {error: "group"});
    } else {
      // Note that `data.group` is unused here.
      // conf.group can be either a list of numeric ids
      // or a list of strings à la `${grouptype}/${groupshortname}`
      // cf https://github.com/w3c/validate-repos/issues/107
      groups = [];
      for (const groupid of arrayify(conf.group)) {
        let id = groupid;
        if (typeof id === "string") {
          id = parseInt(groupid, 10);
          // this wasn't a stringified number
          if (isNaN(id)) {
            id = (w3cgroups.find(g => g.fullshortname === groupid) || {}).id;
          }
          if (!id) {
            reportError('invalidw3cjson', {error: "unknown group name: " + JSON.stringify(groupid)});
          }
        }
        if (id) {
          groups.push(id);
        }
      }
      shouldBeRepoManaged = conf["repo-type"] && hasIntersection(['rec-track', 'cg-report'], conf["repo-type"]);
    }
    if (!conf.contacts) {
      reportError('incompletew3cjson', {error: "contacts"});
    } else {
      if (arrayify(conf.contacts).some(x => typeof x !== "string")) {
        reportError('invalidw3cjson', {error: "invalid contacts: " + JSON.stringify(conf.contacts)});
      }
    }
  } else {
    groups = data.groups;
    reportError('now3cjson');
  }

  if (conf && conf["repo-type"] && hasIntersection(["rec-track", "note", "cg-report"], conf["repo-type"])) {
    if (!r.license || !r.license.text) {
      reportError('nolicense');
    } else {
      if (!mdMatch(r.license.text, license) && !mdMatch(r.license.text, licenseSw)) {
        reportError('invalidlicense', {error: "doesn't match SW or DOC license", license: r.license.text});
      } else if (!groups.find(g => hardcodedNotPermissiveLicensesGroups.includes(g)) && conf["repo-type"].includes("rec-track") && !mdMatch(r.license.text, licenseSw)) {
        reportError('invalidlicense', {error: "doesn't match chartered SW license", license: r.license.text});
      }
    }
    if (!r.contributing || !r.contributing.text) {
      reportError('nocontributing');
    } else {
      if (!mdMatch(r.contributing.text, contributing) && !mdMatch(r.contributing.text, contributingSw)) {
        reportError('invalidcontributing', {error: "doesn't match SW or DOC contributing", contributing: r.contributing.text});
      }
    }
  }
  if (conf && conf["repo-type"] && hasIntersection(["rec-track", "note"], conf["repo-type"])) {
    if (!r.autoPublish || !r.autoPublish.text) {
      reportError('noautopublish');
    }
  }
  if (r.travis && r.travis.text) {
    reportError('usetravisci');
  }

  let defaultBranch;
  if (!r.defaultBranch || !r.defaultBranch.name) {
    // This ought to only happen for an empty repository.
    reportError('nodefaultbranch');
  } else {
    defaultBranch = r.defaultBranch.name;
    if (defaultBranch === "master") {
      reportError('defaultbranchismaster');
    }
  }

  const recTrackStatus = hasRecTrack.tr || hasRecTrack.ashnazg || hasRecTrack.repo;
  shouldBeRepoManaged = shouldBeRepoManaged || recTrackStatus;

  if (shouldBeRepoManaged) {
    if (!ashRepo) {
      reportError('noashnazg');
    } else {
      const ashGroups = ashRepo.groups.map(g => parseInt(g.w3cid, 10));
      if (ashGroups.filter(x => groups.includes(x)).length !== ashGroups.length) {
        reportError('inconsistentgroups', {ashnazgroups: ashGroups, error: JSON.stringify(groups) + ' vs ' + JSON.stringify(ashGroups)});
      }
    }

    if (defaultBranch) {
      const rule = r.branchProtectionRules
        ? r.branchProtectionRules.nodes.find(rule => rule.pattern === defaultBranch)
        : null;
      if (!rule) {
        reportError('unprotectedbranch', {error: `${defaultBranch} branch is not protected`});
      } else {
        if (!rule.isAdminEnforced) {
          reportError('unprotectedbranchforadmin', {error: `${defaultBranch} branch protection is not admin enforced`});
        }
        if (!(rule.requiredApprovingReviewCount > 0)) {
          reportError('norequiredreview', {error: `${defaultBranch} branch review is not required`});
        }
      }
    }
  }
  if (hasRecTrack.tr !== null && hasRecTrack.repotype !== null && hasRecTrack.tr !== hasRecTrack.repotype) {
    reportError('inconsistentstatus', {error: "TR document: " + hasRecTrack.tr + ", vs repo: " + hasRecTrack.repotype});
  }
  if (hasRecTrack.tr !== null && hasRecTrack.ashnazg !== null && hasRecTrack.tr !== hasRecTrack.ashnazg) {
    reportError('inconsistentstatus', {error: "TR document: " + hasRecTrack.tr + ", vs repo manager: " + hasRecTrack.ashnazg});
  }
  if (hasRecTrack.repotype !== null && hasRecTrack.ashnazg !== null && hasRecTrack.repotype !== hasRecTrack.ashnazg) {
    reportError('inconsistentstatus', {error: "repo: " + hasRecTrack.repotype + ", vs repo manager: " + hasRecTrack.ashnazg});
  }

  return {
    errors, groups,
    hasRecTrack: !!recTrackStatus,
  };
}

const ashnazgHookUrls = [
  "https://labs.w3.org/hatchery/repo-manager/api/hook",
  "https://labs.w3.org/repo-manager/api/hook"
];

function validateAshHooks(hooks) {
  // Note: unlike `reportError` used above, here empty object literals are
  // pushed instead of nulls. This is simply to match the original structure
  // of report.json. TODO: change this to null, or add error details.
  const errors = [];
  const ashHooks = hooks.filter(h => ashnazgHookUrls.includes(h.config.url) && h.config.content_type === "json" && h.config.insecure_ssl === "0" && h.config.secret !== "");
  if (ashHooks.length === 0) {
    errors.push(['missingashnazghook', {}]);
  }
  if (ashHooks.length > 1) {
    errors.push(['duplicateashnazghooks', {}]);
  }
  return errors;
}

module.exports = {validateRepo, validateAshHooks};
