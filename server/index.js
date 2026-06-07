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
const KMI30_URL = "https://dps.psx.com.pk/indices/KMI30";
const BROKERS_URL =
  "https://www.psx.com.pk/psx/resources-and-tools/investors/top-10-brokers";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
const SNAPSHOT_TIMEOUT_MS = 3000;
const COMPANY_TIMEOUT_MS = 8000;
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

const MARKET_LEADER_UNIVERSE = [
  ["SAZEW", "Sazgar Engineering Works Limited"],
  ["MARI", "Mari Energies Limited"],
  ["MEBL", "Meezan Bank Limited"],
  ["HUBC", "The Hub Power Company Limited"],
  ["OGDC", "Oil & Gas Development Company Limited"],
  ["FFC", "Fauji Fertilizer Company Limited"],
  ["GHNI", "Ghandhara Industries Limited"],
  ["SYS", "Systems Limited"],
  ["PPL", "Pakistan Petroleum Limited"],
  ["ENGROH", "Engro Holdings Limited"],
  ["ATRL", "Attock Refinery Limited"],
  ["DGKC", "D.G. Khan Cement Company Limited"],
  ["FCCL", "Fauji Cement Company Limited"],
  ["GAL", "Ghandhara Automobiles Limited"],
  ["LUCK", "Lucky Cement Limited"],
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

const FALLBACK_KMI30 = [
  ["FFC", "Fauji Fertilizer Company Limited", 12.3],
  ["ENGROH", "Engro Holdings Limited", 10.41],
  ["MEBL", "Meezan Bank Limited", 9.08],
  ["HUBC", "The Hub Power Company Limited", 8.58],
  ["OGDC", "Oil & Gas Development Company Limited", 8.51],
  ["LUCK", "Lucky Cement Limited", 7.81],
  ["MARI", "Mari Energies Limited", 6.43],
  ["PPL", "Pakistan Petroleum Limited", 6.31],
  ["SYS", "Systems Limited", 5.39],
  ["EFERT", "Engro Fertilizers Limited", 4.96],
  ["PSO", "Pakistan State Oil Company Limited", 3.4],
  ["FCCL", "Fauji Cement Company Limited", 1.89],
  ["SAZEW", "Sazgar Engineering Works Limited", 1.86],
  ["DGKC", "D.G. Khan Cement Company Limited", 1.78],
  ["MLCF", "Maple Leaf Cement Factory Limited", 1.7],
  ["ATRL", "Attock Refinery Limited", 1.53],
  ["SEARL", "The Searle Company Limited", 1.1],
  ["SNGP", "Sui Northern Gas Pipelines Limited", 1.03],
  ["NML", "Nishat Mills Limited", 0.94],
  ["PAEL", "Pak Elektron Limited", 0.84],
  ["AIRLINK", "Air Link Communication Limited", 0.75],
  ["GHNI", "Ghandhara Industries Limited", 0.58],
  ["GAL", "Ghandhara Automobiles Limited", 0.44],
  ["CPHL", "Citi Pharma Ltd.", 0.4],
  ["NRL", "National Refinery Limited", 0.4],
  ["FFL", "Fauji Foods Limited", 0.37],
  ["SSGC", "Sui Southern Gas Company Limited", 0.37],
  ["HCAR", "Honda Atlas Cars (Pakistan) Limited", 0.32],
  ["PRL", "Pakistan Refinery Limited", 0.32],
  ["TREET", "Treet Corporation Limited", 0.19],
].map(([symbol, name, indexWeight]) => ({
  symbol,
  name,
  indexWeight,
  price: null,
  changePct: null,
  ytd: null,
  oneYear: null,
  volume: null,
  marketCap: null,
}));

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

async function fetchText(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
  return repairText(
    html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " "),
  )
    .trim();
}

function repairText(value) {
  return String(value || "")
    .replace(/\u00e2\u20ac\u2122/g, "'")
    .replace(/\u00e2\u20ac\u02dc/g, "'")
    .replace(/\u00e2\u20ac\u0153/g, '"')
    .replace(/\u00e2\u20ac\u009d/g, '"')
    .replace(/\u00e2\u20ac\u201c/g, "-")
    .replace(/\u00e2\u20ac\u201d/g, "-")
    .replace(/\u00c2/g, "")
    .replace(/([A-Za-z])'(?=[A-Z])/g, "$1 '");
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

function shortText(value, limit = 360) {
  const text = repairText(value).replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
}

function textBetween(text, startLabel, endLabels) {
  const start = text.toLowerCase().indexOf(startLabel.toLowerCase());
  if (start < 0) return "";
  let source = text.slice(start + startLabel.length);
  const positions = endLabels
    .map((label) => source.toLowerCase().indexOf(label.toLowerCase()))
    .filter((index) => index > 0);
  if (positions.length) {
    source = source.slice(0, Math.min(...positions));
  }
  return shortText(source);
}

function isMarketDataJunk(title) {
  const lowered = String(title || "").toLowerCase();
  const junkTerms = [
    "open ",
    " high ",
    " low ",
    " volume ",
    "circuit breaker",
    "day range",
    "52-week range",
    "ask price",
    "bid price",
    "ldcp",
    "haircut",
    "p/e ratio",
    "1-year change",
    "ytd change",
    "market data powered",
    "company profile",
    "business description",
    "no record found",
    "last update:",
    "total trades",
  ];
  return (
    junkTerms.some((term) => lowered.includes(term)) ||
    lowered.length > 180 ||
    (lowered.match(/\d/g) || []).length > 24
  );
}

function extractAnnouncementTitles(text) {
  const start = text.indexOf("Announcements");
  const end = text.indexOf("Financials", start >= 0 ? start : 0);
  const source = start >= 0 && end > start ? text.slice(start, end) : "";
  if (!source) return [];

  const titles = [];
  const pattern = /([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\s+(.+?)\s+View/g;
  let match;
  while ((match = pattern.exec(source)) && titles.length < 3) {
    const title = match[2]
      .replace(/^(Date Title Document|Financial Results|Board Meetings|Others)\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (title && !isMarketDataJunk(title) && !titles.includes(title)) {
      titles.push(title);
    }
  }
  return titles;
}

function latestCompanyUpdate(companies) {
  const dated = companies
    .map((company) => ({
      value: company.lastUpdate,
      time: Date.parse(company.lastUpdate || ""),
    }))
    .filter((item) => item.value && Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time);
  return dated[0]?.value || "";
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
  const html = await fetchText(`https://dps.psx.com.pk/company/${symbol}`, COMPANY_TIMEOUT_MS);
  const text = textFromHtml(html);
  const priceMatch = text.match(/Rs\.?\s*(\d[\d,.]*)/i);
  const quotePctMatch = text.match(
    /Rs\.?\s*\d[\d,.]*\s+[-+]?\d[\d,.]*\s+\(([-+]?\d[\d,.]*)%\)/i,
  );
  const oneYear = firstNumberAfter(text, "1-Year Change");
  const ytd = firstNumberAfter(text, "YTD Change");
  const pe = firstNumberAfter(text, "P/E Ratio");
  const volume = firstNumberAfter(text, "Volume");
  const marketCap = firstNumberAfter(text, "Market Cap");
  const sectorMatch = text.match(
    /QUOTE\s+PROFILE\s+EQUITY\s+ANNOUNCEMENTS\s+FINANCIALS\s+RATIOS\s+PAYOUTS\s+REPORTS\s+Select\s+.+?\s+([A-Z][A-Z\s/&.-]{5,})\s+Rs\./,
  );
  const websiteMatch = text.match(
    /WEBSITE\s+((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i,
  );
  const lastUpdateMatch = text.match(
    /Last update:\s*([A-Z][a-z]{2},\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)/,
  );

  return {
    ...normalizeStock({
      symbol,
      name: fallbackName,
      sector: sectorMatch?.[1]?.trim(),
      price: numberFrom(priceMatch?.[1]) ?? quickQuote?.price,
      changePct: numberFrom(quotePctMatch?.[1]) ?? quickQuote?.changePct,
      ytd,
      oneYear,
      volume: quickQuote?.volume ?? volume,
      pe,
    }),
    marketCap: quickQuote?.marketCap ?? marketCap,
    lastUpdate: lastUpdateMatch?.[1] || "",
    website: websiteMatch?.[1] || "",
    companyProfile: textBetween(text, "BUSINESS DESCRIPTION", [
      "KEY PEOPLE",
      "WEBSITE",
      "REGISTRAR",
      "Company Secretary",
    ]),
    latestAnnouncements: extractAnnouncementTitles(text),
  };
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
  const html = await fetchText(MARKET_URL, SNAPSHOT_TIMEOUT_MS);
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
  let snapshot;
  let warning = "";
  try {
    snapshot = await fetchMarketSnapshot();
  } catch (error) {
    warning = `PSX homepage snapshot unavailable: ${error.message}`;
    snapshot = {
      quickQuotes: new Map(),
      snapshot: { asOf: "" },
    };
  }

  const companies = await mapLimit(MARKET_LEADER_UNIVERSE, 10, async ([symbol, name]) =>
    fetchCompany(symbol, name, snapshot.quickQuotes.get(symbol)),
  );

  let ranked = companies
    .filter((stock) => stock.oneYear !== null || stock.ytd !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  let sourceMode = ranked.length >= 5 ? "live" : "fallback";
  let snapshotAsOf = snapshot.snapshot.asOf || latestCompanyUpdate(companies);

  const rankedSymbols = new Set(ranked.map((stock) => stock.symbol));
  const filledRanked = [
    ...ranked,
    ...FALLBACK_STOCKS.filter((stock) => !rankedSymbols.has(stock.symbol)),
  ].slice(0, 10);

  return {
    topStocks: filledRanked.length ? filledRanked : FALLBACK_STOCKS,
    snapshot: {
      asOf: snapshotAsOf,
    },
    sourceMode,
    warning: warning || undefined,
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

function parseKmi30(html) {
  const text = textFromHtml(html);
  const sourceIndex = text.indexOf("KMI INDEX Constituents");
  const source = sourceIndex >= 0 ? text.slice(sourceIndex) : text;
  const rows = [];
  const rowPattern =
    /\b([A-Z][A-Z0-9]{1,12})\s+(.+?)\s*(\d[\d,.]*)\s+(\d[\d,.]*)\s+([-+]?\d[\d,.]*)\s+([-+]?\d[\d,.]*)%\s*([-+]?\d[\d,.]*)%\s*([-+]?\d[\d,.]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)/g;

  let match;
  while ((match = rowPattern.exec(source)) && rows.length < 30) {
    const name = match[2].replace(/\s+/g, " ").trim();
    if (match[1] === "KMI" || /KMI\s*-\s*30/i.test(name)) {
      continue;
    }
    rows.push({
      symbol: match[1],
      name,
      price: numberFrom(match[4]),
      changePct: numberFrom(match[6]),
      indexWeight: numberFrom(match[7]),
      indexPoint: numberFrom(match[8]),
      volume: numberFrom(match[9]),
      freeFloat: numberFrom(match[10]),
      marketCap: numberFrom(match[11]),
    });
  }

  return rows;
}

function buildFallbackKmiReason(company) {
  const daily = company.changePct ?? 0;
  const ytd = company.ytd ?? 0;
  const oneYear = company.oneYear ?? 0;
  const dailyText =
    daily > 0
      ? "The latest move suggests active buying interest."
      : daily < 0
        ? "The latest move suggests profit-taking or short-term selling pressure."
        : "The latest move is neutral.";
  const trendText =
    oneYear > 0 && ytd > 0
      ? "One-year and year-to-date performance both support the growth case."
      : oneYear > 0
        ? "The longer trend is constructive, but recent performance needs confirmation."
        : ytd > 0
          ? "Recent performance is improving, but the longer trend needs repair."
          : "Trend support is weak, so conviction should stay cautious.";

  return `${company.symbol}: ${dailyText} ${trendText} Use market cap, liquidity, and KMI relevance as confirmation before treating it as a buy candidate.`;
}

function runPythonKmiReasons(companies) {
  const analyzerPath = path.resolve(__dirname, "..", "scripts", "kmi_reasons.py");
  const input = JSON.stringify({ companies });

  return new Promise((resolve, reject) => {
    const child = spawn("python", [analyzerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Python KMI reason generation timed out."));
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
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(input);
  });
}

async function attachKmiReasons(companies) {
  try {
    const payload = await runPythonKmiReasons(companies);
    const reasonsBySymbol = new Map(
      (payload.companies || []).map((item) => [item.symbol, item.reason]),
    );
    const detailsBySymbol = new Map(
      (payload.companies || []).map((item) => [item.symbol, item.reasonDetails]),
    );
    return companies.map((company) => ({
      ...company,
      reason: reasonsBySymbol.get(company.symbol) || buildFallbackKmiReason(company),
      reasonDetails: detailsBySymbol.get(company.symbol) || null,
    }));
  } catch {
    return companies.map((company) => ({
      ...company,
      reason: buildFallbackKmiReason(company),
    }));
  }
}

async function enrichKmiRows(rows, limit = 4) {
  return mapLimit(rows, limit, async (row) => {
    try {
      const stock = await fetchCompany(row.symbol, row.name, row);
      return {
        ...row,
        ...stock,
        indexWeight: row.indexWeight,
        indexPoint: row.indexPoint,
        freeFloat: row.freeFloat,
        marketCap: row.marketCap ?? stock.marketCap,
      };
    } catch {
      return row;
    }
  });
}

async function fetchKmi30() {
  return withCache("kmi30", async () => {
    try {
      const html = await fetchText(KMI30_URL);
      const constituents = parseKmi30(html);
      if (constituents.length < 20) {
        throw new Error("KMI30 constituent table could not be parsed.");
      }

      const enriched = await enrichKmiRows(constituents, 4);

      const ranked = enriched
        .sort((a, b) => {
          const aRank = a.oneYear ?? a.indexWeight ?? 0;
          const bRank = b.oneYear ?? b.indexWeight ?? 0;
          return bRank - aRank;
        })
        .slice(0, 30);
      const companies = await attachKmiReasons(ranked);

      return {
        companies,
        sourceMode: "live",
        rankingBasis: "Descending by 2025-2026 one-year performance; index weight used when one-year data is unavailable.",
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      const enrichedFallback = await enrichKmiRows(FALLBACK_KMI30, 8);
      const ranked = enrichedFallback
        .sort((a, b) => {
          const aRank = a.oneYear ?? a.indexWeight ?? 0;
          const bRank = b.oneYear ?? b.indexWeight ?? 0;
          return bRank - aRank;
        })
        .slice(0, 30);

      return {
        companies: await attachKmiReasons(ranked),
        sourceMode: "fallback",
        rankingBasis:
          "Live KMI index table unavailable; sorted by one-year performance when PSX company pages provide it, otherwise by KMI30 index weight.",
        generatedAt: new Date().toISOString(),
        warning: error.message,
      };
    }
  });
}

async function getMarket() {
  return withCache("market", async () => {
    const [stockResultOutcome, brokersOutcome] = await Promise.allSettled([
      fetchTopStocks(),
      fetchBrokers(),
    ]);

    const stockResult =
      stockResultOutcome.status === "fulfilled"
        ? stockResultOutcome.value
        : {
            topStocks: FALLBACK_STOCKS,
            snapshot: { asOf: "" },
            sourceMode: "fallback",
            warning: stockResultOutcome.reason?.message || "Stock fetch failed.",
          };
    const brokers =
      brokersOutcome.status === "fulfilled" ? brokersOutcome.value : FALLBACK_BROKERS;
    const warnings = [stockResult.warning];

    if (brokersOutcome.status === "rejected") {
      warnings.push(brokersOutcome.reason?.message || "Broker fetch failed.");
    }

    return {
      ...stockResult,
      brokers,
      generatedAt: new Date().toISOString(),
      warning: warnings.filter(Boolean).join(" "),
      legal:
        "For production or public commercial use, obtain the relevant Pakistan Stock Exchange market data rights/license.",
    };
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

function buildFallbackKmiOpinion(kmi) {
  const companies = [...(kmi?.companies || [])];
  const picks = companies
    .map((company) => {
      const oneYear = company.oneYear ?? 0;
      const ytd = company.ytd ?? 0;
      const daily = company.changePct ?? 0;
      const weight = company.indexWeight ?? 0;
      const points = company.indexPoint ?? 0;
      const marketCap = company.marketCap ?? 0;
      const volume = company.volume ?? 0;
      const score =
        40 +
        Math.max(-10, Math.min(38, (oneYear / 80) * 38)) +
        Math.max(-8, Math.min(18, (ytd / 35) * 18)) +
        Math.max(-5, Math.min(7, (daily / 6) * 7)) +
        Math.max(0, Math.min(12, (weight / 12) * 12)) +
        Math.max(0, Math.min(8, (points / 10000) * 8)) +
        Math.max(0, Math.min(9, (Math.log10(Math.max(marketCap, 1)) / 12) * 9)) +
        Math.max(0, Math.min(8, (Math.log10(Math.max(volume, 1)) / 12) * 8));

      return {
        symbol: company.symbol,
        name: company.name || "Pakistan Stock Exchange",
        action: score >= 78 ? "Strong Buy" : score >= 68 ? "Growth buy watch" : "Accumulate carefully",
        score: Number(Math.max(0, Math.min(100, score)).toFixed(2)),
        confidence: Math.round(Math.max(45, Math.min(86, score))),
        thesis: `One-year setup: ${oneYear ? oneYear.toFixed(2) : "not available"}% return, ${ytd ? ytd.toFixed(2) : "not available"}% YTD, and ${daily ? daily.toFixed(2) : "not available"}% latest daily move. The fallback model blends performance, KMI points, weight, liquidity, and market cap.`,
        risk: "Fallback analysis is active. Confirm latest price action and broader KMI trend before making any buying decision.",
        reason: `Reason: ${daily > 0 ? "buyers are active in the latest session" : daily < 0 ? "the latest session shows pullback or profit-taking" : "the latest session is neutral"}, ${oneYear > 20 && ytd > 0 ? "one-year and YTD trends are aligned" : oneYear > 0 ? "the one-year trend is constructive but needs confirmation" : "trend support is limited"}, and liquidity plus market depth are used as confirmation for the one-year buy/growth ranking.`,
        metrics: {
          oneYear: company.oneYear,
          ytd: company.ytd,
          daily: company.changePct,
          indexWeight: company.indexWeight,
          indexPoint: company.indexPoint,
          marketCap: company.marketCap,
          volume: company.volume,
        },
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    engine: "JavaScript fallback KMI analysis",
    generatedAt: new Date().toISOString(),
    horizon: "12m",
    summary: `The Expert model prefers ${picks[0]?.symbol || "the highest-ranked KMI stock"} for the next one year based on a blended buy/growth score.`,
    recommendations: picks,
    agentSteps: [
      "Read the cached KMI30 companies.",
      "Scored one-year return, YTD trend, daily move, index weight, points, market cap, and volume.",
      "Ranked the top KMI buy/growth candidates for a one-year horizon.",
    ],
  };
}

function runPythonKmiAnalysis(kmi) {
  const analyzerPath = path.resolve(__dirname, "..", "scripts", "kmi_analyzer.py");
  const input = JSON.stringify({
    companies: kmi?.companies || [],
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
      reject(new Error("Python KMI analysis timed out."));
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

async function buildKmiOpinion() {
  const kmi = await fetchKmi30();
  try {
    return await runPythonKmiAnalysis(kmi);
  } catch (error) {
    return {
      ...buildFallbackKmiOpinion(kmi),
      warning: `Python KMI analysis unavailable: ${error.message}`,
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

    if (req.method === "GET" && url.pathname === "/api/kmi30") {
      return sendJson(res, 200, await fetchKmi30());
    }

    if (req.method === "POST" && url.pathname === "/api/kmi30-opinion") {
      return sendJson(res, 200, await buildKmiOpinion());
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
