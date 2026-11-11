import { scripts } from "./scripts.js";

const listElement = document.querySelector("#scripts");
const searchInput = document.querySelector("#search");
const tagsElement = document.querySelector("#tags");
const countElement = document.querySelector("#count");
const emptyElement = document.querySelector("#empty");

const filter = { query: "", tag: null };
const cards = scripts.map(buildCard);

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function defaultValues(script) {
  return Object.fromEntries(script.params.map((param) => [param.key, param.default]));
}

function readInput(param, input) {
  if (param.type === "checkbox") return input.checked;
  if (param.type === "number") {
    const number = param.decimals ? Number(input.value) : Math.trunc(Number(input.value));
    const inRange = number >= param.min && number <= (param.max ?? Infinity);
    return input.value !== "" && inRange ? number : param.default;
  }
  return input.value.trim();
}

function buildInput(param, value) {
  if (param.type === "select") {
    const select = el(
      "select",
      {},
      param.options.map(([optionValue, label]) =>
        el("option", { value: optionValue, textContent: label }),
      ),
    );
    select.value = value;
    return select;
  }
  if (param.type === "checkbox") return el("input", { type: "checkbox", checked: value });
  if (param.type === "number")
    return el("input", {
      type: "number",
      min: param.min,
      max: param.max ?? "",
      step: param.decimals ? "any" : 1,
      value,
    });
  return el("input", { type: "text", value, spellcheck: false });
}

function buildField(param, values, onChange) {
  const input = buildInput(param, values[param.key]);
  const error = el("span", {
    className: "field-error",
    textContent: param.error ?? "",
    hidden: true,
  });
  const label = el("span", { className: "field-label", textContent: param.label });
  const field = el(
    "label",
    { className: `field field-${param.type}` },
    param.type === "checkbox" ? [input, label] : [label, input],
  );
  if (param.help) field.append(el("span", { className: "field-help", textContent: param.help }));
  field.append(error);
  input.addEventListener("input", () => {
    values[param.key] = readInput(param, input);
    onChange();
  });
  // An out-of-range number falls back to the default: show the value the code really uses.
  if (param.type === "number") {
    input.addEventListener("change", () => (input.value = values[param.key]));
  }
  return { param, field, error };
}

function invalidParams(script, values) {
  return script.params.filter(
    (param) => param.pattern && isVisible(param, values) && !param.pattern.test(values[param.key]),
  );
}

function isVisible(param, values) {
  return !param.showIf || param.showIf(values);
}

// Fallback for browsers or embedded views that deny the async clipboard API.
function copyWithSelection(text) {
  const textarea = el("textarea", { value: text, className: "offscreen" });
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyWithSelection(text);
  }
}

async function copyStep(button, lines) {
  const oneLine = lines.map((line) => line.trim()).join(" ");
  const copied = await copyText(oneLine);
  button.textContent = copied ? "Copiado ✓" : "No se pudo copiar";
  setTimeout(() => (button.textContent = "Copiar"), 1500);
}

function buildStep(step, index, disabled) {
  const button = el("button", {
    type: "button",
    className: "copy",
    textContent: "Copiar",
    disabled,
  });
  button.addEventListener("click", () => copyStep(button, step.code));
  return el("section", { className: "step" }, [
    el("div", { className: "step-head" }, [
      el("h3", { textContent: `${index + 1}. ${step.title}` }),
      button,
    ]),
    el("p", { className: "step-note", textContent: step.note }),
    el("pre", {}, [el("code", { textContent: step.code.join("\n") })]),
  ]);
}

function buildCard(script) {
  const values = defaultValues(script);
  const stepsElement = el("div", { className: "steps" });

  function renderSteps() {
    const invalid = invalidParams(script, values);
    for (const { param, field, error } of fields) {
      field.hidden = !isVisible(param, values);
      error.hidden = !invalid.includes(param);
    }
    stepsElement.replaceChildren(
      ...script.steps(values).map((step, index) => buildStep(step, index, invalid.length > 0)),
    );
  }

  const fields = script.params.map((param) => buildField(param, values, renderSteps));
  renderSteps();

  const element = el("article", { className: "card", id: script.id }, [
    el("h2", { textContent: script.title }),
    el(
      "ul",
      { className: "card-tags" },
      script.tags.map((tag) => el("li", { textContent: tag })),
    ),
    el("p", { className: "summary", textContent: script.summary }),
    el(
      "form",
      { className: "params", onsubmit: (event) => event.preventDefault() },
      fields.map(({ field }) => field),
    ),
    stepsElement,
    el("p", {
      className: "copy-hint",
      textContent: "Cada paso se copia en una sola línea, como la pide la consola.",
    }),
    el(
      "ul",
      { className: "warnings" },
      script.warnings.map((warning) => el("li", { textContent: warning })),
    ),
  ]);

  const haystack = normalize([script.title, script.summary, ...script.tags].join(" "));
  return { script, element, haystack };
}

function matchesFilter(card) {
  const words = normalize(filter.query).split(/\s+/).filter(Boolean);
  const matchesQuery = words.every((word) => card.haystack.includes(word));
  const matchesTag = !filter.tag || card.script.tags.includes(filter.tag);
  return matchesQuery && matchesTag;
}

function applyFilter() {
  let visible = 0;
  for (const card of cards) {
    const shown = matchesFilter(card);
    card.element.hidden = !shown;
    if (shown) visible += 1;
  }
  countElement.textContent = `${visible} de ${cards.length} ${cards.length === 1 ? "script" : "scripts"}`;
  emptyElement.hidden = visible > 0;
  for (const button of tagsElement.children) {
    button.setAttribute("aria-pressed", String(button.dataset.tag === (filter.tag ?? "")));
  }
}

function buildTagButton(tag, label) {
  const button = el("button", { type: "button", className: "tag", textContent: label });
  button.dataset.tag = tag;
  button.addEventListener("click", () => {
    filter.tag = tag || null;
    applyFilter();
  });
  return button;
}

const allTags = [...new Set(scripts.flatMap((script) => script.tags))].sort((a, b) =>
  a.localeCompare(b, "es"),
);
tagsElement.append(buildTagButton("", "Todos"), ...allTags.map((tag) => buildTagButton(tag, tag)));
listElement.append(...cards.map((card) => card.element));
searchInput.addEventListener("input", () => {
  filter.query = searchInput.value;
  applyFilter();
});
applyFilter();
