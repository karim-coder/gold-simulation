import { PerformanceMetrics, SimulationParams, TradeRecord } from "@/lib/types";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// utils.ts

export const calculatePerformanceMetrics = (
  tradeHistory: TradeRecord[],
  equityCurve: { date: string; equity: number }[]
): PerformanceMetrics => {
  const wins = tradeHistory.filter((t) => t.pnl > 0);
  const losses = tradeHistory.filter((t) => t.pnl < 0);

  const winRate = wins.length / tradeHistory.length;
  const averageWin =
    wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
  const averageLoss =
    losses.length > 0
      ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length)
      : 0;

  let maxDrawdown = 0;
  let peak = -Infinity;
  equityCurve.forEach((point) => {
    if (point.equity > peak) peak = point.equity;
    const drawdown = (peak - point.equity) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  const returns = equityCurve.map((point, i, arr) =>
    i === 0 ? 0 : (point.equity - arr[i - 1].equity) / arr[i - 1].equity
  );

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdReturn = Math.sqrt(
    returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) /
      returns.length
  );

  const sharpeRatio = (meanReturn / stdReturn) * Math.sqrt(252);

  return {
    maxDrawdown,
    sharpeRatio,
    winRate,
    averageWin,
    averageLoss,
    profitFactor: (averageWin * winRate) / (averageLoss * (1 - winRate)),
    maxConsecutiveLosses: calculateMaxConsecutiveLosses(tradeHistory),
    dailyReturnVolatility: stdReturn * Math.sqrt(252) * 100,
  };
};

export const validateRiskManagement = (
  capital: number,
  marketValue: number,
  params: SimulationParams
): boolean => {
  if (capital <= 0) return false;

  const currentLeverage = marketValue / capital;
  if (currentLeverage > params.leverage) return false;

  const maxPositionSize = capital * (params.positionSize / 100);
  if (marketValue > maxPositionSize * params.leverage) return false;

  return true;
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const calculateMaxConsecutiveLosses = (tradeHistory: TradeRecord[]): number => {
  let maxConsecutive = 0;
  let current = 0;

  tradeHistory.forEach((trade) => {
    if (trade.pnl < 0) {
      current++;
      maxConsecutive = Math.max(maxConsecutive, current);
    } else {
      current = 0;
    }
  });

  return maxConsecutive;
};

export interface GoldPriceDataType {
  currentPrice: number;
  openingPrice: number;
  highestPrice: number;
  lowestPrice: number;
  date: string;
}

export interface RawGoldPriceData {
  c: number;
  o: number;
  h: number;
  l: number;
  t: number;
}

export const transformGoldPriceData = (
  data: RawGoldPriceData[]
): GoldPriceDataType[] => {
  return data.map(({ c, o, h, l, t }) => ({
    currentPrice: c,
    openingPrice: o,
    highestPrice: h,
    lowestPrice: l,
    date: new Date(t).toLocaleDateString("en-US"),
  }));
};
