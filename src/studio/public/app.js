const $ = id => document.getElementById(id);
const fragment = location.hash.slice(1);
const token = /^[a-f0-9]{48}$/.test(fragment) ? fragment : sessionStorage.getItem("studio-token") || "";
if (token) sessionStorage.setItem("studio-token", token);
let currentView = "rendered";
let ready = false;

function setView(view) {
  currentView = view;
  for (const name of ["rendered", "markdown"]) {
    const selected = name === view;
    $(`${name}-tab`).setAttribute("aria-selected", String(selected));
    $(`${name}-tab`).tabIndex = selected ? 0 : -1;
    $(name).hidden = !selected || !ready;
  }
}
for (const name of ["rendered", "markdown"]) {
  $(`${name}-tab`).addEventListener("click", () => setView(name));
  $(`${name}-tab`).addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "rendered" : event.key === "End" ? "markdown" : name === "rendered" ? "markdown" : "rendered";
    setView(next);
    $(`${next}-tab`).focus();
  });
}

async function scan() {
  $("refresh").disabled = true;
  $("error").hidden = true;
  $("loading").hidden = false;
  $("status").textContent = "Scanning repository…";
  ready = false;
  setView(currentView);
  $("diagnostics").hidden = true;
  $("media-note").hidden = true;
  try {
    const response = await fetch("/api/studio", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      if (response.status === 403) throw new Error("Open the complete Studio URL printed in your terminal, including the part after #.");
      const problem = await response.json();
      throw new Error(problem.error || "Could not load the preview.");
    }
    const data = await response.json();
    $("repository").textContent = data.repository;
    $("scan-summary").textContent = `${data.facts.length} facts shown · ${data.filesScanned} files scanned`;
    $("facts").replaceChildren(...data.facts.map(fact => {
      const row = document.createElement("div");
      const term = document.createElement("dt"); term.textContent = fact.label;
      const value = document.createElement("dd"); value.textContent = fact.value;
      const source = document.createElement("dd"); source.className = "evidence"; source.textContent = fact.source;
      row.append(term, value, source); return row;
    }));
    // Only server-rendered markdown-it output enters this container. Raw HTML is disabled.
    $("rendered").innerHTML = data.html;
    $("source").textContent = data.markdown;
    $("scan-time").textContent = `Scanned ${new Date(data.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    $("config").textContent = data.config ? `Using ${data.config}` : "Using detected defaults";
    const messages = [...data.errors.map(x => `Error: ${x}`), ...data.warnings.map(x => `Warning: ${x}`)];
    $("messages").replaceChildren(...messages.map(message => { const li = document.createElement("li"); li.textContent = message; return li; }));
    $("diagnostics").hidden = messages.length === 0;
    $("diagnostics").open = data.errors.length > 0;
    $("diagnostic-summary").textContent = `${messages.length} review ${messages.length === 1 ? "note" : "notes"}`;
    $("status").textContent = `${messages.length ? "Review notes below" : "Ready to review"} · ${data.errors.length} errors · ${data.warnings.length} warnings`;
    $("media-note").hidden = false;
    ready = true;
    setView(currentView);
  } catch (error) {
    $("error").textContent = `${error.message} Rescan to try again. If Studio has stopped, restart it from your terminal.`;
    $("error").hidden = false;
    $("status").textContent = "Preview unavailable";
  } finally {
    $("loading").hidden = true;
    $("refresh").disabled = false;
  }
}
$("refresh").addEventListener("click", scan);
scan();
