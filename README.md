# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ["./tsconfig.node.json", "./tsconfig.app.json"],
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from "eslint-plugin-react";

export default tseslint.config({
  // Set the react version
  settings: { react: { version: "18.3" } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs["jsx-runtime"].rules,
  },
});
```

Overview of the Application
The simulator allows users to:

1. Configure trading parameters such as starting capital, position size, leverage, stop loss amount, minimum price movement, and daily funding fees
2. Run simulations based on historical gold price data
3. View detailed results including P&L, equity curves, trade history, and key performance metrics
   Key Components
   Simulation Parameters

- Starting Capital: Initial investment amount
- Position Size: Percentage of capital to use per trade
- Leverage: Multiplier applied to each position (up to 200x)
- Stop Loss Amount: Dollar amount to trigger position closure
- Minimum Price Movement: Percentage threshold to enter new positions
- Daily Position Funding Fee: Percentage fee charged daily on open positions
- Trailing Stop: The system uses trailing stops to protect profits
  Simulation Logic
  The code implements a sophisticated trading algorithm that:

1. Opens positions when price movement exceeds the specified threshold
2. Applies daily fees to open positions
3. Monitors positions for stop loss triggers
4. Closes positions when stop loss conditions are met
5. Tracks detailed trade history and performance metrics
   Results & Visualization
   The simulator provides comprehensive results:

- Total P&L, final capital, success rate, and total trades
- Maximum drawdown and consecutive losses
- Average profit per trade and total fees
- Interactive charts for equity curve and gold price history
- Detailed tables for trade history and open positions

I need the trade history to be sorted based on trade history
