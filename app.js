const titleInput = document.getElementById("titleInput");
const searchBtn = document.getElementById("searchBtn");
const retryBtn = document.getElementById("retryBtn");
const retryStatus = document.getElementById("retryStatus");
const venueInput = document.getElementById("venueInput");
const venueSearchBtn = document.getElementById("venueSearchBtn");
const retryVenueBtn = document.getElementById("retryVenueBtn");
const venueStatus = document.getElementById("venueStatus");
const retryBibBtn = document.getElementById("retryBibBtn");
const retryBibStatus = document.getElementById("retryBibStatus");
const resultList = document.getElementById("resultList");
const bibtexOutput = document.getElementById("bibtexOutput");
const copyBtn = document.getElementById("copyBtn");

let currentBibtex = "";
let selectedIndex = -1;
let currentResults = [];

const MAX_RESULTS = 20;
const RETRY_INTERVAL_MS = 2000;
const BIB_RETRY_INTERVAL_MS = 2000;

let retryTimer = null;
let retryAttempt = 0;
let retryRunning = false;
let venueRetryTimer = null;
let venueRetryAttempt = 0;
let venueRetryRunning = false;
let bibRetryTimer = null;
let bibRetryAttempt = 0;
let bibRetryRunning = false;

function setRetryStatus(text) {
  retryStatus.textContent = text;
}

function setRetryBibStatus(text) {
  retryBibStatus.textContent = text;
}

function setVenueStatus(text) {
  venueStatus.textContent = text;
}

function updateRetryButton() {
  retryBtn.textContent = retryRunning ? "停止循环" : "循环搜索";
}

function updateRetryBibButton() {
  retryBibBtn.textContent = bibRetryRunning ? "停止获取BibTeX" : "循环获取BibTeX";
}

function updateRetryVenueButton() {
  retryVenueBtn.textContent = venueRetryRunning ? "停止循环查询" : "循环查询";
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

function stopVenueRetryLoop(message = "") {
  if (venueRetryTimer) {
    clearTimeout(venueRetryTimer);
    venueRetryTimer = null;
  }
  venueRetryRunning = false;
  venueRetryAttempt = 0;
  updateRetryVenueButton();
  setVenueStatus(message);
}

function stopBibRetryLoop(message = "") {
  if (bibRetryTimer) {
    clearTimeout(bibRetryTimer);
    bibRetryTimer = null;
  }
  bibRetryRunning = false;
  bibRetryAttempt = 0;
  updateRetryBibButton();
  setRetryBibStatus(message);
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

function renderResults(results, query, sortBySimilarity = true) {
  resultList.innerHTML = "";
  selectedIndex = -1;
  if (sortBySimilarity) {
    currentResults = results
      .map((item) => ({
        item,
        score: similarityScore(query, item.info?.title || ""),
      }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);
  } else {
    currentResults = results;
  }

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

  stopBibRetryLoop("");
  stopVenueRetryLoop("");
  setVenueStatus("");
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

async function searchByVenue() {
  const query = venueInput.value.trim();
  if (!query) {
    setVenueStatus("请先输入会议/期刊名称（可带年份）。");
    setStatus("请先输入会议/期刊名称。", true);
    return false;
  }

  stopVenueRetryLoop("");
  setRetryStatus("");
  stopRetryLoop("");
  stopBibRetryLoop("");
  setStatus("正在查询会议/期刊论文列表...");
  setVenueStatus("正在拉取结果，会议/期刊查询可能需要更久。");
  copyBtn.disabled = true;
  currentBibtex = "";

  const url = `/api/venue?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const list = Array.isArray(data?.hit) ? data.hit : [];
    renderResults(list, "", false);

    if (list.length > 0) {
      const yearText = data.year ? ` ${data.year}` : "";
      setVenueStatus(`已获取 ${list.length} 篇：${data.venue}${yearText}`);
      setStatus("会议/期刊查询完成，请点击某篇查看 BibTeX。", false);
      return true;
    }

    setVenueStatus("没有匹配结果，请尝试更精确的会议/期刊名称或年份。");
    setStatus("会议/期刊查询无结果。", true);
    return false;
  } catch (error) {
    setVenueStatus(`查询失败：${error.message}`);
    setStatus(`会议/期刊查询失败：${error.message}`, true);
    return false;
  }
}

async function runVenueRetrySearch() {
  if (!venueRetryRunning) {
    return;
  }

  const query = venueInput.value.trim();
  if (!query) {
    stopVenueRetryLoop("请先输入会议/期刊名称（可带年份）。");
    return;
  }

  venueRetryAttempt += 1;
  setVenueStatus(`循环查询中：第 ${venueRetryAttempt} 次尝试，间隔 ${RETRY_INTERVAL_MS / 1000} 秒。`);

  const success = await searchByVenueLoopAttempt();
  if (!venueRetryRunning) {
    return;
  }

  if (success) {
    stopVenueRetryLoop(`循环查询已成功，在第 ${venueRetryAttempt} 次尝试拿到结果。`);
    return;
  }

  venueRetryTimer = setTimeout(runVenueRetrySearch, RETRY_INTERVAL_MS);
}

async function searchByVenueLoopAttempt() {
  const query = venueInput.value.trim();
  if (!query) {
    return false;
  }

  stopRetryLoop("");
  stopBibRetryLoop("");
  setStatus("正在查询会议/期刊论文列表...");
  copyBtn.disabled = true;
  currentBibtex = "";

  const url = `/api/venue?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const list = Array.isArray(data?.hit) ? data.hit : [];
    renderResults(list, "", false);

    if (list.length > 0) {
      setStatus("会议/期刊查询完成，请点击某篇查看 BibTeX。", false);
      return true;
    }

    setStatus("会议/期刊查询无结果。", true);
    return false;
  } catch (error) {
    setStatus(`会议/期刊查询失败：${error.message}`, true);
    return false;
  }
}

function toggleVenueRetryLoop() {
  if (venueRetryRunning) {
    stopVenueRetryLoop("循环查询已停止。");
    return;
  }

  if (!venueInput.value.trim()) {
    setVenueStatus("请先输入会议/期刊名称（可带年份）。");
    setStatus("请先输入会议/期刊名称。", true);
    return;
  }

  setRetryStatus("");
  stopRetryLoop("");
  stopBibRetryLoop("");
  venueRetryRunning = true;
  venueRetryAttempt = 0;
  updateRetryVenueButton();
  runVenueRetrySearch();
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
  stopBibRetryLoop("");
  selectedIndex = index;
  [...resultList.children].forEach((el, idx) => {
    el.classList.toggle("selected", idx === index);
  });

  const info = currentResults[index]?.info;
  await fetchBibtexForInfo(info);
}

async function fetchBibtexForInfo(info) {
  const bibtexUrl = getBibtexUrl(info);
  if (!bibtexUrl) {
    setStatus("未找到该条目的 BibTeX 地址。", true);
    return false;
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
    return Boolean(currentBibtex);
  } catch (error) {
    setStatus(`获取 BibTeX 失败：${error.message}`, true);
    copyBtn.disabled = true;
    return false;
  }
}

async function runBibRetryFetch() {
  if (!bibRetryRunning) {
    return;
  }

  const info = currentResults[selectedIndex]?.info;
  if (!info) {
    stopBibRetryLoop("请先在候选列表中选择论文。");
    return;
  }

  bibRetryAttempt += 1;
  setRetryBibStatus(`循环获取中：第 ${bibRetryAttempt} 次尝试，间隔 ${BIB_RETRY_INTERVAL_MS / 1000} 秒。`);

  const success = await fetchBibtexForInfo(info);
  if (!bibRetryRunning) {
    return;
  }

  if (success) {
    stopBibRetryLoop(`BibTeX 获取成功（第 ${bibRetryAttempt} 次尝试）。`);
    return;
  }

  bibRetryTimer = setTimeout(runBibRetryFetch, BIB_RETRY_INTERVAL_MS);
}

function toggleBibRetryLoop() {
  if (bibRetryRunning) {
    stopBibRetryLoop("循环获取已停止。");
    return;
  }

  if (selectedIndex < 0 || !currentResults[selectedIndex]) {
    setStatus("请先在候选列表中选择论文。", true);
    return;
  }

  bibRetryRunning = true;
  bibRetryAttempt = 0;
  updateRetryBibButton();
  runBibRetryFetch();
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
venueSearchBtn.addEventListener("click", searchByVenue);
retryVenueBtn.addEventListener("click", toggleVenueRetryLoop);
retryBibBtn.addEventListener("click", toggleBibRetryLoop);
titleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchByTitle();
  }
});
venueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchByVenue();
  }
});
copyBtn.addEventListener("click", copyBibtex);
updateRetryButton();
updateRetryVenueButton();
updateRetryBibButton();
