const deckSelect = document.querySelector("#deck-select");
const studyArea = document.querySelector("#study-area");
const statusEl = document.querySelector("#connection-status");
const fileInput = document.querySelector("#file-input");
const downloadButton = document.querySelector("#download-button");

let serverDecks = new Map();
let localDecks = new Map();
let activeDeck = null;
let activeDeckKey = "";
let mode = "overview";
let cardIndex = 0;
let isFlipped = false;
let answered = false;

function normalizeDeck(raw, fallbackTitle = "Untitled deck") {
  if (!raw || !Array.isArray(raw.cards)) {
    throw new Error("The JSON needs a cards array.");
  }

  const cards = raw.cards.map((item, index) => {
    const question = item.question ?? item.front ?? item.q;
    const answer = item.answer ?? item.back ?? item.a;

    if (question == null || answer == null) {
      throw new Error(`Card ${index + 1} needs a question and an answer.`);
    }

    return {
      question: String(question),
      answer: String(answer),
      choices: Array.isArray(item.choices) ? item.choices.map(String) : []
    };
  });

  return {
    title: String(raw.title || fallbackTitle),
    cards
  };
}

async function refreshServerDecks() {
  try {
    const response = await fetch("/api/decks", { cache: "no-store" });
    if (!response.ok) throw new Error("Deck server unavailable");

    const files = await response.json();
    serverDecks = new Map(files.map(file => [file.name, file]));
    statusEl.textContent = `${serverDecks.size} folder deck${serverDecks.size === 1 ? "" : "s"} detected`;
    updateDeckOptions();
  } catch {
    statusEl.textContent = "Folder scanning unavailable — import a JSON file";
  }
}

function updateDeckOptions() {
  const previous = deckSelect.value;
  deckSelect.replaceChildren();

  for (const [name, info] of serverDecks) {
    const option = document.createElement("option");
    option.value = `server:${name}`;
    option.textContent = info.title || name;
    deckSelect.append(option);
  }

  for (const [id, deck] of localDecks) {
    const option = document.createElement("option");
    option.value = `local:${id}`;
    option.textContent = `${deck.title} (imported)`;
    deckSelect.append(option);
  }

  if (!deckSelect.options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No decks yet";
    deckSelect.append(option);
  }

  const stillAvailable = [...deckSelect.options].some(option => option.value === previous);
  deckSelect.value = stillAvailable ? previous : deckSelect.options[0].value;

  if (deckSelect.value) loadSelectedDeck();
  else showEmptyState("Add a deck to begin", "Drop a .json file into the decks folder or import one above.");
}

async function loadSelectedDeck() {
  const key = deckSelect.value;
  if (!key) return;

  try {
    if (key.startsWith("local:")) {
      activeDeck = localDecks.get(key.slice(6));
    } else {
      const filename = key.slice(7);
      const response = await fetch(`/api/decks/${encodeURIComponent(filename)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load that deck.");
      activeDeck = normalizeDeck(await response.json(), filename);
    }

    activeDeckKey = key;
    cardIndex = 0;
    isFlipped = false;
    answered = false;
    render();
  } catch (error) {
    showEmptyState("Could not load deck", error.message);
  }
}

function setMode(nextMode) {
  mode = nextMode;
  document.querySelectorAll(".mode-tab").forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  cardIndex = 0;
  isFlipped = false;
  answered = false;
  render();
}

function render() {
  if (!activeDeck || activeDeck.cards.length === 0) {
    showEmptyState("This deck is empty", "Add at least one question-and-answer card to the JSON file.");
    return;
  }

  if (mode === "overview") renderOverview();
  if (mode === "flashcard") renderFlashcard();
  if (mode === "multiple") renderMultipleChoice();
}

function showEmptyState(title, message) {
  studyArea.innerHTML = "";
  const box = document.createElement("div");
  box.className = "empty-state";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const text = document.createElement("p");
  text.textContent = message;
  box.append(heading, text);
  studyArea.append(box);
}

function renderOverview() {
  studyArea.innerHTML = `
    <div class="panel">
      <div class="panel-heading">
        <h2>${escapeHtml(activeDeck.title)}</h2>
        <span class="muted">${activeDeck.cards.length} cards</span>
      </div>
      <div class="overview-list"></div>
    </div>`;

  const list = studyArea.querySelector(".overview-list");
  activeDeck.cards.forEach((card, index) => {
    const item = document.createElement("article");
    item.className = "overview-card";

    const question = document.createElement("h3");
    question.textContent = `${index + 1}. ${card.question}`;
    const answer = document.createElement("p");
    answer.textContent = card.answer;

    item.append(question, answer);
    list.append(item);
  });
}

function progressMarkup() {
  const count = activeDeck.cards.length;
  const percent = ((cardIndex + 1) / count) * 100;
  return `
    <div class="progress-row">
      <span>Card ${cardIndex + 1} of ${count}</span>
      <span>${Math.round(percent)}%</span>
    </div>
    <div class="progress-track" aria-hidden="true">
      <div class="progress-fill" style="width:${percent}%"></div>
    </div>`;
}

function renderFlashcard() {
  const card = activeDeck.cards[cardIndex];

  studyArea.innerHTML = `
    <div class="panel">
      ${progressMarkup()}
      <div class="flashcard-wrap">
        <button class="flashcard ${isFlipped ? "is-flipped" : ""}" type="button"
          aria-label="${isFlipped ? "Answer" : "Question"}: ${escapeHtml(isFlipped ? card.answer : card.question)}. Activate to flip.">
          <span class="flashcard-face flashcard-front">
            <span class="face-label">Question · tap to flip</span>
            <span>${escapeHtml(card.question)}</span>
          </span>
          <span class="flashcard-face flashcard-back">
            <span class="face-label">Answer</span>
            <span>${escapeHtml(card.answer)}</span>
          </span>
        </button>
      </div>
      <div class="card-actions">
        <button class="button button-secondary" type="button" data-action="previous">Previous</button>
        <button class="button button-primary" type="button" data-action="next">
          ${cardIndex === activeDeck.cards.length - 1 ? "Start over" : "Next card"}
        </button>
      </div>
    </div>`;

  studyArea.querySelector(".flashcard").addEventListener("click", () => {
    isFlipped = !isFlipped;
    renderFlashcard();
  });

  studyArea.querySelector('[data-action="previous"]').addEventListener("click", () => {
    cardIndex = (cardIndex - 1 + activeDeck.cards.length) % activeDeck.cards.length;
    isFlipped = false;
    renderFlashcard();
  });

  studyArea.querySelector('[data-action="next"]').addEventListener("click", () => {
    cardIndex = (cardIndex + 1) % activeDeck.cards.length;
    isFlipped = false;
    renderFlashcard();
  });
}

function optionsFor(card) {
  const supplied = card.choices.length
    ? card.choices
    : [card.answer, ...activeDeck.cards
        .filter(item => item.answer !== card.answer)
        .map(item => item.answer)];

  const unique = [...new Set(supplied)];
  if (!unique.some(option => option.trim() === card.answer.trim())) unique.unshift(card.answer);

  return shuffle(unique).slice(0, 4);
}

function renderMultipleChoice() {
  const card = activeDeck.cards[cardIndex];
  const choices = optionsFor(card);

  studyArea.innerHTML = `
    <div class="panel">
      ${progressMarkup()}
      <div class="panel-heading"><h2>Choose the correct answer</h2></div>
      <p class="question-text">${escapeHtml(card.question)}</p>
      <div class="choices"></div>
      <p class="feedback" role="status"></p>
      <div class="card-actions">
        <button class="button button-secondary" type="button" data-action="previous">Previous</button>
        <button class="button button-primary" type="button" data-action="next">
          ${cardIndex === activeDeck.cards.length - 1 ? "Start over" : "Next question"}
        </button>
      </div>
    </div>`;

  const choicesBox = studyArea.querySelector(".choices");
  const feedback = studyArea.querySelector(".feedback");

  choices.forEach(choiceText => {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.textContent = choiceText;
    button.addEventListener("click", () => {
      if (answered) return;
      answered = true;

      const correct = choiceText.trim() === card.answer.trim();
      button.classList.add(correct ? "correct" : "incorrect");
      feedback.textContent = correct ? "Correct!" : `Not quite. Answer: ${card.answer}`;
      feedback.classList.add(correct ? "good" : "bad");

      choicesBox.querySelectorAll("button").forEach(item => {
        item.disabled = true;
        if (item.textContent.trim() === card.answer.trim()) item.classList.add("correct");
      });
    });
    choicesBox.append(button);
  });

  studyArea.querySelector('[data-action="previous"]').addEventListener("click", () => {
    cardIndex = (cardIndex - 1 + activeDeck.cards.length) % activeDeck.cards.length;
    answered = false;
    renderMultipleChoice();
  });

  studyArea.querySelector('[data-action="next"]').addEventListener("click", () => {
    cardIndex = (cardIndex + 1) % activeDeck.cards.length;
    answered = false;
    renderMultipleChoice();
  });
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

deckSelect.addEventListener("change", loadSelectedDeck);

document.querySelectorAll(".mode-tab").forEach(button => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

fileInput.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const deck = normalizeDeck(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ""));
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localDecks.set(id, deck);
    updateDeckOptions();
    deckSelect.value = `local:${id}`;
    await loadSelectedDeck();
    statusEl.textContent = `Imported ${file.name}`;
  } catch (error) {
    statusEl.textContent = `Import failed: ${error.message}`;
  }

  fileInput.value = "";
});

downloadButton.addEventListener("click", () => {
  if (!activeDeck) return;

  const blob = new Blob([JSON.stringify(activeDeck, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${activeDeck.title.replace(/[^a-z0-9-_]+/gi, "-") || "flashcards"}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

refreshServerDecks();
setInterval(refreshServerDecks, 15000);
