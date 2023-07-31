/* eslint-env node */

const github = require("./lib/github.js");
const w3c = require('node-w3capi');

// based on a downloaded a local copy from https://labs.w3.org/hatchery/repo-manager/api/users when logged in there, filtered to leave only list of ghID
const ashnazgusers = require('./ashnazg-users.json');

if (!process.argv[2] || process.argv[2].indexOf('/') === -1) {
  console.error("Required: name of repo to check, e.g. w3c/webrtc-pc");
  process.exit(2);
}

const [owner, repo] = process.argv[2].split('/');

github.listRepoContributors(owner, repo).then(contributors => {
  Promise.all(contributors.map(contributor => {
    return new Promise(function(res, rej) {
      w3c.user({type: 'github', id: contributor.id}).fetch(function(err, /* w3cuser */) {
        if (err) {
          if (err.status === 404) {
            // is the user known in ahsnazg local db?
            if (ashnazgusers.indexOf(contributor.id) !== -1) {
              return res(null);
            } else {
              return res({login: contributor.login, contributions: contributor.contributions});
            }
          } else {
            return rej(err);
          }
        }
        return res(null);
      });
    });
  })).then(results => {
    console.log(JSON.stringify(results.filter(x => x), null, 2));
  });
});
