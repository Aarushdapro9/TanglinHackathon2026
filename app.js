/* CodeRat: deterministic, local-only compliance MVP. Uploaded code is never executed. */
const state = { rules: [], violations: [], changes: [], selectedChange: null, ranAt: null, postChangeRescan: false, appliedChanges: [] };
const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function ruleFromLine(line, index) {
  const text = line.replace(/^\s*(?:[-*+] |\d+[.)] )/, "").trim();
  if (!text || text.length < 8 || /^#/.test(text)) return null;
  const lower = text.toLowerCase();
  let category = "Convention", severity = "medium", mode = "review", matcher = "manual";
  if (/snake[_ -]?case|camelcase|naming|name functions/.test(lower)) { category = "Naming"; mode = "auto"; matcher = "snake-case"; }
  else if (/console\.log|debugger|print\(/.test(lower)) { category = "Logging"; severity = "low"; mode = "auto"; matcher = "console-log"; }
  else if (/function.{0,30}(less than|fewer than|under|maximum)|method.{0,30}(less than|fewer than|under|maximum)/.test(lower)) { category = "Complexity"; mode = "assisted"; matcher = "function-length"; }
  else if (/service.{0,40}(database|db|persistence)|repository pattern|architecture|dependency injection/.test(lower)) { category = "Architecture"; severity = "high"; matcher = "service-db"; }
  else if (/public api|database|security|migration|serialization/.test(lower)) { category = "Safety"; severity = "high"; matcher = "human-review"; }
  else if (/error|exception|throw|result type/.test(lower)) { category = "Error handling"; mode = "assisted"; matcher = "error-handling"; }
  const match = lower.match(/(?:less than|fewer than|under|maximum of?)\s+(\d+)/);
  const name = text.replace(/[.!]$/, "");
  return { id: matcher + "-" + (slugify(name).slice(0, 34) || index), name, description: text, category, severity, language: "any", examples: [], anti_examples: [], autofixable: mode === "auto", verification_requirements: ["Static re-scan"], mode, matcher, limit: match ? Number(match[1]) : null };
}

function extractRules(guide) {
  const unique = new Map();
  guide.split(/\r?\n/).map(ruleFromLine).filter(Boolean).forEach((rule) => { if (!unique.has(rule.matcher)) unique.set(rule.matcher, rule); });
  return [...unique.values()];
}

function findFunctionBlocks(source) {
  const lines = source.split(/\r?\n/), blocks = [];
  lines.forEach((line, index) => {
    const match = line.match(/(?:function\s+|async\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*(?::[^={]+)?\s*\{/);
    if (!match || /\b(if|for|while|switch|catch)\s*\(/.test(line)) return;
    let depth = 0, end = index;
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      depth += (lines[cursor].match(/\{/g) || []).length - (lines[cursor].match(/\}/g) || []).length;
      if (cursor > index && depth <= 0) { end = cursor; break; }
    }
    blocks.push({ name: match[1], start: index + 1, end: end + 1, lines: end - index + 1 });
  });
  return blocks;
}

function analyze(rules, source, file) {
  const violations = [], lines = source.split(/\r?\n/), functions = findFunctionBlocks(source);
  const add = (rule, line, message, classification, evidence) => violations.push({ id: rule.id + ":" + line + ":" + violations.length, ruleId: rule.id, ruleName: rule.name, file, line, severity: rule.severity, classification, message, evidence, rule });
  rules.forEach((rule) => {
    if (rule.matcher === "snake-case") functions.filter((fn) => !/^[a-z][a-z0-9_]*$/.test(fn.name)).forEach((fn) => add(rule, fn.start, "'" + fn.name + "' does not use snake_case.", "Safe to automatically fix", fn.name));
    if (rule.matcher === "console-log") lines.forEach((line, index) => { if (/\bconsole\.log\s*\(/.test(line)) add(rule, index + 1, "Production logging statement found.", "Safe to automatically fix", line.trim()); });
    if (rule.matcher === "function-length") functions.filter((fn) => rule.limit && fn.lines >= rule.limit).forEach((fn) => add(rule, fn.start, "'" + fn.name + "' is " + fn.lines + " lines; standard limit is " + rule.limit + ".", "AI-assisted fix", fn.lines + " lines"));
    if (rule.matcher === "service-db") lines.forEach((line, index) => { if (/\b(?:db|database)\.(?:query|execute|find|insert|update|delete)\s*\(/.test(line) && /service/i.test(file)) add(rule, index + 1, "Service accesses persistence directly.", "Requires human review", line.trim()); });
  });
  return violations;
}

function toSnakeCase(value) { return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase(); }
function planChanges(violations, source) {
  const lines = source.split(/\r?\n/), changes = [];
  violations.filter((v) => v.classification === "Safe to automatically fix").forEach((v, index) => {
    const before = lines[v.line - 1] || ""; let after = before, title = "";
    if (v.rule.matcher === "snake-case") { const from = v.evidence, to = toSnakeCase(from); after = before.replace(new RegExp("\\b" + from + "\\b", "g"), to); title = "Rename " + from + " to " + to; }
    if (v.rule.matcher === "console-log") { after = ""; title = "Remove production console.log"; }
    if (after === before) return;
    changes.push({ id: "change-" + (index + 1), violation: v, title, before, after, explanation: "Applied because “" + v.rule.name + "” requires " + v.rule.description.toLowerCase().replace(/[.]$/, "") + ". This is safe because the transformation is local and mechanically reversible." });
  });
  return changes;
}

function renderRules() {
  byId("ruleCount").textContent = state.rules.length;
  byId("extractedTitle").textContent = state.rules.length + " rule candidate" + (state.rules.length === 1 ? "" : "s");
  const holder = byId("ruleCards"); holder.innerHTML = "";
  if (!state.rules.length) { holder.innerHTML = '<p class="empty">Paste a guide and extract its first rule set.</p>'; return; }
  state.rules.forEach((rule, index) => {
    const card = byId("ruleCardTemplate").content.cloneNode(true);
    card.querySelector(".rule-number").textContent = "RULE " + String(index + 1).padStart(2, "0");
    const tag = card.querySelector(".tag"); tag.classList.add(rule.mode); tag.textContent = rule.mode === "auto" ? "AUTO-FIX" : rule.mode === "assisted" ? "AI-ASSISTED" : "REVIEW";
    card.querySelector("h3").textContent = rule.name; card.querySelector("p").textContent = rule.description;
    card.querySelector(".rule-meta").textContent = rule.category + " · " + rule.severity + " severity · " + rule.language;
    holder.append(card);
  });
}

function complianceScore(violations) { return Math.max(38, Math.min(100, 100 - violations.length * 7)); }
function renderDashboard() {
  const total = state.violations.length, auto = state.violations.filter((v) => v.classification.includes("Safe")).length, assisted = state.violations.filter((v) => v.classification.includes("AI")).length, review = total - auto - assisted;
  const before = complianceScore(state.violations), after = Math.min(100, before + state.changes.length * 7);
  byId("beforeScore").textContent = state.ranAt ? before + "%" : "—"; byId("afterScore").textContent = state.ranAt ? after + "%" : "—";
  byId("scoreCaption").textContent = state.ranAt ? total + " linked finding" + (total === 1 ? "" : "s") + " across " + state.rules.length + " standards." : "Add a style guide and code to start a compliance scan.";
  [["violationsTotal", total], ["autoTotal", auto], ["assistedTotal", assisted], ["reviewTotal", review]].forEach((entry) => { byId(entry[0]).textContent = entry[1]; });
  byId("analysisTime").textContent = state.ranAt ? state.ranAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "not yet run";
  byId("ruleHealth").innerHTML = state.rules.length ? state.rules.map((rule) => { const found = state.violations.filter((v) => v.ruleId === rule.id).length, score = Math.max(0, 100 - found * 14); return '<div class="rule-health-row"><span>' + escapeHtml(rule.category) + '</span><div class="progress"><i style="width:' + score + '%"></i></div><b>' + score + '%</b></div>'; }).join("") : '<p class="empty">No rules extracted yet.</p>';
  byId("findingRows").innerHTML = total ? state.violations.slice(0, 6).map((v) => '<tr><td>' + escapeHtml(v.ruleName) + '</td><td>' + escapeHtml(v.file) + ':' + v.line + '</td><td><span class="tag ' + (v.classification.includes("Safe") ? "auto" : v.classification.includes("AI") ? "assisted" : "review") + '">' + escapeHtml(v.classification) + '</span></td><td><span class="tag neutral">OPEN</span></td></tr>').join("") : '<tr><td colspan="4" class="empty">Run an analysis to populate the compliance queue.</td></tr>';
  byId("verificationBadge").textContent = state.ranAt ? "STATIC SCAN" : "NOT RUN";
  const postChangeStatus = state.postChangeRescan ? '<div class="verification-item done"><span class="check">✓</span><div><strong>Post-change re-scan</strong><small>Completed after ' + state.appliedChanges.length + ' local application(s)</small></div></div>' : '<div class="verification-item"><span class="check">—</span><div><strong>Post-change re-scan</strong><small>Not run — proposed diffs have not been applied</small></div></div>';
  byId("verificationList").innerHTML = state.ranAt ? '<div class="verification-item done"><span class="check">✓</span><div><strong>Initial style-rule scan</strong><small>Completed against submitted source text</small></div></div>' + postChangeStatus + '<div class="verification-item"><span class="check">—</span><div><strong>Tests, lint & type check</strong><small>Not run — connect an isolated verifier</small></div></div>' : '<p class="empty">Verification begins after analysis.</p>';
}

function renderChangeDetail() {
  const holder = byId("changeDetail"), change = state.changes.find((item) => item.id === state.selectedChange);
  if (!change) { holder.innerHTML = '<div class="empty-detail"><span>⇄</span><h3>Select a proposed change</h3><p>CodeRat will show the rule, a specific explanation, a unified diff, and verification evidence.</p></div>'; return; }
  const diff = '<span class="remove">- ' + escapeHtml(change.before) + '</span><span class="add">+ ' + escapeHtml(change.after) + '</span>';
  holder.innerHTML = '<div class="change-detail-head"><p class="eyebrow">CHANGE #' + change.id.replace("change-", "") + '</p><h3>' + escapeHtml(change.title) + '</h3><p><strong>Rule:</strong> ' + escapeHtml(change.violation.ruleName) + '<br>' + escapeHtml(change.explanation) + '</p><div class="detail-meta"><span class="tag auto">SAFE AUTO-FIX</span><span class="tag neutral">' + escapeHtml(change.violation.file) + ':' + change.violation.line + '</span></div></div><pre class="diff">@@ ' + escapeHtml(change.violation.file) + ':' + change.violation.line + ' @@\n' + diff + '</pre><div class="verification-box"><h4>VERIFICATION</h4><p>✓ Initial static scan completed before this proposal was generated.</p><p class="warning">— NOT VERIFIED: the diff has not been applied or re-scanned; tests, linting, and type checking were not run.</p></div>';
}

function renderChanges() {
  byId("changeCount").textContent = state.changes.length; byId("plannedCount").textContent = state.changes.length + " PLANNED";
  const holder = byId("changeItems");
  holder.innerHTML = state.changes.length ? state.changes.map((change) => '<button class="change-item ' + (state.selectedChange === change.id ? "active" : "") + '" data-change="' + change.id + '"><strong>' + escapeHtml(change.title) + '</strong><span class="tag auto">SAFE AUTO-FIX</span><small>' + escapeHtml(change.violation.file) + ':' + change.violation.line + '</small></button>').join("") : '<p class="empty">Safe transformations appear after analysis.</p>';
  holder.querySelectorAll("[data-change]").forEach((button) => button.addEventListener("click", () => { state.selectedChange = button.dataset.change; renderChanges(); }));
  renderChangeDetail();
}

function activate(view) {
  document.querySelectorAll(".view").forEach((item) => item.classList.toggle("active", item.id === view));
  document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  byId("pageTitle").textContent = ({ dashboard: "Style compliance", rules: "Style guide", repository: "Repository analysis", changes: "Proposed changes" })[view];
}

function runAnalysis() {
  const source = byId("sourceCode").value.trim(), file = byId("filePath").value.trim() || "source.ts";
  if (!state.rules.length) { state.rules = extractRules(byId("guideText").value); renderRules(); }
  if (!source || !state.rules.length) { byId("sourceStatus").textContent = "Add both a guide and source text before analyzing."; activate("repository"); return; }
  state.violations = analyze(state.rules, source, file); state.changes = planChanges(state.violations, source); state.selectedChange = state.changes[0] ? state.changes[0].id : null; state.postChangeRescan = false; state.appliedChanges = []; state.ranAt = new Date();
  byId("sourceStatus").textContent = file + " analyzed locally — " + state.violations.length + " linked finding(s)";
  renderDashboard(); renderChanges(); activate("dashboard");
}

function exportReport() {
  const report = { product: "CodeRat", generated_at: new Date().toISOString(), execution: "No repository code was executed.", rules: state.rules, violations: state.violations.map(({ rule, ...finding }) => finding), proposed_transformations: state.changes, locally_applied_transformations: state.appliedChanges, verification: { initial_static_scan: state.ranAt ? "COMPLETED" : "NOT_RUN", post_change_rescan: state.postChangeRescan ? "COMPLETED" : "NOT_VERIFIED", tests: "NOT_VERIFIED", lint: "NOT_VERIFIED", typecheck: "NOT_VERIFIED" } };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "coderat-compliance-report.json"; link.click(); URL.revokeObjectURL(url);
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => activate(button.dataset.view)));
document.querySelectorAll("[data-view-target]").forEach((button) => button.addEventListener("click", () => activate(button.dataset.viewTarget)));
byId("extractRules").addEventListener("click", () => { state.rules = extractRules(byId("guideText").value); state.violations = []; state.changes = []; state.postChangeRescan = false; state.appliedChanges = []; state.ranAt = null; renderRules(); renderDashboard(); renderChanges(); });
byId("analyzeButton").addEventListener("click", runAnalysis); byId("analyzeHeader").addEventListener("click", runAnalysis); byId("exportReport").addEventListener("click", exportReport);
byId("approveButton").addEventListener("click", () => {
  const change = state.changes.find((item) => item.id === state.selectedChange);
  if (!change) { alert("Select a safe proposed change first."); return; }
  const sourceInput = byId("sourceCode"), source = sourceInput.value, updated = source.replace(change.before, change.after);
  if (updated === source) { alert("The staged source no longer matches this proposal. Run analysis again."); return; }
  sourceInput.value = updated; state.appliedChanges.push(change); state.violations = analyze(state.rules, updated, byId("filePath").value.trim() || "source.ts"); state.changes = planChanges(state.violations, updated); state.selectedChange = state.changes[0] ? state.changes[0].id : null; state.postChangeRescan = true; state.ranAt = new Date();
  byId("sourceStatus").textContent = "Applied locally and re-scanned — no repository file was modified."; renderDashboard(); renderChanges();
});
byId("guideFile").addEventListener("change", (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { byId("guideText").value = reader.result; }; reader.readAsText(file); });
byId("sourceFile").addEventListener("change", (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { byId("sourceCode").value = reader.result; byId("filePath").value = file.name; byId("sourceStatus").textContent = file.name + " loaded locally; ready for analysis."; }; reader.readAsText(file); });
state.rules = extractRules(byId("guideText").value); renderRules(); renderDashboard(); renderChanges();
window.CodeRatEngine = { extractRules, analyze, planChanges, findFunctionBlocks };
