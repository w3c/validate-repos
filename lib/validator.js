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

// extract from https://w3c.github.io/w3c.json.html with [...document.querySelectorAll('#repo-type + dd .value')].map(n => n.textContent)
const validRepoTypes = ['rec-track', 'note', 'cg-report', 'process', 'homepage', 'article', 'tool', 'project', 'others', 'workshop', 'tests', 'translation'];

const arrayify = x => Array.isArray(x) ? x : [x];

const nlToSpace = str => str.replace(/\n/g, " ").replace(/ {2}/g, " ").trim();
const httpToHttps = str => str.replace(/http:\/\/www.w3.org\//g, "https://www.w3.org/");

const mdMatch = (md, ref) => nlToSpace(httpToHttps(md.toLowerCase())).indexOf(nlToSpace(ref.toLowerCase())) !== -1;

const fullName = r => r.owner.login + '/' + r.name;

function validateRepo(r, licenses, repoData, cgData, repoMap) {
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
  if (!r.license || !r.license.text) {
    reportError('nolicense');
  } else {
    if (!mdMatch(r.license.text, license) && !mdMatch(r.license.text, licenseSw)) {
      reportError('invalidlicense', {error: "doesn't match SW or DOC license", license: r.license.text});
    }
  }
  if (!r.contributing || !r.contributing.text) {
    reportError('nocontributing');
  } else {
    if (!mdMatch(r.contributing.text, contributing) && !mdMatch(r.contributing.text, contributingSw)) {
      reportError('invalidcontributing', {error: "doesn't match SW or DOC contributing", contributing: r.contributing.text});
    }
  }
  let shouldBeRepoManaged = false;
  const hasRecTrack = {ashnazg: null, repotype: null, tr: null}; // TODO detect conflicting information (repo-type vs ash-nazg vs TR doc)

  let groups = [];
  // is the repo associated with a CG in the CG monitor?
  const cgRepo = cgData.data.find(cg => cg.repositories.includes('https://github.com/' + fullName(r) || cg.repositories.includes('https://github.com/' + fullName(r) + '/'))) ||
        // is the repo in WICG space?
        (r.owner.login === 'WICG' ? {id: 80485} : null);
  // is the repo associated with a WG in the spec dashboard?
  const wgRepo = repoMap[fullName(r)];
  const audioWgRepo = r.owner.login === 'WebAudio' ? {id: 46884} : null;
  if (wgRepo) {
    hasRecTrack.tr = wgRepo.some(x => x.recTrack);
  }

  const ashRepo = repoData.find(x => x.owner.toLowerCase() === r.owner.login.toLowerCase() && x.name.toLowerCase() === r.name.toLowerCase());
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
  if (conf) {
    r.w3c = conf;
    // TODO: replace with JSON schema?
    if (!conf["repo-type"]) {
      reportError('incompletew3cjson', {error: "repo-type" + (Object.values(hasRecTrack).every(x => x === null) ? " (unknown)" : (hasRecTrack.tr || hasRecTrack.ashnazg ? " (rec-track)" : " (not rec-track)"))});
    } else {
      hasRecTrack.repotype = arrayify(conf["repo-type"]).includes('rec-track');

      const unknownTypes = arrayify(conf['repo-type']).filter(t => !validRepoTypes.includes(t));
      if (unknownTypes.length) {
        reportError('invalidw3cjson', {error: "unknown types: " + JSON.stringify(unknownTypes)});
      }
    }
    if (!conf.group && ["rec-track", "note", "cg-report"].includes(conf["repo-type"])) {
      reportError('incompletew3cjson', {error: "group"});
    } else {
      groups = arrayify(conf.group).map(id => parseInt(id, 10));
      shouldBeRepoManaged = conf["repo-type"] && (conf["repo-type"] === 'rec-track' || conf["repo-type"] === 'cg-report');
    }
    if (!conf.contacts) {
      reportError('incompletew3cjson', {error: "contacts"});
    } else {
      if (arrayify(conf.contacts).some(x => typeof x !== "string")) {
        reportError('invalidw3cjson', {error: "invalid contacts: " + JSON.stringify(conf.contacts)});
      }
    }
  } else {
    if (cgRepo) {
      groups = [cgRepo.id];
    }
    if (wgRepo && wgRepo.length) {
      groups = groups.concat(wgRepo.map(x => x.group));
    }
    if (audioWgRepo) {
      groups.push(audioWgRepo.id);
    }
    reportError('now3cjson');
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
  }
  if (recTrackStatus) {
    if (!r.branchProtectionRules || r.branchProtectionRules.nodes.length < 1) {
      reportError('unprotectedbranch', {error: "No protected branch"});
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
    isAshRepo: !!ashRepo,
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
  const ashHooks = hooks.filter(h => ashnazgHookUrls.includes(h.config.url) && h.config.contentType === "json" && h.config.insecureSsl === "0" && h.config.secret !== "");
  if (ashHooks.length === 0) {
    errors.push(['missingashnazghook', {}]);
  }
  if (ashHooks.length > 1) {
    errors.push(['duplicateashnazghooks', {}]);
  }
  return errors;
}

module.exports = {validateRepo, validateAshHooks};
