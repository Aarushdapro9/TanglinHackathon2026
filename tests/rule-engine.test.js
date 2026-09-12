const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const engineOnly = app.slice(0, app.indexOf('document.querySelectorAll("[data-view]")'));
const sandbox = { window: {}, document: {}, console };
vm.createContext(sandbox);
vm.runInContext(engineOnly + "\nwindow.CodeRatEngine = { extractRules, analyze, planChanges };", sandbox);
const { extractRules, analyze, planChanges } = sandbox.window.CodeRatEngine;

test("extracts structured rules from plain-language style guidance", () => {
  const rules = extractRules("- Use snake_case for function names.\n- Functions should be less than 3 lines.\n- Do not use console.log.");
  assert.equal(rules.length, 3);
  assert.equal(rules.find((rule) => rule.matcher === "snake-case").autofixable, true);
  assert.equal(rules.find((rule) => rule.matcher === "function-length").limit, 3);
});

test("links violations and safe transformations back to their source rule", () => {
  const rules = extractRules("- Use snake_case for function names.\n- Do not use console.log.");
  const source = "function getUser() {\n  console.log('x');\n}";
  const violations = analyze(rules, source, "src/UserService.ts");
  assert.equal(violations.length, 2);
  assert.ok(violations.every((violation) => violation.ruleId));
  const changes = planChanges(violations, source);
  assert.equal(changes.length, 2);
  assert.match(changes[0].explanation, /Applied because/);
});
