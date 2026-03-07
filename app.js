const titleInput = document.getElementById("titleInput");
const searchBtn = document.getElementById("searchBtn");
const retryBtn = document.getElementById("retryBtn");
const retryStatus = document.getElementById("retryStatus");
const resultList = document.getElementById("resultList");
const bibtexOutput = document.getElementById("bibtexOutput");
const copyBtn = document.getElementById("copyBtn");

let currentBibtex = "";
let selectedIndex = -1;
let currentResults = [];

const MAX_RESULTS = 20;
const RETRY_INTERVAL_MS = 2000;

let retryTimer = null;
let retryAttempt = 0;
let retryRunning = false;

function setRetryStatus(text) {
  retryStatus.textContent = text;
}

function updateRetryButton() {
  retryBtn.textContent = retryRunning ? "停止循环" : "循环搜索";
}

function stopRetryLoop(message = "") {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryRunning = false;
  retryAttempt = 0;
  updateRetryButton();
  setRetryStatus(message);
}

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(query, candidate) {
  const q = normalizeText(query);
  const c = normalizeText(candidate);
  if (!q || !c) return 0;

  if (c === q) return 1;
  if (c.includes(q)) return 0.95;

  const qTokens = q.split(" ");
  const cTokens = new Set(c.split(" "));
  let matched = 0;

  for (const token of qTokens) {
    if (cTokens.has(token)) matched += 1;
  }

  const tokenScore = matched / qTokens.length;

  const lenDiff = Math.abs(c.length - q.length);
  const lenPenalty = Math.min(lenDiff / Math.max(c.length, q.length), 1) * 0.25;

  return Math.max(tokenScore - lenPenalty, 0);
}

function getBibtexUrl(hitInfo) {
  if (!hitInfo) return null;
  if (hitInfo.url) return `${hitInfo.url}.bib`;
  if (hitInfo.key) return `https://dblp.org/rec/${hitInfo.key}.bib`;
  return null;
}

function renderResults(results, query) {
  resultList.innerHTML = "";
  selectedIndex = -1;
  currentResults = results
    .map((item) => ({
      item,
      score: similarityScore(query, item.info?.title || ""),
    }))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);

  if (currentResults.length === 0) {
    resultList.innerHTML = "<li>没有找到候选结果。</li>";
    return;
  }

  currentResults.forEach((entry, index) => {
    const info = entry.info || {};
    const li = document.createElement("li");
    li.className = "result-item";
    li.dataset.index = String(index);

    const title = document.createElement("div");
    title.className = "result-title";
    title.innerHTML = info.title || "(无标题)";

    const authors = Array.isArray(info.authors?.author)
      ? info.authors.author.map((a) => a.text).join(", ")
      : info.authors?.author?.text || "未知作者";

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.textContent = `${authors} | ${info.venue || "Unknown Venue"} | ${info.year || "Unknown Year"}`;

    li.appendChild(title);
    li.appendChild(meta);
    li.addEventListener("click", () => selectResult(index));

    resultList.appendChild(li);
  });
}

function setStatus(text, isError = false) {
  bibtexOutput.textContent = text;
  bibtexOutput.classList.toggle("error", isError);
}

async function searchByTitle() {
  const query = titleInput.value.trim();
  if (!query) {
    setStatus("请先输入论文标题。", true);
    return false;
  }

  setStatus("正在搜索候选论文...");
  copyBtn.disabled = true;
  currentBibtex = "";

  const url = `/api/search?q=${encodeURIComponent(query)}&h=${MAX_RESULTS}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const hits = data?.result?.hits?.hit;
    const list = Array.isArray(hits) ? hits : hits ? [hits] : [];

    renderResults(list, query);

    if (list.length > 0) {
      setStatus("已找到候选结果，请点击其中一篇以加载 BibTeX。", false);
      return true;
    } else {
      setStatus("没有搜索到结果，请调整关键词。", true);
      return false;
    }
  } catch (error) {
    setStatus(`搜索失败：${error.message}`, true);
    return false;
  }
}

async function runRetrySearch() {
  if (!retryRunning) {
    return;
  }

  retryAttempt += 1;
  setRetryStatus(`循环搜索中：第 ${retryAttempt} 次尝试，间隔 ${RETRY_INTERVAL_MS / 1000} 秒。`);

  const success = await searchByTitle();
  if (!retryRunning) {
    return;
  }

  if (success) {
    stopRetryLoop(`循环搜索已成功，在第 ${retryAttempt} 次尝试找到结果。`);
    return;
  }

  retryTimer = setTimeout(runRetrySearch, RETRY_INTERVAL_MS);
}

function toggleRetryLoop() {
  if (retryRunning) {
    stopRetryLoop("循环搜索已停止。");
    return;
  }

  if (!titleInput.value.trim()) {
    setStatus("请先输入论文标题。", true);
    return;
  }

  retryRunning = true;
  retryAttempt = 0;
  updateRetryButton();
  runRetrySearch();
}

async function selectResult(index) {
  selectedIndex = index;
  [...resultList.children].forEach((el, idx) => {
    el.classList.toggle("selected", idx === index);
  });

  const info = currentResults[index]?.info;
  const bibtexUrl = getBibtexUrl(info);

  if (!bibtexUrl) {
    setStatus("未找到该条目的 BibTeX 地址。", true);
    return;
  }

  setStatus("正在获取 BibTeX...");

  try {
    const response = await fetch(`/api/bib?url=${encodeURIComponent(bibtexUrl)}`);
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error || `HTTP ${response.status}`);
    }

    const text = await response.text();
    currentBibtex = text.trim();
    setStatus(currentBibtex || "返回为空。", false);
    copyBtn.disabled = !currentBibtex;
  } catch (error) {
    setStatus(`获取 BibTeX 失败：${error.message}`, true);
    copyBtn.disabled = true;
  }
}

async function copyBibtex() {
  if (!currentBibtex) return;

  try {
    await navigator.clipboard.writeText(currentBibtex);
    const prev = copyBtn.textContent;
    copyBtn.textContent = "已复制";
    setTimeout(() => {
      copyBtn.textContent = prev;
    }, 1200);
  } catch {
    setStatus("复制失败，请手动复制下方文本。", true);
  }
}

searchBtn.addEventListener("click", searchByTitle);
retryBtn.addEventListener("click", toggleRetryLoop);
titleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchByTitle();
  }
});
copyBtn.addEventListener("click", copyBibtex);
updateRetryButton();
