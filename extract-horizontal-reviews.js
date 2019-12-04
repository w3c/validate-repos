/* eslint-env node */

"use strict";

const repos = require("./report.json").repos;

const hrLabelRegexp = new RegExp(/-(tracker|needs-resolution)$/);
const isHRLabel = n => n.name.match(hrLabelRegexp);

console.log(JSON.stringify(
  repos.filter(r => r.labels && r.labels.find(isHRLabel))
    .map(r => r.owner.login + "/" + r.name),
  null,
  2)
);
