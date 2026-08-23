import assert from "node:assert/strict";
import test from "node:test";

import { createSectionChoices } from "../src/terminal/prompts.js";

function choice(choices, id) {
  return choices.find((item) => item.value === id);
}

test("section choices disable structured sections that have no detected or configured content", () => {
  const choices = createSectionChoices({
    sections: [],
    features: [],
    commands: [],
    projectStructure: [],
    testing: null,
    deployment: null,
    technologies: [],
    languages: [],
    runtime: null,
  });

  for (const id of ["features", "commands", "project-structure", "testing", "deployment", "technology"]) {
    assert.equal(choice(choices, id).disabled, "not detected; add through readme.config.json");
    assert.equal(choice(choices, id).checked, false);
  }
  assert.equal(choice(choices, "architecture").disabled, false);
});

test("section choices keep evidence-backed structured sections selectable", () => {
  const sections = ["commands", "project-structure", "testing", "deployment", "technology"];
  const choices = createSectionChoices({
    sections,
    features: [],
    commands: [{ id: "dev" }],
    projectStructure: [{ path: "src" }],
    testing: { commands: [{ id: "test" }] },
    deployment: { provider: "Netlify", configFile: "netlify.toml" },
    technologies: [{ name: "Astro" }],
    languages: [],
    runtime: null,
  });

  for (const id of sections) {
    assert.equal(choice(choices, id).disabled, false);
    assert.equal(choice(choices, id).checked, true);
  }
});
