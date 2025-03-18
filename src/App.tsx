import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// import { Checkbox } from "@/components/ui/checkbox";
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
  open_position: TradeData | null;
};

type SimulationParams = {
  investmentCapital: number;
  positionSize: number;
  leverage: number;
  stopLoss: number;
  minPriceMovement: number;
  dailyFees: number;
  useTrailingStop: boolean;
};

const validateParams = (params: SimulationParams): boolean => {
  if (params.investmentCapital <= 0) return false;
  if (params.positionSize <= 0 || params.positionSize > 100) return false;
  if (params.leverage <= 0 || params.leverage > 100) return false;
  if (params.stopLoss <= 0) return false;
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
    positionSize: 1, // 1% risk per trade
    leverage: 100, // 100x leverage
    stopLoss: 200, // $200 USD stop loss
    minPriceMovement: 0.3, // 0.3% minimum price movement
    dailyFees: 2, // $2 USD daily fees
    useTrailingStop: true, // Enable trailing stop by default
  });

  const [results, setResults] = useState<SimulationResults | null>(null);
  const [activeTradeIndex, setActiveTradeIndex] = useState<number | null>(null);

  const shouldEnterTrade = (
    currentPrice: number,
    previousPrice: number,
    threshold: number
  ): boolean => {
    const priceMovement =
      ((currentPrice - previousPrice) / previousPrice) * 100;
    return priceMovement >= threshold; // Only LONG positions when price increases
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

      // Check for trade entry - LONG positions only
      if (!openPosition && currentCapital > 0) {
        const shouldEnter = shouldEnterTrade(
          price,
          previousPrice,
          params.minPriceMovement
        );

        if (shouldEnter) {
          // Calculate base amount and leveraged position size
          const baseAmount = (params.positionSize / 100) * currentCapital;
          const leveragedAmount = baseAmount * params.leverage;

          openPosition = {
            entryPrice: price,
            entryDate: date,
            baseAmount,
            leveragedAmount,
            highestPrice: price, // Initialize highest price with entry price
          };
          tradesExecuted++;
        }
      }

      // Manage open positions with trailing stop
      if (openPosition) {
        // Update highest price reached during the trade
        if (price > openPosition.highestPrice) {
          openPosition.highestPrice = price;
        }

        // Calculate P&L
        const positionValue =
          openPosition.leveragedAmount * (price / openPosition.entryPrice);
        const pnl = positionValue - openPosition.leveragedAmount;

        // Calculate stop loss trigger based on trailing stop
        let stopLossTriggered = false;

        if (params.useTrailingStop) {
          // For trailing stop: calculate from highest price reached
          const highestValue =
            openPosition.leveragedAmount *
            (openPosition.highestPrice / openPosition.entryPrice);
          const currentValue =
            openPosition.leveragedAmount * (price / openPosition.entryPrice);
          const drawdown = highestValue - currentValue;

          stopLossTriggered = drawdown >= params.stopLoss;
        } else {
          // For fixed stop: calculate from entry price
          stopLossTriggered = pnl <= -params.stopLoss;
        }

        // Close position if stop loss triggered
        if (stopLossTriggered) {
          currentCapital += pnl;
          totalProfitLoss += pnl;

          tradeHistory.push({
            entry: openPosition.entryDate,
            exit: date,
            entryPrice: openPosition.entryPrice,
            exitPrice: price,
            highestPrice: openPosition.highestPrice,
            baseAmount: openPosition.baseAmount,
            leveragedAmount: openPosition.leveragedAmount,
            pnl,
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

    // Close any open position at the end of simulation using last available price
    if (openPosition) {
      const lastPrice =
        lastTwoYearsGoldPriceData[lastTwoYearsGoldPriceData.length - 1].price;
      const positionValue =
        openPosition.leveragedAmount * (lastPrice / openPosition.entryPrice);
      const pnl = positionValue - openPosition.leveragedAmount;

      currentCapital += pnl;
      totalProfitLoss += pnl;

      const lastDate =
        lastTwoYearsGoldPriceData[lastTwoYearsGoldPriceData.length - 1].date;

      const finalTrade = {
        entry: openPosition.entryDate,
        exit: lastDate,
        entryPrice: openPosition.entryPrice,
        exitPrice: lastPrice,
        highestPrice: openPosition.highestPrice,
        baseAmount: openPosition.baseAmount,
        leveragedAmount: openPosition.leveragedAmount,
        pnl,
      };

      tradeHistory.push(finalTrade);
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
      open_position: null,
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

  const renderTradeDetails = () => {
    if (!results || results.trade_history.length === 0) return null;

    return (
      <div className="mt-4 overflow-x-auto">
        <div className="text-lg font-semibold mb-2">Trade History</div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trade
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entry Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entry Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Exit Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Exit Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Highest Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Base Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Leveraged Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                P&L
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.trade_history.map((trade, index) => (
              <tr
                key={index}
                className={`hover:bg-gray-100 cursor-pointer ${
                  activeTradeIndex === index ? "bg-blue-50" : ""
                }`}
                onClick={() => setActiveTradeIndex(index)}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {index + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {trade.entry}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  ${trade.entryPrice.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {trade.exit}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  ${trade.exitPrice.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  ${trade.highestPrice.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {formatCurrency(trade.baseAmount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {formatCurrency(trade.leveragedAmount)}
                </td>
                <td
                  className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                    trade.pnl >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(trade.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Gold Trading Simulator (Long Only)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="text-sm text-gray-500 mt-2">
              {lastTwoYearsGoldPriceData.length} price points loaded from static
              data
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Starting Capital ($)
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

          <div className="flex items-center space-x-2 mb-6">
            <input
              type="checkbox"
              id="useTrailingStop"
              checked={params.useTrailingStop}
              onChange={(e) =>
                setParams({ ...params, useTrailingStop: e.target.checked })
              }
            />
            <label
              htmlFor="useTrailingStop"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Use Trailing Stop Loss
            </label>
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

              {renderTradeDetails()}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default TradingSimulator;
