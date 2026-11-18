# Optimal Capital Structure Simulator

An interactive, browser-only tool that shows how a company's mix of debt and equity affects its cost of capital and firm value. Move the sliders and it finds the debt ratio that minimizes WACC, then compares it with your current choice.

Built with plain HTML, CSS and JavaScript. There is no backend, no build step and no framework.

## Features

- **Nine live inputs:** total capital, target debt ratio, EBIT, risk-free rate, equity risk premium, unlevered beta, base cost of debt, tax rate and distress sensitivity. Each slider is paired with an editable number box.
- **Company presets:** High-Growth Tech, Mature Utility and Distressed Retail, plus a Reset button.
- **Summary cards:** current vs. optimal WACC, implied enterprise value, interest coverage with a synthetic credit rating, and the recommended debt ratio.
- **Two charts:**
  - WACC, cost of equity and after-tax cost of debt across 0–90% leverage.
  - Enterprise value across leverage, showing the tax shield gain and the value lost to distress.
- **Click-to-set:** click either chart to set the debt ratio at that point.
- **Algorithmic insight:** a rule-based summary that updates live and warns when interest coverage is thin.
- **Comparison table:** current selection vs. the simulated optimum.

## Run it

1. Download or clone the repository.
2. Open `index.html` in any modern browser.

An internet connection is needed to load Chart.js and Google Fonts from their CDNs.

## Project structure

```
index.html   Page layout and structure
styles.css   Styling
script.js    Financial engine, controls, charts and rendering
```

## How the model works

For every debt ratio from 0% to 90% in 1% steps, the engine computes:

| Step | Formula or method |
|---|---|
| Levered beta | β_L = β_u × [1 + (1 − T_c) × D/E] (Hamada) |
| Cost of equity | K_e = R_f + β_L × ERP (CAPM) |
| Cost of debt | Base rate + a spread that rises as interest coverage falls, scaled by the distress setting, plus a small leverage term. Interest and coverage depend on each other, so they are solved iteratively. |
| WACC | E/V × K_e + D/V × K_d × (1 − T_c) |
| Firm value | EBIT × (1 − T_c) ÷ WACC (zero-growth perpetuity) |
| Optimum | The debt ratio with the lowest WACC, which is also the highest value because earnings are fixed |

Debt is sized as the debt ratio × total capital. The tax shield band on the value chart is T_c × D on top of unlevered value.

## Assumptions and limits

- Firm value is a zero-growth perpetuity, so high-growth companies are undervalued.
- The synthetic rating table is adapted from large-cap interest coverage bands. Ratings are illustrative, not real credit ratings.
- Hamada's formula assumes a debt beta of zero.
- This is an educational model. It is not investment or financial advice.

## Tech stack

- HTML5, CSS3, ES6+ JavaScript
- [Chart.js](https://www.chartjs.org/) 4.4.1 (CDN)
- Inter and JetBrains Mono via Google Fonts

## License

MIT. Add a `LICENSE` file if you publish this.
