/* eslint-env node */

/**
 * Check GitHub issues and pull requests referenced by reports and create
 * a pull request to drop reports that have been addressed.
 */

const core = require('@actions/core');
const octokit = require('../lib/octokit');
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const issueReportDir = "issue-reports";

/**
 * Check GitHub issues and PR referenced by patch files and drop patch files
 * that only reference closed issues and PR.
 *
 * @function
 * @return {String} A GitHub flavored markdown string that describes what
 *   patches got dropped and why. To be used in a possible PR. Returns an
 *   empty string when there are no patches to drop.
 */
async function dropReportsWhenPossible() {
  const rootDir = path.join(__dirname, '../' + issueReportDir);

  console.log('Gather reports files');
  let reports = [];
  const files = fs.readdirSync(rootDir);
  for (const file of files) {
    if (file.endsWith('.md')) {
      const report = path.join(rootDir, file);
      console.log(`- add "${report}"`);
      reports.push({name: report});
    }
  }

  console.log();
  console.log('Extract list of issues');
  const issueUrl = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)$/;
  for (const report of reports) {
    let contents;
    try {
      contents = matter(await fs.promises.readFile(report.name, 'utf-8'));
    } catch (e) {
      console.error(`- "${report.name}" has invalid YAML`);
      continue;
    }
    const tracked = contents.data.Tracked;
    const m = tracked.match(issueUrl);
    if (m) {
      report.issue = {
        owner: m[1],
        repo: m[2],
        number: parseInt(m[4], 10),
        url: tracked
      };
      console.log(`- "${report.name}" linked to ${report.issue.url}`);
    } else {
      console.log(`- "${report.name}" not linked to any issue`);
    }
  }
  reports = reports.filter(report => report.issue);

  console.log();
  console.log('Check status of GitHub issues/PR');
  for (const {issue} of reports) {
    const response = await octokit.issues.get({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number
    });
    issue.state = response?.data?.state ?? 'unknown';
    console.log(`- [${issue.state}] ${issue.url}`);
  }

  console.log();
  console.log('Drop reports when possible');
  reports = reports.filter(report => report.issue.state === 'closed');
  if (reports.length > 0) {
    const res = [];
    for (const report of reports) {
      console.log(`- drop "${report.name}"`);
      fs.unlinkSync(report.name);
      res.push(`- \`${report.name}\` was linked to now closed: [${report.issue.owner}/${report.issue.repo}#${report.issue.number}](${report.issue.url})`);
    }
    return res.join('\n');
  } else {
    console.log('- No report to drop at this time');
    return '';
  }
}


dropReportsWhenPossible()
  .then(res => {
    core.exportVariable('dropped_reports', res);
    console.log();
    console.log('Set dropped_reports env variable');
    console.log(res);
    console.log('== The end ==');
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
