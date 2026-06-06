import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");

const PORT = Number(process.env.PORT || 8787);
const MARKET_URL = "https://dps.psx.com.pk/";
const BROKERS_URL =
  "https://www.psx.com.pk/psx/resources-and-tools/investors/top-10-brokers";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const COMPANY_UNIVERSE = [
  ["OGDC", "Oil & Gas Development Company Limited"],
  ["PPL", "Pakistan Petroleum Limited"],
  ["MARI", "Mari Energies Limited"],
  ["UBL", "United Bank Limited"],
  ["MCB", "MCB Bank Limited"],
  ["HBL", "Habib Bank Limited"],
  ["MEBL", "Meezan Bank Limited"],
  ["BAHL", "Bank AL Habib Limited"],
  ["FFC", "Fauji Fertilizer Company Limited"],
  ["EFERT", "Engro Fertilizers Limited"],
  ["LUCK", "Lucky Cement Limited"],
  ["DGKC", "D.G. Khan Cement Company Limited"],
  ["MLCF", "Maple Leaf Cement Factory Limited"],
  ["SYS", "Systems Limited"],
  ["TRG", "TRG Pakistan Limited"],
  ["AIRLINK", "Air Link Communication Limited"],
  ["SAZEW", "Sazgar Engineering Works Limited"],
  ["SEARL", "The Searle Company Limited"],
  ["PSO", "Pakistan State Oil Company Limited"],
  ["SNGP", "Sui Northern Gas Pipelines Limited"],
  ["HUBC", "The Hub Power Company Limited"],
  ["ENGROH", "Engro Holdings Limited"],
  ["FABL", "Faysal Bank Limited"],
  ["NML", "Nishat Mills Limited"],
  ["ILP", "Interloop Limited"],
  ["FCCL", "Fauji Cement Company Limited"],
  ["CNERGY", "Cnergyico PK Limited"],
  ["TREET", "Treet Corporation Limited"],
  ["KTML", "Kohinoor Textile Mills Limited"],
  ["PSX", "Pakistan Stock Exchange Limited"],
];

const FALLBACK_BROKERS = [
  "AKD Securities Limited",
  "Arif Habib Limited",
  "JS Global Capital Limited",
  "Topline Securities Limited",
  "Foundation Securities (Private) Limited",
  "Ktrade Securities Limited",
  "BMA Capital Management Limited",
  "Integrated Equities Limited",
  "Abbasi & Company (Pvt) Limited",
  "Chase Securities Pakistan (Private) Limited",
].map((name) => ({
  name,
  category: "Pakistan Stock Exchange top broker ranking",
}));

const FALLBACK_STOCKS = [
  ["MARI", "Mari Energies Limited", 654.25, 2.8, 18.7, 86.4, 1220000, 7.2],
  ["SAZEW", "Sazgar Engineering Works Limited", 1288.4, 1.7, 22.1, 79.6, 642000, 11.8],
  ["OGDC", "Oil & Gas Development Company Limited", 320.31, -1.31, 13.95, 52.56, 2032744, 8.2],
  ["PPL", "Pakistan Petroleum Limited", 219.6, 0.9, 11.8, 49.9, 1880000, 7.9],
  ["UBL", "United Bank Limited", 405.2, 0.7, 10.5, 43.2, 870000, 6.4],
  ["FFC", "Fauji Fertilizer Company Limited", 362.7, 0.3, 8.8, 38.4, 910000, 6.9],
  ["LUCK", "Lucky Cement Limited", 434.1, 1.1, 9.3, 36.8, 780000, 9.1],
  ["SYS", "Systems Limited", 612.8, 2.2, 7.5, 35.6, 650000, 17.8],
  ["MEBL", "Meezan Bank Limited", 328.4, 0.4, 6.2, 31.4, 1040000, 5.8],
  ["AIRLINK", "Air Link Communication Limited", 153.8, 1.5, 14.6, 29.3, 1400000, 12.5],
].map(([symbol, name, price, changePct, ytd, oneYear, volume, pe]) =>
  normalizeStock({ symbol, name, price, changePct, ytd, oneYear, volume, pe }),
);

const cache = new Map();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function sendFile(req, res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const isAsset = filePath.includes(`${path.sep}assets${path.sep}`);

  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return false;
  }

  let requestedPath;
  try {
    requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  } catch {
    return false;
  }

  const filePath = path.resolve(DIST_DIR, `.${requestedPath}`);
  const isInsideDist = filePath === DIST_DIR || filePath.startsWith(`${DIST_DIR}${path.sep}`);

  if (!isInsideDist) {
    return false;
  }

  try {
    const fileStats = await stat(filePath);
    if (fileStats.isFile()) {
      await sendFile(req, res, filePath);
      return true;
    }
  } catch {
    // Fall through to the SPA entry point below.
  }

  const indexPath = path.join(DIST_DIR, "index.html");
  try {
    await stat(indexPath);
    await sendFile(req, res, indexPath);
    return true;
  } catch {
    return false;
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function withCache(key, producer, ttl = CACHE_TTL_MS) {
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) {
    return existing.value;
  }

  const value = await producer();
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "PSXPrimeDesk/1.0 research dashboard; contact=marketdatarequest@psx.com.pk",
      },
    });

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function numberFrom(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/[,Rs%\s]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumberAfter(text, label, radius = 160) {
  const index = text.toLowerCase().indexOf(label.toLowerCase());
  if (index < 0) return null;
  const slice = text.slice(index + label.length, index + label.length + radius);
  const match = slice.match(/[-+]?\d[\d,]*(?:\.\d+)?/);
  return match ? numberFrom(match[0]) : null;
}

function scoreStock(stock) {
  const oneYear = stock.oneYear ?? 0;
  const ytd = stock.ytd ?? 0;
  const day = stock.changePct ?? 0;
  const pe = stock.pe ?? 0;
  const volume = stock.volume ?? 0;
  const liquidityScore = Math.min(12, Math.log10(Math.max(volume, 1)) * 1.5);
  const valuationScore = pe > 0 && pe <= 12 ? 7 : pe > 12 && pe <= 20 ? 3 : 0;
  return oneYear * 0.55 + ytd * 0.24 + day * 0.1 + liquidityScore + valuationScore;
}

function normalizeStock(stock) {
  const output = {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector || "",
    price: numberFrom(stock.price),
    changePct: numberFrom(stock.changePct),
    ytd: numberFrom(stock.ytd),
    oneYear: numberFrom(stock.oneYear),
    volume: numberFrom(stock.volume),
    pe: numberFrom(stock.pe),
  };
  output.score = Number(scoreStock(output).toFixed(2));
  return output;
}

function parseMarketWatch(text) {
  const rows = [];
  const marketIndex = text.indexOf("Market Watch");
  const source = marketIndex >= 0 ? text.slice(marketIndex) : text;
  const pattern =
    /\b([A-Z][A-Z0-9]{1,12})\s+(\d[\d,.]*)\s+(\d[\d,.]*)\s+(\d[\d,.]*)\s+(\d[\d,.]*)\s+(\d[\d,.]*)\s+([-+]?\d[\d,.]*)\s+([-+]?\d[\d,.]*)%\s+(\d[\d,]*)/g;

  let match;
  while ((match = pattern.exec(source)) && rows.length < 80) {
    rows.push({
      symbol: match[1],
      price: numberFrom(match[6]),
      changePct: numberFrom(match[8]),
      volume: numberFrom(match[9]),
    });
  }

  return rows;
}

function parsePerformerSection(text, heading) {
  const rows = [];
  const index = text.indexOf(heading);
  if (index < 0) return rows;

  const source = text.slice(index, index + 3500);
  const pattern =
    /\b([A-Z][A-Z0-9]{1,12})\s+(\d[\d,.]*)\s+([-+]?\d[\d,.]*)\s+\(([-+]?\d[\d,.]*)%\)\s+(\d[\d,]*)/g;

  let match;
  while ((match = pattern.exec(source)) && rows.length < 20) {
    rows.push({
      symbol: match[1],
      price: numberFrom(match[2]),
      changePct: numberFrom(match[4]),
      volume: numberFrom(match[5]),
    });
  }

  return rows;
}

async function fetchCompany(symbol, fallbackName, quickQuote) {
  const html = await fetchText(`https://dps.psx.com.pk/company/${symbol}`);
  const text = textFromHtml(html);
  const priceMatch = text.match(/Rs\.?\s*(\d[\d,.]*)/i);
  const quotePctMatch = text.match(
    /Rs\.?\s*\d[\d,.]*\s+[-+]?\d[\d,.]*\s+\(([-+]?\d[\d,.]*)%\)/i,
  );
  const oneYear = firstNumberAfter(text, "1-Year Change");
  const ytd = firstNumberAfter(text, "YTD Change");
  const pe = firstNumberAfter(text, "P/E Ratio");
  const volume = firstNumberAfter(text, "Volume");
  const sectorMatch = text.match(
    /QUOTE\s+PROFILE\s+EQUITY\s+ANNOUNCEMENTS\s+FINANCIALS\s+RATIOS\s+PAYOUTS\s+REPORTS\s+Select\s+.+?\s+([A-Z][A-Z\s/&.-]{5,})\s+Rs\./,
  );

  return normalizeStock({
    symbol,
    name: fallbackName,
    sector: sectorMatch?.[1]?.trim(),
    price: numberFrom(priceMatch?.[1]) ?? quickQuote?.price,
    changePct: numberFrom(quotePctMatch?.[1]) ?? quickQuote?.changePct,
    ytd,
    oneYear,
    volume: quickQuote?.volume ?? volume,
    pe,
  });
}

async function mapLimit(items, limit, worker) {
  const output = [];
  let index = 0;

  async function run() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      try {
        output[currentIndex] = await worker(items[currentIndex], currentIndex);
      } catch {
        output[currentIndex] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, run));
  return output.filter(Boolean);
}

async function fetchMarketSnapshot() {
  const html = await fetchText(MARKET_URL);
  const text = textFromHtml(html);
  const marketWatch = parseMarketWatch(text);
  const advancers = parsePerformerSection(text, "TOP ADVANCERS");
  const active = parsePerformerSection(text, "TOP ACTIVE STOCKS");
  const quickQuotes = new Map(
    [...marketWatch, ...advancers, ...active].map((row) => [row.symbol, row]),
  );
  const asOfMatch = text.match(/As of ([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+[\d:]+\s+[AP]M)/);

  return {
    text,
    quickQuotes,
    snapshot: {
      asOf: asOfMatch?.[1] || "",
    },
  };
}

async function fetchTopStocks() {
  const snapshot = await fetchMarketSnapshot();
  const companies = await mapLimit(COMPANY_UNIVERSE, 4, async ([symbol, name]) =>
    fetchCompany(symbol, name, snapshot.quickQuotes.get(symbol)),
  );

  const ranked = companies
    .filter((stock) => stock.oneYear !== null || stock.ytd !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return {
    topStocks: ranked.length ? ranked : FALLBACK_STOCKS,
    snapshot: snapshot.snapshot,
    sourceMode: ranked.length >= 5 ? "live" : "fallback",
  };
}

function parseBrokers(html) {
  const text = textFromHtml(html);
  const names = [];
  const activeAccountsMatch = text.match(
    /Top 10 Brokers - Most Active Accounts\s+([\s\S]*?)\s+Top 10 Brokers - New UINs/i,
  );
  const activeAccounts = activeAccountsMatch?.[1] || "";
  const rowPattern =
    /\b(?:[1-9]|10)\s*-\s*([A-Z][A-Za-z0-9&.,'() /-]+?)(?=\s+\b(?:[1-9]|10)\s*-|$)/g;

  let rowMatch;
  while ((rowMatch = rowPattern.exec(activeAccounts)) && names.length < 10) {
    const name = rowMatch[1].replace(/\s+/g, " ").trim();
    if (name.length > 5 && !names.includes(name)) names.push(name);
  }

  if (names.length >= 5) {
    return names.slice(0, 10).map((name) => ({
      name,
      category: "Most active accounts",
    }));
  }

  const patterns = [
    /\b\d{1,2}\s*[-.)]\s*([A-Z][A-Za-z0-9&.,'() /-]+?(?:Limited|LTD|Ltd|Corporation|Pakistan)(?:\s*\(Private\))?(?:\s*Limited)?)/g,
    /(Abbasi & Company \(Pvt\) Limited|AKD Securities Limited|Arif Habib Limited|BMA Capital Management Limited|Foundation Securities \(Private\) Limited|JS Global Capital Limited|Ktrade Securities Limited|Topline Securities Limited|Chase Securities Pakistan \(Private\) Limited|Integrated Equities Limited)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) && names.length < 10) {
      let name = match[1]
        .replace(/^.*?\b\d{1,2}\s*[-.)]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
      const numberedSegments = [
        ...match[1].matchAll(
          /\b\d{1,2}\s*[-.)]\s*([A-Z][A-Za-z0-9&.,'() /-]+?(?:Limited|LTD|Ltd|Corporation|Pakistan)(?:\s*\(Private\))?(?:\s*Limited)?)/g,
        ),
      ];
      if (numberedSegments.length) {
        name = numberedSegments[numberedSegments.length - 1][1]
          .replace(/\s+/g, " ")
          .trim();
      }
      if (name.length > 5 && !names.includes(name)) names.push(name);
    }
  }

  return names.slice(0, 10).map((name) => ({
    name,
    category: "Pakistan Stock Exchange top broker ranking",
  }));
}

async function fetchBrokers() {
  const html = await fetchText(BROKERS_URL);
  const brokers = parseBrokers(html);
  return brokers.length >= 5 ? brokers : FALLBACK_BROKERS;
}

async function getMarket() {
  return withCache("market", async () => {
    try {
      const [stockResult, brokers] = await Promise.all([
        fetchTopStocks(),
        fetchBrokers(),
      ]);

      return {
        ...stockResult,
        brokers,
        generatedAt: new Date().toISOString(),
        legal:
          "For production or public commercial use, obtain the relevant Pakistan Stock Exchange market data rights/license.",
      };
    } catch (error) {
      return {
        topStocks: FALLBACK_STOCKS,
        brokers: FALLBACK_BROKERS,
        sourceMode: "fallback",
        generatedAt: new Date().toISOString(),
        snapshot: { asOf: "Demo data" },
        warning: error.message,
        legal:
          "For production or public commercial use, obtain the relevant Pakistan Stock Exchange market data rights/license.",
      };
    }
  });
}

function buildFallbackExpertOpinion(market, horizon = "12m") {
  const ranked = [...market.topStocks].sort((a, b) => b.score - a.score);
  const picks = ranked.slice(0, 3).map((stock, index) => {
    const positiveTrend = (stock.oneYear ?? 0) > 20 && (stock.ytd ?? 0) >= 0;
    const action =
      index === 0 && positiveTrend
        ? "Buy on pullback"
        : positiveTrend
          ? "Accumulate"
          : "Watchlist";
    const entryLow = stock.price ? stock.price * 0.96 : null;
    const entryHigh = stock.price ? stock.price * 1.02 : null;
    const horizonText = horizon === "6m" ? "six month" : "one year";
    const valuation =
      stock.pe && stock.pe > 0
        ? `Price-to-earnings ratio around ${stock.pe.toFixed(1)} keeps valuation in view.`
        : "Valuation data is incomplete, so size cautiously.";

    return {
      symbol: stock.symbol,
      action,
      confidence: Math.max(52, Math.min(84, Math.round(stock.score))),
      thesis: `${horizonText} setup: one year profit signal is ${stock.oneYear?.toFixed(2) ?? "not available"}% and year to date performance is ${stock.ytd?.toFixed(2) ?? "not available"}%. Prefer entries near Rs ${entryLow ? entryLow.toFixed(2) : "not available"}-${entryHigh ? entryHigh.toFixed(2) : "not available"} after confirming volume.`,
      risk: `${valuation} Invalidate if price breaks recent support or broader Pakistan Stock Exchange index momentum weakens.`,
    };
  });

  const leader = picks[0]?.symbol || "the highest-ranked symbol";
  return {
    generatedAt: new Date().toISOString(),
    horizon,
    summary: `The agent prefers ${leader} for the selected horizon because it combines stronger profit momentum with usable liquidity. Treat this as a research shortlist, not an automatic trade.`,
    recommendations: picks,
    agentSteps: [
      "Pulled the latest cached Pakistan Stock Exchange market snapshot.",
      "Ranked stocks using one year profit, year to date trend, daily move, liquidity, and valuation bands.",
      "Filtered the top names into action labels for the selected horizon.",
      "Attached risk notes so the recommendation is not a blind buy signal.",
    ],
  };
}

function runPythonAnalysis(market, horizon = "12m") {
  const analyzerPath = path.resolve(__dirname, "..", "scripts", "psx_analyzer.py");
  const input = JSON.stringify({
    horizon: horizon === "6m" ? "6m" : "12m",
    stocks: market.topStocks,
  });

  return new Promise((resolve, reject) => {
    const child = spawn("python", [analyzerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Python analysis timed out."));
    }, 45000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr || `Python exited with code ${code}.`));
        return;
      }
      try {
        const payload = JSON.parse(stdout);
        if (payload.error) {
          reject(new Error(payload.error));
          return;
        }
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(input);
  });
}

async function buildExpertOpinion(market, horizon = "12m") {
  try {
    return await runPythonAnalysis(market, horizon);
  } catch (error) {
    const fallback = buildFallbackExpertOpinion(market, horizon);
    return {
      ...fallback,
      engine: "JavaScript fallback analysis",
      warning: `Python analysis unavailable: ${error.message}`,
    };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, generatedAt: new Date().toISOString() });
    }

    if (req.method === "GET" && url.pathname === "/api/market") {
      return sendJson(res, 200, await getMarket());
    }

    if (req.method === "POST" && url.pathname === "/api/expert-opinion") {
      const body = await readBody(req);
      const market = await getMarket();
      return sendJson(res, 200, await buildExpertOpinion(market, body.horizon));
    }

    if (await serveStatic(req, res, url)) {
      return;
    }

    return sendJson(res, 404, { error: "Route not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unexpected server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Pakistan Market Desk running on http://127.0.0.1:${PORT}`);
});
