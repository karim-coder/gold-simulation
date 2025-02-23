export const DEFAULT_PARAMS = {
  investmentCapital: 10000,
  positionSize: 15,
  leverage: 1000,
  stopLoss: 100,
  profitTarget: 400,
  tradeFrequency: 0.5,
  dailyFees: 5,
  maxDailyLoss: 500,
  maxPositionHoldingHours: 48,
  volatilityAdjustment: true,
};

export const TRADING_HOURS = {
  start: 9,
  end: 17,
};

export const RISK_LIMITS = {
  maxLeverage: 1000,
  maxPositionSize: 0.15, // 15% of capital
  minCapital: 100,
};
