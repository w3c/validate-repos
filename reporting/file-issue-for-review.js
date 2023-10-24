/* eslint-env node */

/* Takes a report of anomalies produced by Strudy,
   creates a draft of an issue per spec and per anomaly type
   and submits as a pull request in this repo if no existing one matches
*/
const report = require('../report.json');
const path = require('path');
const fs = require('fs').promises;
const {execSync} = require('child_process');
const octokit = require('../lib/octokit');
const matter = require('gray-matter');

const issueReportDir = "issue-reports";

const MAX_PR_BY_RUN = 20;

const repoOwner = 'w3c';
const repoName = 'validate-repos';


function issueWrapper(anomalies, anomalyType) {
  let anomalyReport = ''; let title = '';
  switch (anomalyType) {
  case 'illformedw3cjson':
    title = `Ill-formed w3c.json file`;
    anomalyReport = 'The w3c.json file in this repo is not valid JSON';
    break;
  case 'invalidw3cjson':
    title = `Invalid w3c.json data`;
    anomalyReport = 'The w3c.json file in this repo does not follow the [expected data model](https://w3c.github.io/w3c.json.html). The following errors were detected';
    break;
  case 'inconsistentgroups':
    title = `Inconsistent repo information on IPR`;
    anomalyReport = 'The w3c.json file in this repo indicates a different W3C group from the one associated to it in the [IPR checker](https://labs.w3.org/repo-manager/);'
    break;

  }
  return {
    title,
    content: `
${anomalyReport}${anomalies.length ? `:
${anomalies.map(anomaly => `* [ ] ${anomaly}`).join('\n')}` : "."}

<sub>This issue was detected and reported semi-automatically by [validate-repos](https://github.com/w3c/validate-repos/).</sub>`
  };
}

function prWrapper(repo, issueReport) {
  return `This pull request was automatically created by validate-repos upon detecting errors in ${repo}.

Please check that these errors were correctly detected, and that they have not already been reported in ${repo}.

If everything is OK, you can merge this pull request which will report the issue below to the repo, and update the underlying report file with a link to the said issue.

${issueReport}
`;
}

if (require.main === module) {
  const anomalyTypes = ['illformedw3cjson', 'invalidw3cjson', 'inconsistentgroups'];

  const updateMode = process.argv.includes('--update') ? 'update-untracked' : (process.argv.includes('--update-tracked') ? 'update-tracked' : false);
  const dryRun = process.argv.includes('--dry-run');
  const noGit = dryRun || updateMode || process.argv.includes('--no-git');

  (async function() {
    let existingReports = [];
    if (updateMode) {
      console.log('Compiling list of relevant existing issue reports…');
      // List all existing reports to serve as a comparison point
      // to detect if any report can be deleted
      // if the anomalies are no longer reported
      const reportFiles = (await fs.readdir(issueReportDir)).map(p => issueReportDir + '/' + p);
      for (const anomalyType of anomalyTypes) {
        existingReports = existingReports.concat(reportFiles.filter(p => p.endsWith(`-${anomalyType.toLowerCase()}.md`)));
      }
      console.log('- done');
    }
    const nolongerRelevantReports = new Set(existingReports);


    console.log('Loading errors from validate-repos results…');
    const results = report.errors;
    console.log('- done');
    const currentBranch = noGit || execSync('git branch --show-current', {encoding: 'utf8'}).trim();
    const needsPush = {};
    for (const anomalyType of anomalyTypes) {
      const anomalies = results[anomalyType];
      const repos = anomalies.map(a => a.repo ?? a);
      for (const repo of repos) {
        const repoAnomalies = anomalies.filter(a => a.repo === repo);
        const repoMoniker = repo.replace('/', '___');
        const issueMoniker = `${repoMoniker}-${anomalyType.toLowerCase()}`;
        // is there already a file with that moniker?
        const issueFilename = path.join(issueReportDir + '/', issueMoniker + '.md');
        let tracked = 'N/A';
        let existingReportContent;
        try {
          if (!(await fs.stat(issueFilename)).isFile()) {
            console.error(`${issueFilename} already exists but is not a file`);
            continue;
          } else {
            if (!updateMode) {
              console.log(`${issueFilename} already exists, bailing`);
              continue;
            } else {
              nolongerRelevantReports.delete(issueFilename);
              try {
                const existingReport = matter(await fs.readFile(issueFilename, 'utf-8'));
                tracked = existingReport.data.Tracked;
                existingReportContent = existingReport.content;
                // only update tracked or untracked reports based on
                // CLI parameter
                if ((updateMode === 'update-untracked' && tracked !== 'N/A') || (updateMode === 'update-tracked' && tracked === 'N/A')) {
                  continue;
                }
              } catch (e) {
                console.error('Failed to parse existing content', e);
                continue;
              }
            }
          }
        } catch (err) {
          // Intentionally blank
        }
        // if not, we create the file, add it in a branch
        // and submit it as a pull request to the repo
        const {title, content: issueReportContent} = issueWrapper(repoAnomalies.map(a => a.error).filter(x => x), anomalyType);
        if (updateMode) {
          if (existingReportContent) {
            const existingAnomalies = existingReportContent.split('\n').filter(l => l.startsWith('* [ ] ')).map(l => l.slice(6));
            if (existingAnomalies.every((a, i) => repoAnomalies[i] === a) && existingAnomalies.length === repoAnomalies.length) {
              // no substantial change, skip
              console.log(`Skipping ${title}, no change`);
              continue;
            }
          } else {
            // in update mode, we only care about existing reports
            continue;
          }
        }
        const issueReportData = matter(issueReportContent);
        issueReportData.data = {
          Repo: "https://github.com/" + repo,
          Tracked: tracked,
          Title: title
        };
        let issueReport;
        try {
          issueReport = issueReportData.stringify();
        } catch (err) {
          console.error(`Failed to stringify report of ${anomalyType} for ${title}: ${err}`, issueReportContent);
          continue;
        }
        if (dryRun) {
          console.log(`Would add ${issueFilename} with`);
          console.log(issueReport);
          console.log();
        } else {
          await fs.writeFile(issueFilename, issueReport, 'utf-8');
          try {
            if (!noGit) {
              console.log(`Committing issue report as ${issueFilename} in branch ${issueMoniker}…`);
              execSync(`git checkout -b ${issueMoniker}`);
              execSync(`git add ${issueFilename}`);
              execSync(`git commit -m "File report on ${issueReportData.data.Title}"`);
              needsPush[issueMoniker] = {title: issueReportData.data.Title, report: issueReport, repo};
              console.log('- done');
              execSync(`git checkout ${currentBranch}`);
            }
          } catch (err) {
            console.error(`Failed to commit error report for ${repo}`, err);
            await fs.unlink(issueFilename);
            execSync(`git checkout ${currentBranch}`);
          }
        }
      }
    }
    if (nolongerRelevantReports.size) {
      console.log('The following reports are no longer relevant, deleting them', [...nolongerRelevantReports]);
      for (const issueFilename of nolongerRelevantReports) {
        await fs.unlink(issueFilename);
      }
    }
    if (Object.keys(needsPush).length) {
      let counter = 0;
      for (const branch in needsPush) {
        if (counter > MAX_PR_BY_RUN) {
          delete needsPush[branch];
          continue;
        }

        // is there already a pull request targetting that branch?
        const {data: pullrequests} = (await octokit.rest.pulls.list({
          owner: repoOwner,
          repo: repoName,
          head: `${repoOwner}:${branch}`
        }));
        if (pullrequests.length > 0) {
          console.log(`A pull request from branch ${branch} already exists, bailing`);
          delete needsPush[branch];
        }
        counter++;
      }
    }
    if (Object.keys(needsPush).length) {
      console.log(`Pushing new branches ${Object.keys(needsPush).join(' ')}…`);
      execSync(`git push origin ${Object.keys(needsPush).join(' ')}`);
      console.log('- done');
      for (const branch in needsPush) {
        const {title, repo, report} = needsPush[branch];
        console.log(`Creating pull request from branch ${branch}…`);
        await octokit.rest.pulls.create({
          owner: repoOwner,
          repo: repoName,
          title: `[${repo}] ${title}`,
          body: prWrapper(repo, report),
          head: `${repoOwner}:${branch}`,
          base: 'main'
        });
        console.log('- done');
      }
    }
  })();
}
