"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  PieChart as PieChartIcon,
  Search,
  Table2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";

type Position = {
  id: string;
  issuer: string;
  title: string;
  cusip: string;
  value: number;
  shares: number;
  shareType: string;
  positionType: string;
};

type Issuer = {
  issuer: string;
  value: number;
  shares: number;
  rows: number;
  cusips: string[];
};

type Filing = {
  accession: string;
  reportDate: string;
  filingDate: string;
  sourceUrl: string;
  informationTableFile: string;
  summary: {
    manager: string;
    tableEntryTotal: number;
    tableValueTotal: number;
    positionRows: number;
    issuerCount: number;
    totalValue: number;
    typeTotals: Record<string, number>;
  };
  positions: Position[];
  issuers: Issuer[];
};

export type FilingsData = {
  generatedAt: string;
  filer: {
    name: string;
    cik: string;
  };
  filings: Filing[];
  allIssuers: string[];
  allPositionTypes: string[];
};

type PricePoint = {
  date: string;
  close: number;
  adjustedClose: number;
};

type PriceChartPoint = PricePoint & {
  markerPrice: number | null;
  marker?: PriceMarker;
};

type OverlaySecurity = PriceSecurity & {
  chartKey: string;
  multipleKey: string;
  color: string;
  latestPercent: number;
  markerPoints: Record<string, number | string>[];
};

type PriceMarker = {
  reportDate: string;
  filingDate: string;
  date: string;
  price: number;
  windowStartDate: string;
  windowEndDate: string;
  value: number;
  priorValue: number;
  delta: number;
  accession: string;
  sourceUrl: string;
};

type PriceSecurity = {
  issuer: string;
  ticker: string | null;
  displayName: string;
  prices: PricePoint[];
  markers: PriceMarker[];
  error: string | null;
};

type SimulatorPoint = {
  date: string;
  value: number;
  benchmarkValue?: number | null;
  rebalanceValue?: number | null;
  event?: RebalanceEvent;
};

type RebalanceEvent = {
  date: string;
  filingDate: string;
  reportDate: string;
  value: number;
  holdings: number;
  topHolding: string;
  sourceUrl: string;
};

type EquityAllocation = {
  issuer: string;
  value: number;
  percent: number;
};

type Benchmark = {
  ticker: string;
  displayName: string;
  prices: PricePoint[];
};

export type PriceData = {
  generatedAt: string;
  startDate: string;
  endDate: string;
  benchmarks?: Benchmark[];
  securities: PriceSecurity[];
};

const COLORS = [
  "#2563eb",
  "#059669",
  "#dc2626",
  "#ca8a04",
  "#7c3aed",
  "#0891b2",
  "#c2410c",
  "#475569",
  "#be185d",
  "#16a34a",
];

const ALL_INSTRUMENTS = "All";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatPeriod(date: string) {
  const [year, month] = date.split("-");
  return `${month}/${year.slice(2)}`;
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function toDateMs(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function formatAxisDate(value: string | number) {
  if (typeof value === "string") return value.slice(2, 7);
  return new Date(value).toISOString().slice(2, 7);
}

function canonicalIssuer(issuer: string) {
  return issuer.toUpperCase().replace(/\s+/g, " ").trim();
}

function aggregateIssuers(positions: Position[]): Issuer[] {
  const byIssuer = new Map<string, Issuer>();

  for (const position of positions) {
    const current = byIssuer.get(position.issuer) ?? {
      issuer: position.issuer,
      value: 0,
      shares: 0,
      rows: 0,
      cusips: [],
    };

    current.value += position.value;
    current.shares += position.shares;
    current.rows += 1;
    if (!current.cusips.includes(position.cusip)) {
      current.cusips.push(position.cusip);
    }

    byIssuer.set(position.issuer, current);
  }

  return [...byIssuer.values()].sort((a, b) => b.value - a.value);
}

type ChartTooltipPayload = {
  dataKey?: string | number;
  name?: string | number;
  value?: number;
  color?: string;
  payload?: unknown;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name ?? entry.dataKey}: {compactCurrency.format(entry.value ?? 0)}
        </div>
      ))}
    </div>
  );
}

function PriceTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const chartPoint = payload[0]?.payload as PriceChartPoint | undefined;
  const marker = chartPoint?.marker;

  return (
    <div className="chart-tooltip">
      <strong>{marker?.reportDate ?? label}</strong>
      <div>{marker ? "Quarter-end holding" : "Adjusted close"}: {compactCurrency.format(payload[0].value ?? 0)}</div>
      {marker ? (
        <>
          <div>Possible change window: {marker.windowStartDate} to {marker.windowEndDate}</div>
          <div>Filed: {marker.filingDate}</div>
          <div>Exposure: {compactCurrency.format(marker.value)}</div>
          <div>Change: {compactCurrency.format(marker.delta)}</div>
        </>
      ) : null}
    </div>
  );
}

function SimulatorTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as SimulatorPoint | undefined;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name ?? entry.dataKey}: {currency.format(entry.value ?? 0)}
        </div>
      ))}
      {point?.event ? (
        <>
          <div>Rebalanced from filing: {point.event.filingDate}</div>
          <div>Reported period: {point.event.reportDate}</div>
          <div>Holdings copied: {point.event.holdings}</div>
          <div>Largest weight: {point.event.topHolding}</div>
        </>
      ) : null}
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: ChartTooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const allocation = payload[0]?.payload as EquityAllocation | undefined;
  if (!allocation) return null;

  return (
    <div className="chart-tooltip">
      <strong>{allocation.issuer}</strong>
      <div>Value: {compactCurrency.format(allocation.value)}</div>
      <div>Weight: {pct(allocation.percent)}</div>
    </div>
  );
}

function equityAllocationsForFiling(filing: Filing): EquityAllocation[] {
  const byIssuer = new Map<string, EquityAllocation>();

  for (const position of filing.positions.filter((item) => item.positionType === "Equity")) {
    const current = byIssuer.get(position.issuer) ?? { issuer: position.issuer, value: 0, percent: 0 };
    current.value += position.value;
    byIssuer.set(position.issuer, current);
  }

  const total = [...byIssuer.values()].reduce((sum, item) => sum + item.value, 0);
  return [...byIssuer.values()]
    .map((item) => ({
      ...item,
      percent: total === 0 ? 0 : (item.value / total) * 100,
    }))
    .sort((a, b) => b.value - a.value);
}

function buildSimulatorSeries(filings: Filing[], priceSecurities: PriceSecurity[], benchmark?: Benchmark) {
  const priceSecurityByIssuer = new Map(priceSecurities.map((security) => [security.issuer, security]));
  const rawPriceMaps = new Map(
    priceSecurities.map((security) => [
      security.issuer,
      new Map(security.prices.map((point) => [point.date, point.adjustedClose])),
    ]),
  );
  const allDates = [...new Set(priceSecurities.flatMap((security) => security.prices.map((point) => point.date)))].sort();
  const priceMaps = new Map<string, Map<string, number>>();

  for (const security of priceSecurities) {
    const rawPrices = rawPriceMaps.get(security.issuer);
    const filledPrices = new Map<string, number>();
    let lastPrice: number | undefined;

    for (const date of allDates) {
      lastPrice = rawPrices?.get(date) ?? lastPrice;
      if (lastPrice !== undefined) {
        filledPrices.set(date, lastPrice);
      }
    }

    priceMaps.set(security.issuer, filledPrices);
  }
  const firstFilingDate = filings[0]?.filingDate;
  if (!firstFilingDate) {
    return {
      series: [],
      events: [],
      endingValue: 0,
      totalReturn: 0,
      benchmarkEndingValue: 0,
      benchmarkReturn: 0,
    };
  }

  const filingTargets = filings.map((filing) => {
    const byIssuer = new Map<string, { issuer: string; value: number }>();
    for (const position of filing.positions.filter((item) => item.positionType === "Equity")) {
      const issuer = canonicalIssuer(position.issuer);
      if (!priceSecurityByIssuer.has(issuer)) continue;
      const current = byIssuer.get(issuer) ?? { issuer, value: 0 };
      current.value += position.value;
      byIssuer.set(issuer, current);
    }

    const total = [...byIssuer.values()].reduce((sum, item) => sum + item.value, 0);
    const weights = [...byIssuer.values()]
      .map((item) => ({
        issuer: item.issuer,
        weight: total === 0 ? 0 : item.value / total,
      }))
      .filter((item) => item.weight > 0)
      .sort((a, b) => b.weight - a.weight);

    return {
      filingDate: filing.filingDate,
      reportDate: filing.reportDate,
      sourceUrl: filing.sourceUrl,
      weights,
    };
  });

  let portfolioValue = 10000;
  let cash = 10000;
  let shares = new Map<string, number>();
  let nextTargetIndex = 0;
  const series: SimulatorPoint[] = [];
  const events: RebalanceEvent[] = [];
  const benchmarkPrices = new Map((benchmark?.prices ?? []).map((point) => [point.date, point.adjustedClose]));
  const benchmarkStartPrice =
    benchmark?.prices.find((point) => point.date >= firstFilingDate)?.adjustedClose ?? benchmark?.prices[0]?.adjustedClose;

  for (const date of allDates.filter((item) => item >= firstFilingDate)) {
    portfolioValue =
      cash +
      [...shares.entries()].reduce((sum, [issuer, quantity]) => {
        const price = priceMaps.get(issuer)?.get(date);
        return sum + quantity * (price ?? 0);
      }, 0);

    while (nextTargetIndex < filingTargets.length && filingTargets[nextTargetIndex].filingDate <= date) {
      const target = filingTargets[nextTargetIndex];
      const tradableWeights = target.weights.filter((item) => priceMaps.get(item.issuer)?.get(date));
      const tradableTotalWeight = tradableWeights.reduce((sum, item) => sum + item.weight, 0);
      shares = new Map();
      cash = portfolioValue;

      if (tradableTotalWeight > 0) {
        cash = 0;
        for (const item of tradableWeights) {
          const price = priceMaps.get(item.issuer)?.get(date) ?? 0;
          const allocation = portfolioValue * (item.weight / tradableTotalWeight);
          shares.set(item.issuer, allocation / price);
        }
      }

      const event: RebalanceEvent = {
        date,
        filingDate: target.filingDate,
        reportDate: target.reportDate,
        value: portfolioValue,
        holdings: tradableWeights.length,
        topHolding: priceSecurityByIssuer.get(tradableWeights[0]?.issuer)?.displayName ?? "None",
        sourceUrl: target.sourceUrl,
      };
      events.push(event);
      nextTargetIndex += 1;
    }

    const event = events.find((item) => item.date === date);
    const benchmarkPrice = benchmarkPrices.get(date);
    series.push({
      date,
      value: portfolioValue,
      benchmarkValue:
        benchmarkStartPrice && benchmarkPrice ? 10000 * (benchmarkPrice / benchmarkStartPrice) : null,
      rebalanceValue: event ? portfolioValue : null,
      event,
    });
  }

  const endingValue = series.at(-1)?.value ?? 10000;
  const benchmarkEndingValue = [...series].reverse().find((point) => point.benchmarkValue)?.benchmarkValue ?? 10000;
  return {
    series,
    events,
    endingValue,
    totalReturn: ((endingValue - 10000) / 10000) * 100,
    benchmarkEndingValue,
    benchmarkReturn: ((benchmarkEndingValue - 10000) / 10000) * 100,
  };
}

export function PortfolioDashboard({ data, priceData }: { data: FilingsData; priceData: PriceData }) {
  const [selectedIssuer, setSelectedIssuer] = useState("NVIDIA CORP");
  const [selectedPriceIssuer, setSelectedPriceIssuer] = useState("BLOOM ENERGY CORP");
  const [selectedPieFilingDate, setSelectedPieFilingDate] = useState(data.filings.at(-1)?.reportDate ?? "");
  const [activePriceMarker, setActivePriceMarker] = useState<PriceMarker | null>(null);
  const [instrumentType, setInstrumentType] = useState(ALL_INSTRUMENTS);
  const [priceScale, setPriceScale] = useState<"linear" | "log">("linear");
  const [overlayScale, setOverlayScale] = useState<"linear" | "log">("linear");
  const [highlightedOverlayKey, setHighlightedOverlayKey] = useState<string | null>(null);
  const [simulatorScale, setSimulatorScale] = useState<"linear" | "log">("linear");
  const [query, setQuery] = useState("");

  const filings = data.filings;
  const instrumentOptions = [ALL_INSTRUMENTS, ...data.allPositionTypes];
  const filteredFilings = useMemo(() => {
    return filings.map((filing) => {
      const positions =
        instrumentType === ALL_INSTRUMENTS
          ? filing.positions
          : filing.positions.filter((position) => position.positionType === instrumentType);
      const totalValue = positions.reduce((sum, position) => sum + position.value, 0);
      const issuers = aggregateIssuers(positions);

      return {
        ...filing,
        positions,
        issuers,
        filteredSummary: {
          issuerCount: issuers.length,
          positionRows: positions.length,
          totalValue,
        },
      };
    });
  }, [filings, instrumentType]);

  const latest = filteredFilings.at(-1)!;
  const previous = filteredFilings.at(-2)!;

  const totalSeries = filteredFilings.map((filing) => ({
    period: formatPeriod(filing.reportDate),
    fullDate: filing.reportDate,
    total: filing.filteredSummary.totalValue,
    issuers: filing.filteredSummary.issuerCount,
    rows: filing.filteredSummary.positionRows,
  }));

  const typeSeries = filings.map((filing) => ({
    period: formatPeriod(filing.reportDate),
    Equity: filing.summary.typeTotals.Equity ?? 0,
    Call: filing.summary.typeTotals.Call ?? 0,
    Put: filing.summary.typeTotals.Put ?? 0,
  }));

  const topIssuers = latest.issuers.slice(0, 10);
  const latestTotal = latest.filteredSummary.totalValue;
  const previousTotal = previous.filteredSummary.totalValue;
  const totalChange = previousTotal === 0 ? 0 : ((latestTotal - previousTotal) / previousTotal) * 100;

  const issuerSeries = filteredFilings.map((filing) => {
    const issuer = filing.issuers.find((item) => item.issuer === selectedIssuer);
    return {
      period: formatPeriod(filing.reportDate),
      value: issuer?.value ?? 0,
      shares: issuer?.shares ?? 0,
    };
  });

  const issuerOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const issuers = [...new Set(filteredFilings.flatMap((filing) => filing.issuers.map((issuer) => issuer.issuer)))];
    return issuers
      .sort()
      .filter((issuer) => issuer.toLowerCase().includes(normalizedQuery))
      .slice(0, 12);
  }, [filteredFilings, query]);

  const allRows = useMemo(() => {
    return filteredFilings.flatMap((filing) =>
      filing.positions.map((position) => ({
        ...position,
        reportDate: filing.reportDate,
        period: formatPeriod(filing.reportDate),
        weight: filing.filteredSummary.totalValue === 0 ? 0 : position.value / filing.filteredSummary.totalValue,
      })),
    );
  }, [filteredFilings]);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allRows
      .filter((row) => !normalizedQuery || row.issuer.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.value - a.value)
      .slice(0, 80);
  }, [allRows, query]);

  const treemapData = latest.issuers.slice(0, 18).map((issuer) => ({
    name: issuer.issuer,
    size: issuer.value,
  }));
  const selectedPieFiling = filings.find((filing) => filing.reportDate === selectedPieFilingDate) ?? filings.at(-1)!;
  const equityAllocationData = equityAllocationsForFiling(selectedPieFiling);
  const selectedPieTotal = equityAllocationData.reduce((sum, item) => sum + item.value, 0);
  const priceSecurities = priceData.securities
    .filter((security) => security.ticker && security.prices.length > 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const selectedSecurity =
    priceSecurities.find((security) => security.issuer === selectedPriceIssuer) ?? priceSecurities[0];
  const latestMarker = selectedSecurity?.markers.at(-1);
  const priceStart = selectedSecurity?.prices[0]?.adjustedClose ?? 0;
  const priceEnd = selectedSecurity?.prices.at(-1)?.adjustedClose ?? 0;
  const priceChange = priceStart === 0 ? 0 : ((priceEnd - priceStart) / priceStart) * 100;
  const markerByDate = new Map((selectedSecurity?.markers ?? []).map((marker) => [marker.date, marker]));
  const priceChartData: PriceChartPoint[] = (selectedSecurity?.prices ?? []).map((point) => {
    const marker = markerByDate.get(point.date);
    return {
      ...point,
      marker,
      markerPrice: marker?.price ?? null,
    };
  });
  const priceValues = priceChartData
    .map((point) => point.adjustedClose)
    .filter((value): value is number => Boolean(value && value > 0));
  const priceMinValue = Math.min(...priceValues);
  const priceMaxValue = Math.max(...priceValues);
  const priceLogDomain: [number, number] = [Math.max(0.01, priceMinValue * 0.92), priceMaxValue * 1.08];
  const showPriceMarker = (point: unknown) => {
    const marker = (point as { payload?: PriceChartPoint })?.payload?.marker;
    if (marker) {
      setActivePriceMarker(marker);
    }
  };
  const simulator = buildSimulatorSeries(filings, priceSecurities, priceData.benchmarks?.[0]);
  const simulatorByDate = new Map(simulator.series.map((point) => [point.date, point.value]));
  const simulatorValues = simulator.series.flatMap((point) =>
    [point.value, point.benchmarkValue].filter((value): value is number => Boolean(value && value > 0)),
  );
  const simulatorMinValue = Math.min(...simulatorValues);
  const simulatorMaxValue = Math.max(...simulatorValues);
  const simulatorLogDomain: [number, number] = [
    Math.max(1, simulatorMinValue * 0.92),
    simulatorMaxValue * 1.08,
  ];
  const overlayDates = [...new Set(priceSecurities.flatMap((security) => security.prices.map((point) => point.date)))].sort();
  const overlayMarkerDates = new Set(
    [
      ...priceSecurities.flatMap((security) => security.markers.map((marker) => marker.date)),
      ...simulator.events.map((event) => event.date),
    ],
  );
  const overlayRenderDateSet = new Set(
    overlayDates.filter(
      (date, index) =>
        index === 0 || index === overlayDates.length - 1 || index % 5 === 0 || overlayMarkerDates.has(date),
    ),
  );
  const overlaySecurities: OverlaySecurity[] = priceSecurities.map((security, index) => {
    const chartKey = `equity_${index}`;
    const multipleKey = `${chartKey}_multiple`;
    const firstPrice = security.prices[0]?.adjustedClose ?? 0;
    const latestPrice = security.prices.at(-1)?.adjustedClose ?? firstPrice;
    return {
      ...security,
      chartKey,
      multipleKey,
      color: COLORS[index % COLORS.length],
      latestPercent: firstPrice === 0 ? 0 : ((latestPrice - firstPrice) / firstPrice) * 100,
      markerPoints: security.markers.map((marker) => ({
        date: marker.date,
        dateMs: toDateMs(marker.date),
        [chartKey]: firstPrice === 0 ? 0 : ((marker.price - firstPrice) / firstPrice) * 100,
        [multipleKey]: firstPrice === 0 ? 1 : marker.price / firstPrice,
      })),
    };
  });
  const overlayPriceMaps = new Map(
    overlaySecurities.map((security) => [
      security.chartKey,
      new Map(security.prices.map((point) => [point.date, point.adjustedClose])),
    ]),
  );
  const overlayFullChartData = overlayDates.map((date) => {
    const row: Record<string, number | string> = { date, dateMs: toDateMs(date) };
    const simulatorValue = simulatorByDate.get(date);
    if (simulatorValue) {
      row.simulatorPercent = ((simulatorValue - 10000) / 10000) * 100;
      row.simulatorMultiple = simulatorValue / 10000;
    }
    for (const security of overlaySecurities) {
      const firstPrice = security.prices[0]?.adjustedClose ?? 0;
      const price = overlayPriceMaps.get(security.chartKey)?.get(date);
      if (firstPrice > 0 && price) {
        row[security.chartKey] = ((price - firstPrice) / firstPrice) * 100;
        row[security.multipleKey] = price / firstPrice;
      }
    }
    return row;
  });
  const overlayChartData = overlayFullChartData.filter((point) => overlayRenderDateSet.has(String(point.date)));
  const overlayLinearValues = overlayFullChartData.flatMap((point) =>
    [
      point.simulatorPercent,
      ...overlaySecurities.map((security) => point[security.chartKey]),
    ]
      .filter((value): value is number => typeof value === "number"),
  );
  const overlayMultipleValues = overlayFullChartData.flatMap((point) =>
    [
      point.simulatorMultiple,
      ...overlaySecurities.map((security) => point[security.multipleKey]),
    ]
      .filter((value): value is number => typeof value === "number" && value > 0),
  );
  const overlayLinearMin = Math.min(...overlayLinearValues);
  const overlayLinearMax = Math.max(...overlayLinearValues);
  const overlayLinearPadding = Math.max(10, (overlayLinearMax - overlayLinearMin) * 0.08);
  const overlayLinearDomain: [number, number] = [
    overlayLinearMin - overlayLinearPadding,
    overlayLinearMax + overlayLinearPadding,
  ];
  const overlayMultipleMin = Math.min(...overlayMultipleValues);
  const overlayMultipleMax = Math.max(...overlayMultipleValues);
  const overlayLogDomain: [number, number] = [
    Math.max(0.01, overlayMultipleMin * 0.9),
    overlayMultipleMax * 1.1,
  ];
  const visibleOverlayLegendSecurities = (
    highlightedOverlayKey
      ? overlaySecurities.filter((security) => security.chartKey === highlightedOverlayKey)
      : overlaySecurities
  )
    .slice()
    .sort((a, b) => b.latestPercent - a.latestPercent);
  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">SEC 13F dashboard</p>
          <h1>Situational Awareness LP</h1>
          <p className="lede">
            Position-level visualization across {filings.length} filings from {filings[0].reportDate} through{" "}
            {latest.reportDate}.
          </p>
        </div>
        <div className="hero-actions">
          <a href={latest.sourceUrl} target="_blank" rel="noreferrer">
            Latest filing <ExternalLink size={16} />
          </a>
        </div>
      </section>

      <section className="filters" aria-label="Dashboard filters">
        <div>
          <p className="eyebrow">Instrument type</p>
          <div className="segmented-control">
            {instrumentOptions.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={instrumentType === option}
                className={instrumentType === option ? "active" : ""}
                onClick={() => setInstrumentType(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="metrics" aria-label="Latest filing summary">
        <Metric label="Latest reported value" value={compactCurrency.format(latestTotal)} delta={pct(totalChange)} />
        <Metric label="Issuers" value={String(latest.filteredSummary.issuerCount)} />
        <Metric label="Position rows" value={String(latest.filteredSummary.positionRows)} />
        <Metric label="Latest report date" value={latest.reportDate} />
      </section>

      <section className="dashboard-grid">
        <ChartPanel title="Reported Value Over Time" icon={<Activity size={18} />}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={totalSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis yAxisId="left" tickFormatter={(value) => compactCurrency.format(Number(value))} width={74} />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip content={<CustomTooltip />} />
              <Bar yAxisId="right" dataKey="issuers" name="Issuers" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="total"
                name="Value"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Exposure By Instrument Type" icon={<BarChart3 size={18} />}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={typeSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(value) => compactCurrency.format(Number(value))} width={74} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="Equity" stackId="1" stroke="#059669" fill="#059669" fillOpacity={0.72} />
              <Area type="monotone" dataKey="Call" stackId="1" stroke="#ca8a04" fill="#ca8a04" fillOpacity={0.72} />
              <Area type="monotone" dataKey="Put" stackId="1" stroke="#dc2626" fill="#dc2626" fillOpacity={0.72} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Top Latest Issuers" icon={<BarChart3 size={18} />} wide>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={topIssuers} layout="vertical" margin={{ left: 12, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => compactCurrency.format(Number(value))} />
              <YAxis type="category" dataKey="issuer" width={178} tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]}>
                {topIssuers.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Latest Portfolio Map" icon={<Table2 size={18} />}>
          <ResponsiveContainer width="100%" height={360}>
            <Treemap data={treemapData} dataKey="size" nameKey="name" aspectRatio={4 / 3} stroke="#fff" fill="#2563eb">
              {treemapData.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Treemap>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Issuer History" icon={<Search size={18} />} wide>
          <div className="issuer-tools">
            <label>
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter issuers or table rows"
              />
            </label>
            <div className="issuer-pills">
              {issuerOptions.map((issuer) => (
                <button
                  key={issuer}
                  type="button"
                  className={issuer === selectedIssuer ? "active" : ""}
                  onClick={() => setSelectedIssuer(issuer)}
                >
                  {issuer}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={issuerSeries}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(value) => compactCurrency.format(Number(value))} width={74} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="value" name={selectedIssuer} stroke="#0891b2" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Equity Holdings Allocation" icon={<PieChartIcon />} wide>
          <div className="price-tools">
            <label>
              Filing date
              <select
                value={selectedPieFiling.reportDate}
                onChange={(event) => setSelectedPieFilingDate(event.target.value)}
              >
                {filings.map((filing) => (
                  <option key={filing.accession} value={filing.reportDate}>
                    {filing.reportDate} filed {filing.filingDate}
                  </option>
                ))}
              </select>
            </label>
            <div className="price-summary">
              <strong>{equityAllocationData.length} holdings</strong>
              <span>{compactCurrency.format(selectedPieTotal)} total equity value</span>
            </div>
          </div>
          <div className="pie-layout">
            <ResponsiveContainer width="100%" height={420}>
              <RechartsPieChart>
                <Tooltip content={<PieTooltip />} />
                <Pie
                  data={equityAllocationData}
                  dataKey="value"
                  nameKey="issuer"
                  cx="50%"
                  cy="50%"
                  innerRadius="42%"
                  minAngle={1}
                  outerRadius="78%"
                  paddingAngle={1}
                >
                  {equityAllocationData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </RechartsPieChart>
            </ResponsiveContainer>
            <div className="allocation-list">
              {equityAllocationData.map((holding, index) => (
                <div key={holding.issuer} className="allocation-row">
                  <span className="swatch" style={{ background: COLORS[index % COLORS.length] }} />
                  <strong>{holding.issuer}</strong>
                  <span>{pct(holding.percent)}</span>
                  <em>{compactCurrency.format(holding.value)}</em>
                </div>
              ))}
            </div>
          </div>
        </ChartPanel>

        <ChartPanel title="Equity Price History With Filing Changes" icon={<Activity size={18} />} wide>
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Y-axis scale</p>
              <div className="segmented-control small">
                <button
                  type="button"
                  aria-pressed={priceScale === "linear"}
                  className={priceScale === "linear" ? "active" : ""}
                  onClick={() => setPriceScale("linear")}
                >
                  Linear
                </button>
                <button
                  type="button"
                  aria-pressed={priceScale === "log"}
                  className={priceScale === "log" ? "active" : ""}
                  onClick={() => setPriceScale("log")}
                >
                  Log
                </button>
              </div>
            </div>
          </div>
          <div className="price-tools">
            <label>
              Equity
              <select value={selectedSecurity?.issuer} onChange={(event) => setSelectedPriceIssuer(event.target.value)}>
                {priceSecurities.map((security) => (
                  <option key={security.issuer} value={security.issuer}>
                    {security.displayName} ({security.ticker})
                  </option>
                ))}
              </select>
            </label>
            <div className="price-summary">
              <strong>
                {selectedSecurity?.ticker} {pct(priceChange)}
              </strong>
              <span>
                {selectedSecurity?.markers.length ?? 0} reported holding changes
                {latestMarker ? `, latest exposure ${compactCurrency.format(latestMarker.value)}` : ""}
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={priceChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" minTickGap={36} tickFormatter={(value) => String(value).slice(2, 7)} />
              <YAxis
                allowDataOverflow={priceScale === "log"}
                domain={priceScale === "log" ? priceLogDomain : undefined}
                scale={priceScale}
                tickFormatter={(value) => compactCurrency.format(Number(value))}
                width={74}
              />
              <Tooltip content={<PriceTooltip />} />
              {activePriceMarker ? (
                <ReferenceArea
                  x1={activePriceMarker.windowStartDate}
                  x2={activePriceMarker.windowEndDate}
                  fill="#2563eb"
                  fillOpacity={0.12}
                  stroke="#2563eb"
                  strokeOpacity={0.35}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="adjustedClose"
                name="Adjusted close"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={false}
              />
              <Scatter
                dataKey="markerPrice"
                name="Reported holding change"
                fill="#dc2626"
                onMouseEnter={showPriceMarker}
                onMouseLeave={() => setActivePriceMarker(null)}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="filing-events">
            {(selectedSecurity?.markers ?? []).map((marker) => (
              <a key={`${marker.accession}-${marker.date}`} href={marker.sourceUrl} target="_blank" rel="noreferrer">
                <span>{marker.reportDate}</span>
                <strong>{compactCurrency.format(marker.value)}</strong>
                <em>{compactCurrency.format(marker.delta)}</em>
              </a>
            ))}
          </div>
        </ChartPanel>

        <ChartPanel title="All Equity Price Performance Overlay" icon={<Activity size={18} />} wide>
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Y-axis scale</p>
              <div className="segmented-control small">
                <button
                  type="button"
                  aria-pressed={overlayScale === "linear"}
                  className={overlayScale === "linear" ? "active" : ""}
                  onClick={() => setOverlayScale("linear")}
                >
                  Linear
                </button>
                <button
                  type="button"
                  aria-pressed={overlayScale === "log"}
                  className={overlayScale === "log" ? "active" : ""}
                  onClick={() => setOverlayScale("log")}
                >
                  Log
                </button>
              </div>
            </div>
          </div>
          <div className="price-tools">
            <div className="price-summary">
              <strong>{overlaySecurities.length} equities</strong>
              <span>Each line is normalized to 0%; bold black line is the simulated copycat portfolio</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={460}>
            <ComposedChart data={overlayChartData} onMouseLeave={() => setHighlightedOverlayKey(null)}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="dateMs"
                domain={["dataMin", "dataMax"]}
                minTickGap={36}
                scale="time"
                tickFormatter={formatAxisDate}
                type="number"
              />
              <YAxis
                allowDataOverflow={overlayScale === "log"}
                domain={overlayScale === "log" ? overlayLogDomain : overlayLinearDomain}
                scale={overlayScale}
                tickFormatter={(value) => pct(overlayScale === "log" ? (Number(value) - 1) * 100 : Number(value))}
                width={74}
              />
              <ReferenceLine
                y={overlayScale === "log" ? 1 : 0}
                stroke="#94a3b8"
                strokeDasharray="4 4"
              />
              {overlaySecurities.map((security) => (
                <Line
                  key={security.chartKey}
                  type="monotone"
                  dataKey={overlayScale === "log" ? security.multipleKey : security.chartKey}
                  name={`${security.displayName} (${security.ticker})`}
                  stroke={security.color}
                  strokeOpacity={
                    highlightedOverlayKey ? (highlightedOverlayKey === security.chartKey ? 1 : 0.12) : 0.68
                  }
                  strokeWidth={highlightedOverlayKey === security.chartKey ? 3 : 1.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  onMouseEnter={() => setHighlightedOverlayKey(security.chartKey)}
                />
              ))}
              {overlaySecurities.map((security) => (
                <Scatter
                  key={`${security.chartKey}-markers`}
                  data={security.markerPoints}
                  dataKey={overlayScale === "log" ? security.multipleKey : security.chartKey}
                  name={`${security.displayName} holding change`}
                  fill={security.color}
                  opacity={
                    highlightedOverlayKey ? (highlightedOverlayKey === security.chartKey ? 1 : 0.12) : 0.72
                  }
                  isAnimationActive={false}
                  onMouseEnter={() => setHighlightedOverlayKey(security.chartKey)}
                />
              ))}
              {overlaySecurities.map((security) => (
                <Line
                  key={`${security.chartKey}-hover-target`}
                  type="monotone"
                  dataKey={overlayScale === "log" ? security.multipleKey : security.chartKey}
                  stroke={security.color}
                  strokeOpacity={0.001}
                  strokeWidth={14}
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  legendType="none"
                  onMouseEnter={() => setHighlightedOverlayKey(security.chartKey)}
                  onMouseMove={() => setHighlightedOverlayKey(security.chartKey)}
                />
              ))}
              <Line
                type="monotone"
                dataKey={overlayScale === "log" ? "simulatorMultiple" : "simulatorPercent"}
                name="Simulated copycat portfolio"
                stroke="#0f172a"
                strokeOpacity={1}
                strokeWidth={4}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="overlay-legend">
            {visibleOverlayLegendSecurities.map((security) => (
              <button
                type="button"
                key={security.chartKey}
                className={`overlay-legend-item${highlightedOverlayKey === security.chartKey ? " highlighted" : ""}`}
                onClick={() =>
                  setHighlightedOverlayKey((current) => (current === security.chartKey ? null : security.chartKey))
                }
              >
                <span className="swatch" style={{ background: security.color }} />
                <strong>{security.ticker}</strong>
                <span>{security.displayName}</span>
                <em className={security.latestPercent >= 0 ? "positive" : "negative"}>{pct(security.latestPercent)}</em>
              </button>
            ))}
          </div>
        </ChartPanel>

        <ChartPanel title="Public Filing Copycat Simulator" icon={<Activity size={18} />} wide>
          <div className="panel-toolbar">
            <div>
              <p className="eyebrow">Y-axis scale</p>
              <div className="segmented-control small">
                <button
                  type="button"
                  aria-pressed={simulatorScale === "linear"}
                  className={simulatorScale === "linear" ? "active" : ""}
                  onClick={() => setSimulatorScale("linear")}
                >
                  Linear
                </button>
                <button
                  type="button"
                  aria-pressed={simulatorScale === "log"}
                  className={simulatorScale === "log" ? "active" : ""}
                  onClick={() => setSimulatorScale("log")}
                >
                  Log
                </button>
              </div>
            </div>
          </div>
          <div className="simulator-summary">
            <article>
              <span>Starting value</span>
              <strong>{currency.format(10000)}</strong>
            </article>
            <article>
              <span>Latest simulated value</span>
              <strong>{currency.format(simulator.endingValue)}</strong>
            </article>
            <article>
              <span>Total return</span>
              <strong className={simulator.totalReturn >= 0 ? "positive" : "negative"}>{pct(simulator.totalReturn)}</strong>
            </article>
            <article>
              <span>Rebalances</span>
              <strong>{simulator.events.length}</strong>
            </article>
            <article>
              <span>S&amp;P 500 value</span>
              <strong>{currency.format(simulator.benchmarkEndingValue)}</strong>
            </article>
            <article>
              <span>S&amp;P 500 return</span>
              <strong className={simulator.benchmarkReturn >= 0 ? "positive" : "negative"}>
                {pct(simulator.benchmarkReturn)}
              </strong>
            </article>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={simulator.series}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" minTickGap={36} tickFormatter={(value) => String(value).slice(2, 7)} />
              <YAxis
                allowDataOverflow={simulatorScale === "log"}
                domain={simulatorScale === "log" ? simulatorLogDomain : undefined}
                scale={simulatorScale}
                tickFormatter={(value) => compactCurrency.format(Number(value))}
                width={74}
              />
              <Tooltip content={<SimulatorTooltip />} />
              {simulator.events.map((event) => (
                <ReferenceLine key={event.date} x={event.date} stroke="#94a3b8" strokeDasharray="4 4" />
              ))}
              <Line
                type="monotone"
                dataKey="value"
                name="Simulated value"
                stroke="#059669"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="benchmarkValue"
                name="S&P 500"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={false}
              />
              <Scatter dataKey="rebalanceValue" name="Rebalance" fill="#ca8a04" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="filing-events simulator-events">
            {simulator.events.map((event) => (
              <a key={`${event.date}-${event.reportDate}`} href={event.sourceUrl} target="_blank" rel="noreferrer">
                <span>{event.filingDate}</span>
                <strong>{currency.format(event.value)}</strong>
                <em>{event.holdings} holdings</em>
              </a>
            ))}
          </div>
        </ChartPanel>
      </section>

      <section className="positions-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{instrumentType === ALL_INSTRUMENTS ? "All filings" : `${instrumentType} rows`}</p>
            <h2>Position Rows</h2>
          </div>
          <span>{visibleRows.length} shown</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Issuer</th>
                <th>Type</th>
                <th>CUSIP</th>
                <th>Value</th>
                <th>Shares / principal</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={`${row.reportDate}-${row.cusip}-${row.positionType}-${row.value}`}>
                  <td>{row.reportDate}</td>
                  <td>{row.issuer}</td>
                  <td>
                    <span className={`type-badge ${row.positionType.toLowerCase()}`}>{row.positionType}</span>
                  </td>
                  <td>{row.cusip}</td>
                  <td>{currency.format(row.value)}</td>
                  <td>{compactNumber.format(row.shares)}</td>
                  <td>{pct(row.weight * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta?: string }) {
  const positive = delta && !delta.startsWith("-");
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {delta ? (
        <small className={positive ? "positive" : "negative"}>
          {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {delta} vs prior filing
        </small>
      ) : null}
    </article>
  );
}

function ChartPanel({
  title,
  icon,
  wide,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={wide ? "panel wide" : "panel"}>
      <div className="panel-heading">
        <h2>
          {icon}
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
