import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Play } from "lucide-react";
import { goldPriceHistory } from "@/lib/data";

type TradeData = {
  entry: string;
  exit: string;
  entryPrice: number;
  exitPrice: number;
  highestPrice: number;
  baseAmount: number;
  leveragedAmount: number;
  pnl: number;
  fees: number;
  daysHeld: number;
  remainingCapital: number;
  capitalAtEntry: number;
};

type OpenPosition = {
  entryDate: string;
  entryPrice: number;
  currentPrice: number;
  highestPrice: number;
  baseAmount: number;
  leveragedAmount: number;
  unrealizedPnl: number;
  accumulatedFees: number;
  capitalAtEntry: number;
};

type SimulationResults = {
  finalCapital: number;
  totalProfitLoss: number;
  totalTrades: number;
  totalFees: number;
  equityCurve: { date: string; equity: number }[];
  tradeHistory: TradeData[];
  successRate: number;
  maxDrawdown: number;
  maxConsecutiveLosses: number;
  avgProfitPerTrade: number;
  openPositions: OpenPosition[];
  skippedTrades: number;
};

type SimulationParams = {
  investmentCapital: number;
  positionSizePercent: number;
  leverage: number;
  stopLossDollar: number;
  minPriceMovement: number;
  dailyFeePercent: number;
  useTrailingStop: boolean;
};

const validateParams = (params: SimulationParams): boolean => {
  if (params.investmentCapital <= 0) return false;
  if (params.positionSizePercent <= 0 || params.positionSizePercent > 100)
    return false;
  if (params.leverage <= 0 || params.leverage > 100) return false;
  if (params.stopLossDollar <= 0) return false;
  if (params.minPriceMovement < 0) return false;
  if (params.dailyFeePercent < 0) return false;
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
    positionSizePercent: 1, // 2% risk per trade
    leverage: 100, // 100x leverage
    stopLossDollar: 200, // $200 USD stop loss
    minPriceMovement: 0.3, // 0.3% minimum price movement threshold
    dailyFeePercent: 0.1, // 0.1% daily fee on open positions
    useTrailingStop: true, // Use trailing stop by default
  });

  const [results, setResults] = useState<SimulationResults | null>(null);
  const [activeTradeIndex, setActiveTradeIndex] = useState<number | null>(null);
  const [showGoldChart, setShowGoldChart] = useState<boolean>(true);

  const shouldOpenPosition = (
    currentPrice: number,
    previousPrice: number,
    threshold: number
  ): boolean => {
    const priceMovement =
      ((currentPrice - previousPrice) / previousPrice) * 100;
    // Only open LONG positions when price increases by the threshold percentage
    return priceMovement >= threshold;
  };

  // Check if stop loss is triggered
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
    let skippedTrades = 0;

    const equityCurve: { date: string; equity: number }[] = [];
    const tradeHistory: TradeData[] = [];
    const openPositions: OpenPosition[] = [];

    // Array to track all open positions
    const activePositions: {
      entryPrice: number;
      entryDate: string;
      highestPrice: number;
      baseAmount: number;
      leveragedAmount: number;
      accumulatedFees: number;
      lastFeeDate: string;
      remainingCapitalAtEntry: number;
    }[] = [];

    let currentDate: string | null = null;

    // Loop through price history
    for (let index = 1; index < goldPriceHistory.length; index++) {
      const currentData = goldPriceHistory[index];
      const previousData = goldPriceHistory[index - 1];

      const { date, openingPrice, highestPrice, lowestPrice, currentPrice } =
        currentData;

      // Process fees first
      if (currentDate !== date) {
        currentDate = date;

        // Apply daily percentage-based fees to all open positions
        let totalDailyFees = 0;

        for (const position of activePositions) {
          if (position.lastFeeDate !== date) {
            const dailyFee =
              (params.dailyFeePercent / 100) * position.baseAmount;
            totalDailyFees += dailyFee;
            position.accumulatedFees += dailyFee;
            position.lastFeeDate = date;
          }
        }

        // Deduct all fees from capital if possible
        if (currentCapital >= totalDailyFees) {
          currentCapital -= totalDailyFees;
          totalFees += totalDailyFees;
        } else if (currentCapital > 0) {
          totalFees += currentCapital;
          currentCapital = 0;
        }
      }

      // Process all active positions and check for stop losses
      for (let i = activePositions.length - 1; i >= 0; i--) {
        const position = activePositions[i];

        // Update highest price if new high is reached
        if (highestPrice > position.highestPrice) {
          position.highestPrice = highestPrice;
        }

        // Calculate current P&L (excluding fees)
        const currentPnL =
          position.leveragedAmount *
          ((currentPrice - position.entryPrice) / position.entryPrice);

        // Check if position is liquidated due to fees
        const totalPositionValue = position.baseAmount + currentPnL;
        const netPositionValue = totalPositionValue - position.accumulatedFees;

        // Check if stop loss is triggered using the day's lowest price
        const stopLossTriggered = isStopLossTriggered(
          lowestPrice,
          position.highestPrice,
          position.leveragedAmount,
          params.stopLossDollar,
          params.useTrailingStop
        );

        // Close position if stop loss is triggered OR if fees have consumed the position value
        if (stopLossTriggered || netPositionValue <= 0) {
          let exitPrice, pnl;

          if (stopLossTriggered) {
            // Calculate the price at which the stop loss would trigger
            const percentageDrop =
              params.stopLossDollar / position.leveragedAmount;
            exitPrice = position.highestPrice * (1 - percentageDrop);

            // Calculate P&L based on stop loss price (excluding fees)
            pnl =
              position.leveragedAmount *
              ((exitPrice - position.entryPrice) / position.entryPrice);
          } else {
            // Position is closed due to fees consuming the value
            exitPrice = currentPrice;
            pnl = currentPnL;
          }

          // Add back the base amount plus any profit (or minus any loss), then subtract fees
          // This ensures fees are properly accounted for and don't artificially inflate P&L
          const amountToReturn = Math.max(
            0,
            position.baseAmount + pnl - position.accumulatedFees
          );
          currentCapital += amountToReturn;

          // Add only the actual trading P&L (not including fees) to totalProfitLoss
          totalProfitLoss += pnl;

          // Record trade with appropriate P&L calculation
          tradeHistory.push({
            entry: position.entryDate,
            exit: date,
            entryPrice: position.entryPrice,
            exitPrice: exitPrice,
            highestPrice: position.highestPrice,
            baseAmount: position.baseAmount,
            leveragedAmount: position.leveragedAmount,
            pnl, // P&L from price movement, excluding fees
            fees: position.accumulatedFees,
            daysHeld: calculateDaysHeld(position.entryDate, date),
            remainingCapital: currentCapital,
            capitalAtEntry: position.remainingCapitalAtEntry,
          });

          // Track consecutive losses based on P&L excluding fees
          if (pnl < 0) {
            consecutiveLosses++;
            maxConsecutiveLosses = Math.max(
              maxConsecutiveLosses,
              consecutiveLosses
            );
          } else {
            consecutiveLosses = 0;
          }

          // Remove the position
          activePositions.splice(i, 1);
        }
      }

      // Exit the simulation if we have no capital and no positions
      if (currentCapital <= 0 && activePositions.length === 0) break;

      // Check for new position entry only if we have enough capital
      const MIN_TRADING_CAPITAL = 100;

      if (currentCapital >= MIN_TRADING_CAPITAL) {
        const shouldOpen = shouldOpenPosition(
          openingPrice,
          previousData.openingPrice,
          params.minPriceMovement
        );

        if (shouldOpen) {
          // Calculate position size correctly as a percentage of current capital
          const baseAmount = Math.min(
            (params.positionSizePercent / 100) * currentCapital,
            currentCapital
          );

          // Only proceed if base amount is meaningful
          if (baseAmount >= 1) {
            const leveragedAmount = baseAmount * params.leverage;

            // Store position with current capital at entry
            activePositions.push({
              entryPrice: openingPrice,
              entryDate: date,
              highestPrice: openingPrice, // Set initial highest price equal to entry price
              baseAmount,
              leveragedAmount,
              accumulatedFees: 0,
              lastFeeDate: date,
              remainingCapitalAtEntry: currentCapital,
            });

            currentCapital -= baseAmount;
            tradesExecuted++;
          }
        }
      } else if (
        shouldOpenPosition(
          openingPrice,
          previousData.openingPrice,
          params.minPriceMovement
        )
      ) {
        // Count trades we would have taken if we had enough capital
        skippedTrades++;
      }

      // Update equity curve for this day
      equityCurve.push({
        date,
        equity:
          currentCapital +
          activePositions.reduce((sum, pos) => {
            const unrealizedPnL =
              pos.leveragedAmount *
              ((currentPrice - pos.entryPrice) / pos.entryPrice);
            return (
              sum +
              Math.max(0, pos.baseAmount + unrealizedPnL - pos.accumulatedFees)
            );
          }, 0),
      });
    }

    // Close any remaining open positions at the end of simulation
    const lastPrice =
      goldPriceHistory[goldPriceHistory.length - 1].currentPrice;
    const lastDate = goldPriceHistory[goldPriceHistory.length - 1].date;

    activePositions.forEach((position) => {
      const percentageChange =
        (lastPrice - position.entryPrice) / position.entryPrice;
      const pnl = position.leveragedAmount * percentageChange;

      // Add back adjusted capital
      const amountToReturn = Math.max(
        0,
        position.baseAmount + pnl - position.accumulatedFees
      );
      currentCapital += amountToReturn;
      totalProfitLoss += pnl;

      // Add to trade history
      tradeHistory.push({
        entry: position.entryDate,
        exit: lastDate,
        entryPrice: position.entryPrice,
        exitPrice: lastPrice,
        highestPrice: position.highestPrice,
        baseAmount: position.baseAmount,
        leveragedAmount: position.leveragedAmount,
        pnl,
        fees: position.accumulatedFees,
        daysHeld: calculateDaysHeld(position.entryDate, lastDate),
        remainingCapital: currentCapital,
        capitalAtEntry: position.remainingCapitalAtEntry,
      });

      // For reference only - these positions are closed at the end
      openPositions.push({
        entryDate: position.entryDate,
        entryPrice: position.entryPrice,
        currentPrice: lastPrice,
        highestPrice: position.highestPrice,
        baseAmount: position.baseAmount,
        leveragedAmount: position.leveragedAmount,
        unrealizedPnl: pnl,
        accumulatedFees: position.accumulatedFees,
        capitalAtEntry: position.remainingCapitalAtEntry,
      });
    });

    // Calculate final metrics
    const successRate =
      tradeHistory.length > 0
        ? tradeHistory.filter((t) => t.pnl > 0).length / tradeHistory.length
        : 0;

    setResults({
      finalCapital: currentCapital,
      totalProfitLoss: totalProfitLoss,
      totalTrades: tradesExecuted,
      totalFees: totalFees,
      equityCurve: equityCurve,
      tradeHistory: tradeHistory,
      successRate: successRate,
      maxDrawdown: calculateDrawdown(equityCurve),
      maxConsecutiveLosses: maxConsecutiveLosses,
      avgProfitPerTrade: totalProfitLoss / (tradesExecuted || 1),
      openPositions: openPositions,
      skippedTrades: skippedTrades,
    });
  };

  // The corrected stop loss function remains the same
  const isStopLossTriggered = (
    currentPrice: number,
    highestPrice: number,
    leveragedAmount: number,
    stopLossAmount: number,
    useTrailing: boolean
  ): boolean => {
    if (!useTrailing) {
      return false; // Not implemented as per requirements
    }

    // Calculate percentage drop from highest price
    const percentageDropFromHighest =
      (highestPrice - currentPrice) / highestPrice;

    // Calculate dollar loss based on leveraged amount
    const dollarLoss = leveragedAmount * percentageDropFromHighest;

    // Return true if dollar loss exceeds stop loss amount
    return dollarLoss >= stopLossAmount;
  };

  // Helper function to calculate days held
  const calculateDaysHeld = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
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

    // Prepare data for gold price chart
    const chartData = goldPriceHistory.map((item) => ({
      date: item.date,
      price: item.currentPrice,
      high: item.highestPrice,
      low: item.lowestPrice,
      open: item.openingPrice,
    }));

    return (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
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
              results.tradeHistory[activeTradeIndex] && (
                <>
                  <ReferenceLine
                    x={results.tradeHistory[activeTradeIndex].entry}
                    stroke="green"
                    label="Entry"
                  />
                  <ReferenceLine
                    x={results.tradeHistory[activeTradeIndex].exit}
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

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Gold Trading Simulator</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="text-sm text-gray-500 mt-2">
              {goldPriceHistory.length} price points loaded from historical gold
              price data
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="space-y-2">
              <Label htmlFor="investmentCapital">Starting Capital ($)</Label>
              <Input
                id="investmentCapital"
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
              <Label htmlFor="positionSizePercent">
                Position Size (% of capital)
              </Label>
              <Input
                id="positionSizePercent"
                type="number"
                value={params.positionSizePercent}
                onChange={(e) =>
                  setParams({
                    ...params,
                    positionSizePercent: parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="leverage">Leverage Multiplier</Label>
              <Input
                id="leverage"
                type="number"
                value={params.leverage}
                onChange={(e) =>
                  setParams({ ...params, leverage: parseFloat(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stopLossDollar">Stop Loss Amount ($)</Label>
              <Input
                id="stopLossDollar"
                type="number"
                value={params.stopLossDollar}
                onChange={(e) =>
                  setParams({
                    ...params,
                    stopLossDollar: parseFloat(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minPriceMovement">
                Min Price Movement (% threshold)
              </Label>
              <Input
                id="minPriceMovement"
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
              <Label htmlFor="dailyFeePercent">
                Daily Position Funding Fee (%)
              </Label>
              <Input
                id="dailyFeePercent"
                type="number"
                value={params.dailyFeePercent}
                onChange={(e) =>
                  setParams({
                    ...params,
                    dailyFeePercent: parseFloat(e.target.value),
                  })
                }
              />
            </div>
          </div>

          {/* <div className="flex items-center space-x-2 mb-6">
            <input
              type="checkbox"
              id="useTrailingStop"
              checked={params.useTrailingStop}
              onChange={(e) =>
                setParams({ ...params, useTrailingStop: e.target.checked })
              }
            />
            <label htmlFor="useTrailingStop">Use Trailing Stop</label>
          </div> */}
          {/* <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg p-6 my-4 shadow-sm">
            <h3 className="text-lg font-semibold text-indigo-800 mb-2 flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Understanding Minimum Price Movement
            </h3>

            <p className="text-gray-700 mb-3">
              The minimum price movement threshold determines when a new trade
              should be opened. It's expressed as a percentage change between
              consecutive price points.
            </p>

            <div className="bg-white p-4 rounded border border-blue-100 mb-4">
              <span className="font-medium text-indigo-700 block mb-2">
                Detailed Example:
              </span>
              <p className="mb-2">
                Let's say you're trading gold with current price $1,950 per
                ounce:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>
                  <span className="font-medium">With 0.3% threshold</span>: A
                  new position will only open when gold price reaches at least
                  $1,955.85 (a 0.3% increase)
                </li>
                <li>
                  <span className="font-medium">With 0.1% threshold</span>: A
                  new position would open much sooner, when gold reaches
                  $1,951.95 (just a 0.1% increase)
                </li>
                <li>
                  <span className="font-medium">With 0.5% threshold</span>: The
                  system would be more selective, waiting for gold to reach
                  $1,959.75 before opening a position
                </li>
              </ul>
            </div>

            <div className="flex items-start space-x-2 text-sm text-gray-600">
              <div className="flex-shrink-0 mt-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-amber-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <p>
                Higher values make the system less sensitive, resulting in fewer
                but potentially stronger trend-following trades. Lower values
                make it more sensitive, potentially capturing smaller price
                movements but may generate more frequent trades and higher fees.
              </p>
            </div>
          </div> */}
          <Button onClick={runSimulation} className="w-full">
            <Play className="mr-2 h-4 w-4" /> Run Simulation
          </Button>
        </CardContent>
      </Card>

      {results && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Gold Price Chart</CardTitle>
              <Button
                variant="outline"
                onClick={() => setShowGoldChart(!showGoldChart)}
              >
                {showGoldChart ? "Hide Chart" : "Show Chart"}
              </Button>
            </CardHeader>
            <CardContent>{showGoldChart && renderGoldPriceChart()}</CardContent>
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
                      results.totalProfitLoss >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(results.totalProfitLoss)}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Final Capital</div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(results.finalCapital)}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Success Rate</div>
                  <div className="text-2xl font-bold">
                    {(results.successRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Total Trades</div>
                  <div className="text-2xl font-bold">
                    {results.totalTrades}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Max Drawdown</div>
                  <div className="text-2xl font-bold">
                    {results.maxDrawdown.toFixed(2)}%
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Avg Profit/Trade</div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(results.avgProfitPerTrade)}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">
                    Max Consecutive Losses
                  </div>
                  <div className="text-2xl font-bold">
                    {results.maxConsecutiveLosses}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Total Fees</div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(results.totalFees)}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-600">Skipped Trades</div>
                  <div className="text-2xl font-bold">
                    {results.skippedTrades}
                  </div>
                </div>
              </div>

              <div className="h-64 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results.equityCurve}>
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

              {/* Open Positions Section */}
              {results.openPositions.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium mb-2">
                    Open Positions ({results.openPositions.length})
                  </h3>
                  {results.openPositions.length > 0 && (
                    <p className="text-sm text-gray-600 mb-2">
                      Note: All open positions are closed at the end of the
                      simulation period and included in trade history.
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="p-2 text-left">Entry Date</th>
                          <th className="p-2 text-right">Entry Price</th>
                          <th className="p-2 text-right">Current Price</th>
                          <th className="p-2 text-right">Highest Price</th>
                          <th className="p-2 text-right">Base Amount</th>
                          <th className="p-2 text-right">Leveraged Amount</th>
                          <th className="p-2 text-right">Total Fees</th>
                          <th className="p-2 text-right">Capital At Entry</th>
                          <th className="p-2 text-right">Unrealized P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.openPositions.map((position, index) => (
                          <tr key={index} className="border-b">
                            <td className="p-2">{position.entryDate}</td>
                            <td className="p-2 text-right">
                              ${position.entryPrice.toFixed(2)}
                            </td>
                            <td className="p-2 text-right">
                              ${position.currentPrice.toFixed(2)}
                            </td>
                            <td className="p-2 text-right">
                              ${position.highestPrice.toFixed(2)}
                            </td>
                            <td className="p-2 text-right">
                              {formatCurrency(position.baseAmount)}
                            </td>
                            <td className="p-2 text-right">
                              {formatCurrency(position.leveragedAmount)}
                            </td>
                            <td className="p-2 text-right text-red-600">
                              {formatCurrency(position.accumulatedFees)}
                            </td>
                            <td className="p-2 text-right text-red-600">
                              {formatCurrency(position.capitalAtEntry)}
                            </td>
                            <td
                              className={`p-2 text-right ${
                                position.unrealizedPnl >= 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {formatCurrency(position.unrealizedPnl)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Trade History Section */}
              <h3 className="text-lg font-medium mb-2">
                Trade History ({results.tradeHistory.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="p-2 text-left">Entry Date</th>
                      <th className="p-2 text-left">Exit Date</th>
                      <th className="p-2 text-right">Entry Price</th>
                      <th className="p-2 text-right">Exit Price</th>
                      <th className="p-2 text-right">Highest Price</th>
                      <th className="p-2 text-right">Base Amount</th>
                      <th className="p-2 text-right">Leveraged Amount</th>
                      <th className="p-2 text-right">Total Fees</th>
                      <th className="p-2 text-right">Remaining Capital</th>
                      <th className="p-2 text-right">Capital At Entry</th>
                      <th className="p-2 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.tradeHistory.map((trade, index) => (
                      <tr
                        key={index}
                        className={`border-b cursor-pointer ${
                          activeTradeIndex === index ? "bg-blue-50" : ""
                        }`}
                        onClick={() =>
                          setActiveTradeIndex(
                            index === activeTradeIndex ? null : index
                          )
                        }
                      >
                        <td className="p-2">{trade.entry}</td>
                        <td className="p-2">{trade.exit}</td>
                        <td className="p-2 text-right">
                          ${trade.entryPrice.toFixed(2)}
                        </td>
                        <td className="p-2 text-right">
                          ${trade.exitPrice.toFixed(2)}
                        </td>
                        <td className="p-2 text-right">
                          ${trade.highestPrice.toFixed(2)}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(trade.baseAmount)}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(trade.leveragedAmount)}
                        </td>
                        <td className="p-2 text-right text-red-600">
                          {formatCurrency(trade.fees)}
                        </td>
                        <td className="p-2 text-right text-red-600">
                          {formatCurrency(trade.remainingCapital)}
                        </td>
                        <td className="p-2 text-right text-red-600">
                          {formatCurrency(trade.capitalAtEntry)}
                        </td>
                        <td
                          className={`p-2 text-right ${
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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default TradingSimulator;
