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
  highestPrice: number;
  baseAmount: number;
  leveragedAmount: number;
  pnl: number;
  type: "long" | "short";
  exitReason: "take profit" | "stop loss" | "end of simulation";
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
  open_position: {
    entryDate: string;
    entryPrice: number;
    currentPrice: number;
    highestPrice: number;
    baseAmount: number;
    leveragedAmount: number;
    currentPnL: number;
  } | null;
};

type SimulationParams = {
  investmentCapital: number;
  positionSize: number; // % of capital to risk per trade
  leverage: number;
  stopLoss: number; // In USD, from highest price reached
  profitTarget: number; // In USD
  minPriceMovement: number; // % threshold for entry
  dailyFees: number; // USD
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

// Helper function to format numbers with commas
const formatNumber = (num: number): string => {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const TradingSimulator: React.FC = () => {
  const [params, setParams] = useState<SimulationParams>({
    investmentCapital: 10000, // Starting capital in USD
    positionSize: 1, // 1% risk per trade
    leverage: 100, // 100x leverage
    stopLoss: 200, // $200 USD trailing stop loss
    profitTarget: 500, // $500 USD profit target
    minPriceMovement: 0.3, // 0.3% minimum price movement
    dailyFees: 2, // $2 USD daily fees
  });

  const [results, setResults] = useState<SimulationResults | null>(null);
  const [activeTradeIndex, setActiveTradeIndex] = useState<number | null>(null);

  // Check if we should enter a long position based on price movement
  const shouldEnterLongPosition = (
    currentPrice: number,
    previousPrice: number,
    threshold: number
  ): boolean => {
    const priceMovement =
      ((currentPrice - previousPrice) / previousPrice) * 100;
    return priceMovement >= threshold;
  };

  // Calculate the PnL for a position based on entry price, current price, and leveraged amount
  const calculatePnL = (
    entryPrice: number,
    currentPrice: number,
    leveragedAmount: number
  ): number => {
    const priceChange = (currentPrice - entryPrice) / entryPrice;
    return leveragedAmount * priceChange;
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
      baseAmount: number;
      leveragedAmount: number;
      highestPrice: number;
      type: "long";
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

      // Check for trade entry - LONG only
      if (!openPosition && currentCapital > 0) {
        const shouldEnter = shouldEnterLongPosition(
          price,
          previousPrice,
          params.minPriceMovement
        );

        if (shouldEnter) {
          // Calculate base amount (% of capital)
          const baseAmount = (params.positionSize / 100) * currentCapital;

          // Calculate leveraged position size
          const leveragedAmount = baseAmount * params.leverage;

          openPosition = {
            entryPrice: price,
            entryDate: date,
            baseAmount,
            leveragedAmount,
            highestPrice: price, // Initialize highest price to entry price
            type: "long",
          };
          tradesExecuted++;
        }
      }

      // Manage open positions
      if (openPosition) {
        // Update highest price if current price is higher
        if (price > openPosition.highestPrice) {
          openPosition.highestPrice = price;
        }

        // Calculate PnL based on entry and current price
        const pnl = calculatePnL(
          openPosition.entryPrice,
          price,
          openPosition.leveragedAmount
        );

        // Take profit check
        const takeProfitTarget = params.profitTarget;

        // Trailing stop loss check - from highest price reached
        const highestPnL = calculatePnL(
          openPosition.entryPrice,
          openPosition.highestPrice,
          openPosition.leveragedAmount
        );

        const currentPnLFromHighest = pnl - highestPnL;
        const stopLossTriggered = currentPnLFromHighest <= -params.stopLoss;

        if (pnl >= takeProfitTarget || stopLossTriggered) {
          currentCapital += pnl;
          totalProfitLoss += pnl;

          const exitReason =
            pnl >= takeProfitTarget ? "take profit" : "stop loss";

          tradeHistory.push({
            entry: openPosition.entryDate,
            exit: date,
            entryPrice: openPosition.entryPrice,
            exitPrice: price,
            highestPrice: openPosition.highestPrice,
            baseAmount: openPosition.baseAmount,
            leveragedAmount: openPosition.leveragedAmount,
            pnl,
            type: "long",
            exitReason,
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

    // If we still have an open position at the end of simulation
    let finalOpenPosition = null;
    if (openPosition) {
      const lastPrice =
        lastTwoYearsGoldPriceData[lastTwoYearsGoldPriceData.length - 1].price;
      const currentPnL = calculatePnL(
        openPosition.entryPrice,
        lastPrice,
        openPosition.leveragedAmount
      );

      finalOpenPosition = {
        entryDate: openPosition.entryDate,
        entryPrice: openPosition.entryPrice,
        currentPrice: lastPrice,
        highestPrice: openPosition.highestPrice,
        baseAmount: openPosition.baseAmount,
        leveragedAmount: openPosition.leveragedAmount,
        currentPnL,
      };
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
      open_position: finalOpenPosition,
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
          <Button onClick={fetchGoldPrices} className="w-full mb-4">
            Get data
          </Button>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Investment Capital ($)
              </label>
              <Input
                type="number"
                value={params.investmentCapital}
                onChange={(e) =>
                  setParams({
                    ...params,
                    investmentCapital: parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Position Size (% of capital)
              </label>
              <Input
                type="number"
                value={params.positionSize}
                onChange={(e) =>
                  setParams({
                    ...params,
                    positionSize: parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Leverage (multiplier)
              </label>
              <Input
                type="number"
                value={params.leverage}
                onChange={(e) =>
                  setParams({ ...params, leverage: parseFloat(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Stop Loss ($)</label>
              <Input
                type="number"
                value={params.stopLoss}
                onChange={(e) =>
                  setParams({ ...params, stopLoss: parseFloat(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Profit Target ($)</label>
              <Input
                type="number"
                value={params.profitTarget}
                onChange={(e) =>
                  setParams({
                    ...params,
                    profitTarget: parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Min Price Movement (% threshold)
              </label>
              <Input
                type="number"
                value={params.minPriceMovement}
                onChange={(e) =>
                  setParams({
                    ...params,
                    minPriceMovement: parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Daily Fees ($)</label>
              <Input
                type="number"
                value={params.dailyFees}
                onChange={(e) =>
                  setParams({
                    ...params,
                    dailyFees: parseFloat(e.target.value),
                  })
                }
              />
            </div>
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

              {/* Equity Curve Chart */}
              <div className="h-64 mb-6">
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

              {/* Open Position (if any) */}
              {results.open_position && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Open Position</h3>
                  <div className="bg-blue-50 p-4 rounded">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm text-gray-600">Entry Date</div>
                        <div className="font-medium">
                          {results.open_position.entryDate}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Entry Price</div>
                        <div className="font-medium">
                          ${formatNumber(results.open_position.entryPrice)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">
                          Current Price
                        </div>
                        <div className="font-medium">
                          ${formatNumber(results.open_position.currentPrice)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">
                          Highest Price
                        </div>
                        <div className="font-medium">
                          ${formatNumber(results.open_position.highestPrice)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Base Amount</div>
                        <div className="font-medium">
                          {formatCurrency(results.open_position.baseAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">
                          Leveraged Amount
                        </div>
                        <div className="font-medium">
                          {formatCurrency(
                            results.open_position.leveragedAmount
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Current P&L</div>
                        <div
                          className={`font-medium ${
                            results.open_position.currentPnL >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(results.open_position.currentPnL)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Trade History */}
              <div>
                <h3 className="text-lg font-semibold mb-2">Trade History</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-4 py-2 text-left">#</th>
                        <th className="border px-4 py-2 text-left">
                          Entry Date
                        </th>
                        <th className="border px-4 py-2 text-left">
                          Exit Date
                        </th>
                        <th className="border px-4 py-2 text-right">
                          Entry Price
                        </th>
                        <th className="border px-4 py-2 text-right">
                          Highest Price
                        </th>
                        <th className="border px-4 py-2 text-right">
                          Exit Price
                        </th>
                        <th className="border px-4 py-2 text-right">
                          Base Amount
                        </th>
                        <th className="border px-4 py-2 text-right">
                          Leveraged Amount
                        </th>
                        <th className="border px-4 py-2 text-right">P&L</th>
                        <th className="border px-4 py-2 text-center">
                          Exit Reason
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.trade_history.map((trade, index) => (
                        <tr
                          key={index}
                          className={`${
                            index === activeTradeIndex ? "bg-blue-50" : ""
                          } hover:bg-gray-50 cursor-pointer`}
                          onClick={() => setActiveTradeIndex(index)}
                        >
                          <td className="border px-4 py-2">{index + 1}</td>
                          <td className="border px-4 py-2">{trade.entry}</td>
                          <td className="border px-4 py-2">{trade.exit}</td>
                          <td className="border px-4 py-2 text-right">
                            ${formatNumber(trade.entryPrice)}
                          </td>
                          <td className="border px-4 py-2 text-right">
                            ${formatNumber(trade.highestPrice)}
                          </td>
                          <td className="border px-4 py-2 text-right">
                            ${formatNumber(trade.exitPrice)}
                          </td>
                          <td className="border px-4 py-2 text-right">
                            {formatCurrency(trade.baseAmount)}
                          </td>
                          <td className="border px-4 py-2 text-right">
                            {formatCurrency(trade.leveragedAmount)}
                          </td>
                          <td
                            className={`border px-4 py-2 text-right ${
                              trade.pnl >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(trade.pnl)}
                          </td>
                          <td className="border px-4 py-2 text-center">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                trade.exitReason === "take profit"
                                  ? "bg-green-100 text-green-800"
                                  : trade.exitReason === "stop loss"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {trade.exitReason}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default TradingSimulator;
