import filingsData from "@/data/filings.json";
import priceData from "@/data/price-series.json";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import type { FilingsData, PriceData } from "@/components/PortfolioDashboard";

export default function Home() {
  return <PortfolioDashboard data={filingsData as FilingsData} priceData={priceData as PriceData} />;
}
