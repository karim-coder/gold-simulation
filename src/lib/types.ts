export type PriceDataPoint = {
  date: string;
  session: string;
  price: number;
  volatility?: number;
};

export type TradeRecord = {
  entry: string;
  exit: string;
  pnl: number;
  type: string;
  priceChange: string;
  marketExposure: number;
  entryPrice: number;
  exitPrice: number;
  holdingPeriod: number;
};

export type PerformanceMetrics = {
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxConsecutiveLosses: number;
  dailyReturnVolatility: number;
};

export type SimulationResults = {
  final_capital: number;
  total_profit_loss: number;
  total_trades: number;
  total_fees: number;
  equity_curve: { date: string; equity: number }[];
  trade_history: TradeRecord[];
  success_rate: number;
  performance_metrics: PerformanceMetrics;
  max_drawdown: number;
};

export type SimulationParams = {
  investmentCapital: number;
  positionSize: number;
  leverage: number;
  stopLoss: number;
  profitTarget: number;
  tradeFrequency: number;
  dailyFees: number;
  maxDailyLoss: number;
  maxPositionHoldingHours: number;
  volatilityAdjustment: boolean;
};
