"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
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
  ResponsiveContainer,
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

type ChartTooltipPayload = {
  dataKey?: string | number;
  name?: string | number;
  value?: number;
  color?: string;
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

export function PortfolioDashboard({ data }: { data: FilingsData }) {
  const [selectedIssuer, setSelectedIssuer] = useState("NVIDIA CORP");
  const [query, setQuery] = useState("");

  const filings = data.filings;
  const latest = filings.at(-1)!;
  const previous = filings.at(-2)!;

  const totalSeries = filings.map((filing) => ({
    period: formatPeriod(filing.reportDate),
    fullDate: filing.reportDate,
    total: filing.summary.totalValue,
    issuers: filing.summary.issuerCount,
    rows: filing.summary.positionRows,
  }));

  const typeSeries = filings.map((filing) => ({
    period: formatPeriod(filing.reportDate),
    Equity: filing.summary.typeTotals.Equity ?? 0,
    Call: filing.summary.typeTotals.Call ?? 0,
    Put: filing.summary.typeTotals.Put ?? 0,
  }));

  const topIssuers = latest.issuers.slice(0, 10);
  const latestTotal = latest.summary.totalValue;
  const previousTotal = previous.summary.totalValue;
  const totalChange = ((latestTotal - previousTotal) / previousTotal) * 100;

  const issuerSeries = filings.map((filing) => {
    const issuer = filing.issuers.find((item) => item.issuer === selectedIssuer);
    return {
      period: formatPeriod(filing.reportDate),
      value: issuer?.value ?? 0,
      shares: issuer?.shares ?? 0,
    };
  });

  const issuerOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.allIssuers
      .filter((issuer) => issuer.toLowerCase().includes(normalizedQuery))
      .slice(0, 12);
  }, [data.allIssuers, query]);

  const allRows = useMemo(() => {
    return filings.flatMap((filing) =>
      filing.positions.map((position) => ({
        ...position,
        reportDate: filing.reportDate,
        period: formatPeriod(filing.reportDate),
        weight: position.value / filing.summary.totalValue,
      })),
    );
  }, [filings]);

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

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">SEC 13F dashboard</p>
          <h1>Situational Awareness LP</h1>
          <p className="lede">
            Position-level visualization across {filings.length} filings from{" "}
            {filings[0].reportDate} through {latest.reportDate}.
          </p>
        </div>
        <div className="hero-actions">
          <a href={latest.sourceUrl} target="_blank" rel="noreferrer">
            Latest filing <ExternalLink size={16} />
          </a>
        </div>
      </section>

      <section className="metrics" aria-label="Latest filing summary">
        <Metric label="Latest reported value" value={compactCurrency.format(latestTotal)} delta={pct(totalChange)} />
        <Metric label="Issuers" value={String(latest.summary.issuerCount)} />
        <Metric label="Position rows" value={String(latest.summary.positionRows)} />
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
      </section>

      <section className="positions-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">All filings</p>
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
