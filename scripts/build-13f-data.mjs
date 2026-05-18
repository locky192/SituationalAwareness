import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const root = process.cwd();
const filingsRoot = path.join(root, "sec-filings", "13f");
const outputPath = path.join(root, "data", "filings.json");

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  removeNSPrefix: true,
  trimValues: true,
});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatDate(raw) {
  if (!raw) return "";
  const withDashes = String(raw);
  const mmddyyyy = withDashes.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (mmddyyyy) return `${mmddyyyy[3]}-${mmddyyyy[1]}-${mmddyyyy[2]}`;
  const text = String(raw).replaceAll("-", "");
  if (text.length !== 8) return String(raw);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function textValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizePosition(row) {
  const optionType = textValue(row.putCall);
  const positionType = optionType || "Equity";
  const issuer = textValue(row.nameOfIssuer);
  const cusip = textValue(row.cusip);
  const title = textValue(row.titleOfClass).replace(/\s+/g, " ");

  return {
    id: `${cusip}-${positionType}`,
    issuer,
    title,
    cusip,
    value: numeric(row.value),
    shares: numeric(row.shrsOrPrnAmt?.sshPrnamt),
    shareType: textValue(row.shrsOrPrnAmt?.sshPrnamtType),
    positionType,
    investmentDiscretion: textValue(row.investmentDiscretion),
    votingSole: numeric(row.votingAuthority?.Sole),
    votingShared: numeric(row.votingAuthority?.Shared),
    votingNone: numeric(row.votingAuthority?.None),
  };
}

function aggregateByIssuer(positions) {
  const byIssuer = new Map();
  for (const position of positions) {
    const current = byIssuer.get(position.issuer) ?? {
      issuer: position.issuer,
      value: 0,
      shares: 0,
      rows: 0,
      cusips: new Set(),
    };
    current.value += position.value;
    current.shares += position.shares;
    current.rows += 1;
    current.cusips.add(position.cusip);
    byIssuer.set(position.issuer, current);
  }

  return [...byIssuer.values()]
    .map((item) => ({
      ...item,
      cusips: [...item.cusips],
    }))
    .sort((a, b) => b.value - a.value);
}

const directories = (await readdir(filingsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const filings = [];

for (const directory of directories) {
  const filingPath = path.join(filingsRoot, directory);
  const files = await readdir(filingPath);
  const accession = directory.split("_").at(-1);
  const submissionText = await readFile(path.join(filingPath, `${accession}.txt`), "utf8");
  const filedMatch = submissionText.match(/FILED AS OF DATE:\s+(\d{8})/);
  const primary = parser.parse(await readFile(path.join(filingPath, "primary_doc.xml"), "utf8"));
  const primaryDoc = primary.edgarSubmission;
  const reportDate = formatDate(
    primaryDoc?.formData?.coverPage?.reportCalendarOrQuarter ??
      primaryDoc?.headerData?.filerInfo?.periodOfReport ??
      directory.slice(0, 10),
  );
  const xmlTableFile = files.find((file) => file.endsWith(".xml") && file !== "primary_doc.xml");
  if (!xmlTableFile) {
    throw new Error(`Missing information table XML in ${directory}`);
  }

  const tableXml = parser.parse(await readFile(path.join(filingPath, xmlTableFile), "utf8"));
  const positions = asArray(tableXml.informationTable?.infoTable).map(normalizePosition);
  const totalValue = positions.reduce((sum, position) => sum + position.value, 0);
  const typeTotals = positions.reduce((totals, position) => {
    totals[position.positionType] = (totals[position.positionType] ?? 0) + position.value;
    return totals;
  }, {});

  filings.push({
    accession,
    reportDate,
    filingDate: formatDate(filedMatch?.[1]),
    sourceUrl: `https://www.sec.gov/Archives/edgar/data/2045724/${accession.replaceAll("-", "")}/`,
    informationTableFile: xmlTableFile,
    summary: {
      manager: textValue(primaryDoc?.formData?.coverPage?.filingManager?.name),
      tableEntryTotal: numeric(primaryDoc?.formData?.summaryPage?.tableEntryTotal) || positions.length,
      tableValueTotal: numeric(primaryDoc?.formData?.summaryPage?.tableValueTotal) || totalValue,
      positionRows: positions.length,
      issuerCount: aggregateByIssuer(positions).length,
      totalValue,
      typeTotals,
    },
    positions: positions.sort((a, b) => b.value - a.value),
    issuers: aggregateByIssuer(positions),
  });
}

const allIssuers = [...new Set(filings.flatMap((filing) => filing.issuers.map((issuer) => issuer.issuer)))].sort();
const allPositionTypes = [...new Set(filings.flatMap((filing) => filing.positions.map((position) => position.positionType)))].sort();

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: "generated from repository SEC filing archives",
      filer: {
        name: "Situational Awareness LP",
        cik: "0002045724",
      },
      filings,
      allIssuers,
      allPositionTypes,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${outputPath} with ${filings.length} filings and ${allIssuers.length} issuers.`);
