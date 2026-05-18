import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const filingsPath = path.join(root, "data", "filings.json");
const outputPath = path.join(root, "data", "price-series.json");

const tickerMap = {
  "ADVANCED MICRO DEVICES INC": { ticker: "AMD", name: "Advanced Micro Devices" },
  "APPLIED DIGITAL CORP": { ticker: "APLD", name: "Applied Digital" },
  "ASML HLDG NV N Y REGISTRY": { ticker: "ASML", name: "ASML Holding" },
  "BABCOCK & WILCOX ENTERPRISES": { ticker: "BW", name: "Babcock & Wilcox" },
  "BITDEER TECHNOLOGIES GROUP": { ticker: "BTDR", name: "Bitdeer Technologies" },
  "BITFARMS LTD": { ticker: "BITF", name: "Bitfarms" },
  "BLOOM ENERGY CORP": { ticker: "BE", name: "Bloom Energy" },
  "BROADCOM INC": { ticker: "AVGO", name: "Broadcom" },
  "CIPHER MINING INC": { ticker: "CIFR", name: "Cipher Mining" },
  "CLEANSPARK INC": { ticker: "CLSK", name: "CleanSpark" },
  "COHERENT CORP": { ticker: "COHR", name: "Coherent" },
  "CONSTELLATION ENERGY CORP": { ticker: "CEG", name: "Constellation Energy" },
  "CORE SCIENTIFIC INC NEW": { ticker: "CORZ", name: "Core Scientific" },
  "COREWEAVE INC": { ticker: "CRWV", name: "CoreWeave" },
  "CORNING INC": { ticker: "GLW", name: "Corning" },
  "EQT CORP": { ticker: "EQT", name: "EQT" },
  "GALAXY DIGITAL INC.": { ticker: "GLXY", name: "Galaxy Digital" },
  "HIVE DIGITAL TECHNOLOGIES LT": { ticker: "HIVE", name: "HIVE Digital Technologies" },
  "HUT 8 CORP": { ticker: "HUT", name: "Hut 8" },
  "INTEL CORP": { ticker: "INTC", name: "Intel" },
  "IREN LIMITED": { ticker: "IREN", name: "IREN" },
  "KILROY RLTY CORP": { ticker: "KRC", name: "Kilroy Realty" },
  "LIBERTY ENERGY INC": { ticker: "LBRT", name: "Liberty Energy" },
  "LUMENTUM HLDGS INC": { ticker: "LITE", name: "Lumentum" },
  "MARVELL TECHNOLOGY INC": { ticker: "MRVL", name: "Marvell Technology" },
  "MICRON TECHNOLOGY INC": { ticker: "MU", name: "Micron Technology" },
  "MODINE MFG CO": { ticker: "MOD", name: "Modine Manufacturing" },
  "NVIDIA CORPORATION": { ticker: "NVDA", name: "NVIDIA" },
  "ONTO INNOVATION INC": { ticker: "ONTO", name: "Onto Innovation" },
  "POWER SOLUTIONS INTL INC": { ticker: "PSIX", name: "Power Solutions International" },
  "PROPETRO HLDG CORP": { ticker: "PUMP", name: "ProPetro" },
  "RIOT PLATFORMS INC": { ticker: "RIOT", name: "Riot Platforms" },
  "SANDISK CORP": { ticker: "SNDK", name: "SanDisk" },
  "SEAGATE TECHNOLOGY HLDNGS PL": { ticker: "STX", name: "Seagate Technology" },
  "SHARONAI HOLDINGS INC": { ticker: "SHAZ", name: "SharonAI Holdings" },
  "SOLARIS ENERGY INFRAS INC": { ticker: "SEI", name: "Solaris Energy Infrastructure" },
  "T1 ENERGY INC": { ticker: "TE", name: "T1 Energy" },
  "TAIWAN SEMICONDUCTOR MANUFAC": { ticker: "TSM", name: "Taiwan Semiconductor" },
  "TALEN ENERGY CORP": { ticker: "TLN", name: "Talen Energy" },
  "TOWER SEMICONDUCTOR LTD": { ticker: "TSEM", name: "Tower Semiconductor" },
  "VANECK ETF TRUST": { ticker: "SMH", name: "VanEck Semiconductor ETF" },
  "VERTIV HOLDINGS CO": { ticker: "VRT", name: "Vertiv" },
  "VISTRA CORP": { ticker: "VST", name: "Vistra" },
  "WESTERN DIGITAL CORP": { ticker: "WDC", name: "Western Digital" },
  "WHITEFIBER INC": { ticker: "WYFI", name: "WhiteFiber" },
};

function canonicalIssuer(issuer) {
  return issuer.toUpperCase().replace(/\s+/g, " ").trim();
}

function valueForIssuer(filing, canonicalName) {
  return filing.positions
    .filter((position) => position.positionType === "Equity" && canonicalIssuer(position.issuer) === canonicalName)
    .reduce((sum, position) => sum + position.value, 0);
}

function nextTradingPrice(prices, date) {
  return prices.find((point) => point.date >= date) ?? prices.at(-1);
}

function previousTradingPrice(prices, date) {
  return prices.findLast((point) => point.date <= date) ?? prices[0];
}

function quarterStartDate(reportDate) {
  const [year, month] = reportDate.split("-").map(Number);
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3;
  return new Date(Date.UTC(year, quarterStartMonth, 1)).toISOString().slice(0, 10);
}

async function fetchPrices(ticker, startDate, endDate) {
  const period1 = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${endDate}T00:00:00Z`).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker,
  )}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
  const response = await fetch(url);
  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  if (!response.ok || !result?.timestamp?.length) {
    throw new Error(payload.chart?.error?.description ?? `No price data for ${ticker}`);
  }

  const quote = result.indicators?.quote?.[0] ?? {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  return result.timestamp
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close: Number(quote.close?.[index] ?? adjusted[index] ?? 0),
      adjustedClose: Number(adjusted[index] ?? quote.close?.[index] ?? 0),
    }))
    .filter((point) => Number.isFinite(point.adjustedClose) && point.adjustedClose > 0);
}

const data = JSON.parse(await readFile(filingsPath, "utf8"));
const reportDates = data.filings.map((filing) => filing.reportDate);
const firstReport = reportDates[0];
const startDate = quarterStartDate(firstReport);
const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const canonicalNames = [
  ...new Set(
    data.filings.flatMap((filing) =>
      filing.positions
        .filter((position) => position.positionType === "Equity")
        .map((position) => canonicalIssuer(position.issuer)),
    ),
  ),
].sort();

const securities = [];

for (const canonicalName of canonicalNames) {
  const mapping = tickerMap[canonicalName];
  if (!mapping) {
    securities.push({
      issuer: canonicalName,
      ticker: null,
      displayName: canonicalName,
      prices: [],
      markers: [],
      error: "No ticker mapping",
    });
    continue;
  }

  try {
    const prices = await fetchPrices(mapping.ticker, startDate, endDate);
    let previousValue = 0;
    const markers = data.filings
      .map((filing) => {
        const value = valueForIssuer(filing, canonicalName);
        const changed = value !== previousValue;
        const priorValue = previousValue;
        previousValue = value;
        if (!changed) return null;
        const holdingPricePoint = previousTradingPrice(prices, filing.reportDate);
        const windowStartPoint = nextTradingPrice(prices, quarterStartDate(filing.reportDate));
        const windowEndPoint = previousTradingPrice(prices, filing.reportDate);
        if (!holdingPricePoint || !windowStartPoint || !windowEndPoint) return null;
        return {
          reportDate: filing.reportDate,
          filingDate: filing.filingDate,
          date: holdingPricePoint.date,
          price: holdingPricePoint.adjustedClose,
          windowStartDate: windowStartPoint.date,
          windowEndDate: windowEndPoint.date,
          value,
          priorValue,
          delta: value - priorValue,
          accession: filing.accession,
          sourceUrl: filing.sourceUrl,
        };
      })
      .filter(Boolean);

    securities.push({
      issuer: canonicalName,
      ticker: mapping.ticker,
      displayName: mapping.name,
      prices,
      markers,
      error: null,
    });
  } catch (error) {
    securities.push({
      issuer: canonicalName,
      ticker: mapping.ticker,
      displayName: mapping.name,
      prices: [],
      markers: [],
      error: error.message,
    });
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: "generated from Yahoo Finance chart API",
      startDate,
      endDate,
      securities,
    },
    null,
    2,
  )}\n`,
);

const withPrices = securities.filter((security) => security.prices.length > 0).length;
console.log(`Wrote ${outputPath} with ${withPrices}/${securities.length} securities with prices.`);
