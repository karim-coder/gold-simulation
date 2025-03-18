import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Upload } from "lucide-react";
import { lastTwoYearsGoldPriceData, goldPriceHistory } from "@/lib/data";

type TradeData = {
  entry: string;
  exit: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  type: "long" | "short";
};

type SimulationResults = {
  final_capital: number;
  total_profit_loss: number;
  total_trades: number;
  total_fees: number;
  equity_curve: { date: string; equity: number }[];
  trade_history: TradeData[];
  success_rate: number;
  max_drawdown: number;
  max_consecutive_losses: number;
  avg_profit_per_trade: number;
};

type SimulationParams = {
  investmentCapital: number;
  positionSize: number;
  leverage: number;
  stopLoss: number;
  profitTarget: number;
  minPriceMovement: number;
  dailyFees: number;
};

const validateParams = (params: SimulationParams): boolean => {
  if (params.investmentCapital <= 0) return false;
  if (params.positionSize <= 0 || params.positionSize > 100) return false;
  if (params.leverage <= 0 || params.leverage > 100) return false;
  if (params.stopLoss <= 0) return false;
  if (params.profitTarget <= 0) return false;
  if (params.minPriceMovement <= 0) return false;
  if (params.dailyFees < 0) return false;
  return true;
};

const calculateDrawdown = (equityCurve: { equity: number }[]): number => {
  let maxDrawdown = 0;
  let peak = equityCurve[0].equity;

  for (const point of equityCurve) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    const drawdown = ((peak - point.equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return maxDrawdown;
};

const TradingSimulator: React.FC = () => {
  const [params, setParams] = useState<SimulationParams>({
    investmentCapital: 10000, // Starting capital in USD
    positionSize: 2, // 2% risk per trade
    leverage: 100, // 100x leverage
    stopLoss: 25, // $25 USD stop loss
    profitTarget: 50, // $50 USD profit target
    minPriceMovement: 0.3, // 0.3% minimum price movement
    dailyFees: 2, // $2 USD daily fees
  });

  const [results, setResults] = useState<SimulationResults | null>(null);
  const [activeTradeIndex, setActiveTradeIndex] = useState<number | null>(null);

  const shouldEnterTrade = (
    currentPrice: number,
    previousPrice: number,
    threshold: number
  ): { shouldEnter: boolean; type: "long" | "short" } => {
    const priceMovement =
      ((currentPrice - previousPrice) / previousPrice) * 100;
    return {
      shouldEnter: Math.abs(priceMovement) >= threshold,
      type: priceMovement > 0 ? "long" : "short",
    };
  };

  const runSimulation = () => {
    if (!validateParams(params)) {
      alert("Invalid parameters!");
      return;
    }

    let currentCapital = params.investmentCapital;
    let totalProfitLoss = 0;
    let tradesExecuted = 0;
    let totalFees = 0;
    let consecutiveLosses = 0;
    let maxConsecutiveLosses = 0;

    const equityCurve: { date: string; equity: number }[] = [];
    const tradeHistory: TradeData[] = [];

    let openPosition: {
      entryPrice: number;
      entryDate: string;
      marketValue: number;
      type: "long" | "short";
    } | null = null;

    let lastTradeDate: string | null = null;

    for (let index = 1; index < lastTwoYearsGoldPriceData.length; index++) {
      const { date, price } = lastTwoYearsGoldPriceData[index];
      const previousPrice = lastTwoYearsGoldPriceData[index - 1].price;

      if (currentCapital <= 0) break;

      // Apply daily fees
      if (lastTradeDate !== date) {
        if (currentCapital >= params.dailyFees) {
          currentCapital -= params.dailyFees;
          totalFees += params.dailyFees;
          lastTradeDate = date;
        } else {
          break;
        }
      }

      // Check for trade entry
      if (!openPosition && currentCapital > 0) {
        const { shouldEnter, type } = shouldEnterTrade(
          price,
          previousPrice,
          params.minPriceMovement
        );

        if (shouldEnter) {
          const positionSize = Math.min(
            (params.positionSize / 100) * currentCapital,
            currentCapital * (params.leverage / 100)
          );

          openPosition = {
            entryPrice: price,
            entryDate: date,
            marketValue: positionSize * params.leverage,
            type,
          };
          tradesExecuted++;
        }
      }

      // Manage open positions
      if (openPosition) {
        const priceChange = price - openPosition.entryPrice;
        const adjustedPriceChange =
          openPosition.type === "long" ? priceChange : -priceChange;
        const percentageChange =
          (adjustedPriceChange / openPosition.entryPrice) * 100;
        const pnl = (openPosition.marketValue * percentageChange) / 100;

        if (Math.abs(pnl) >= params.stopLoss || pnl >= params.profitTarget) {
          currentCapital += pnl;
          totalProfitLoss += pnl;

          tradeHistory.push({
            entry: openPosition.entryDate,
            exit: date,
            entryPrice: openPosition.entryPrice,
            exitPrice: price,
            pnl,
            type: openPosition.type,
          });

          // Track consecutive losses
          if (pnl < 0) {
            consecutiveLosses++;
            maxConsecutiveLosses = Math.max(
              maxConsecutiveLosses,
              consecutiveLosses
            );
          } else {
            consecutiveLosses = 0;
          }

          openPosition = null;
        }
      }

      equityCurve.push({
        date,
        equity: currentCapital,
      });
    }

    const successRate =
      tradeHistory.length > 0
        ? tradeHistory.filter((t) => t.pnl > 0).length / tradeHistory.length
        : 0;

    setResults({
      final_capital: currentCapital,
      total_profit_loss: totalProfitLoss,
      total_trades: tradesExecuted,
      total_fees: totalFees,
      equity_curve: equityCurve,
      trade_history: tradeHistory,
      success_rate: successRate,
      max_drawdown: calculateDrawdown(equityCurve),
      max_consecutive_losses: maxConsecutiveLosses,
      avg_profit_per_trade: totalProfitLoss / (tradesExecuted || 1),
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const renderGoldPriceChart = () => {
    if (!results) return null;

    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lastTwoYearsGoldPriceData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
            <YAxis domain={["auto", "auto"]} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#FFD700"
              dot={false}
            />
            {activeTradeIndex !== null &&
              results.trade_history[activeTradeIndex] && (
                <>
                  <ReferenceLine
                    x={results.trade_history[activeTradeIndex].entry}
                    stroke="green"
                    label="Entry"
                  />
                  <ReferenceLine
                    x={results.trade_history[activeTradeIndex].exit}
                    stroke="red"
                    label="Exit"
                  />
                </>
              )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const fetchGoldPrices = async () => {
    try {
      // Calculate date range for last 5 years
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 5);
      const startDateStr = startDate.toISOString().split("T")[0];

      const apikey = import.meta.env.VITE_POLYGON_API_KEY;

      // Replace YOUR_API_KEY with your Polygon.io API key
      const response = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/C:XAUUSD/range/1/day/${startDateStr}/${endDate}?apiKey=${apikey}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch data");
      }

      const jsonData = await response.json();

      if (!jsonData.results) {
        throw new Error("No data received from API");
      }

      // Process the data for the chart
      const formattedData = jsonData.results.map((item) => ({
        date: new Date(item.t).toLocaleDateString(),
        price: item.o > item.c ? item.c : item.o,
      }));
      console.log(formattedData);
    } catch (err) {
      console.error("Error fetching gold prices:", err);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Gold Price Simulation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="text-sm text-gray-500 mt-2">
              {lastTwoYearsGoldPriceData.length} price points loaded from static
              data
            </div>
          </div>
          <Button onClick={fetchGoldPrices} className="w-full">
            Get data
          </Button>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {Object.entries(params).map(([key, value]) => (
              <div className="space-y-2" key={key}>
                <label className="text-sm font-medium">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                  {key === "minPriceMovement" && " (% threshold)"}
                </label>
                <Input
                  type="number"
                  value={value}
                  onChange={(e) =>
                    setParams({ ...params, [key]: parseFloat(e.target.value) })
                  }
                />
              </div>
            ))}
          </div>

          <Button onClick={runSimulation} className="w-full">
            <Upload className="mr-2 h-4 w-4" /> Run Simulation
          </Button>
        </CardContent>
      </Card>

      {results && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Gold Price Chart</CardTitle>
            </CardHeader>
            <CardContent>{renderGoldPriceChart()}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Simulation Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Total P&L</div>
                  <div
                    className={`text-2xl font-bold ${
                      results.total_profit_loss >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(results.total_profit_loss)}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Final Capital</div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(results.final_capital)}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Success Rate</div>
                  <div className="text-2xl font-bold">
                    {(results.success_rate * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Total Trades</div>
                  <div className="text-2xl font-bold">
                    {results.total_trades}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Max Drawdown</div>
                  <div className="text-2xl font-bold">
                    {results.max_drawdown.toFixed(2)}%
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Avg Profit/Trade</div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(results.avg_profit_per_trade)}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">
                    Max Consecutive Losses
                  </div>
                  <div className="text-2xl font-bold">
                    {results.max_consecutive_losses}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Total Fees</div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(results.total_fees)}
                  </div>
                </div>
              </div>

              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results.equity_curve}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis domain={["auto", "auto"]} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="equity"
                      stroke="#2563eb"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default TradingSimulator;
