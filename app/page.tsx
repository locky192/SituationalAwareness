import filingsData from "@/data/filings.json";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";
import type { FilingsData } from "@/components/PortfolioDashboard";

export default function Home() {
  return <PortfolioDashboard data={filingsData as FilingsData} />;
}
