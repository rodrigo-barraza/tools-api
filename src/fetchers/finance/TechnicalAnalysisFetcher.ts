import {
  RSI,
  MACD,
  SMA,
  EMA,
  BollingerBands,
  Stochastic,
  ADX,
  ATR,
  OBV,
  VWAP,
} from "technicalindicators";
import {
  fetchHistoricalPrices,
  type ChartInterval,
} from "./HistoricalPriceFetcher.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

interface TechnicalAnalysisOptions {
  indicators?: string[];
  period?: number;
  interval?: ChartInterval;
}

interface IndicatorResult {
  name: string;
  values: unknown[];
  latest: unknown;
  signal?: string;
}

interface TechnicalAnalysisResult {
  symbol: string;
  interval: ChartInterval;
  candleCount: number;
  indicators: IndicatorResult[];
  overallSignal: string;
  fetchedAt: string;
}

const SUPPORTED_INDICATORS = [
  "rsi",
  "macd",
  "sma",
  "ema",
  "bb",
  "stoch",
  "adx",
  "atr",
  "obv",
  "vwap",
];

const DEFAULT_INDICATORS = ["rsi", "macd", "sma", "ema", "bb"];

export async function computeTechnicalAnalysis(
  symbol: string,
  options: TechnicalAnalysisOptions = {},
): Promise<TechnicalAnalysisResult> {
  const indicatorNames = options.indicators?.length
    ? options.indicators.filter((indicator) =>
        SUPPORTED_INDICATORS.includes(indicator.toLowerCase()),
      )
    : DEFAULT_INDICATORS;

  const period = options.period || 14;
  const interval = options.interval || "1d";

  const lookbackPeriod = interval === "1d" ? "1y" : "3mo";

  try {
    const historicalData = await fetchHistoricalPrices(symbol, {
      interval,
      period: lookbackPeriod,
    });

    const candles = historicalData.candles;
    if (candles.length < period + 10) {
      throw new Error(
        `Insufficient data: got ${candles.length} candles, need at least ${period + 10}`,
      );
    }

    const closePrices = candles
      .map((candle) => candle.close)
      .filter((price): price is number => price != null);
    const highPrices = candles
      .map((candle) => candle.high)
      .filter((price): price is number => price != null);
    const lowPrices = candles
      .map((candle) => candle.low)
      .filter((price): price is number => price != null);
    const openPrices = candles
      .map((candle) => candle.open)
      .filter((price): price is number => price != null);
    const volumes = candles
      .map((candle) => candle.volume)
      .filter((volume): volume is number => volume != null);

    const results: IndicatorResult[] = [];

    for (const indicatorName of indicatorNames) {
      try {
        const indicatorResult = computeIndicator(indicatorName, {
          closePrices,
          highPrices,
          lowPrices,
          openPrices,
          volumes,
          period,
        });
        if (indicatorResult) results.push(indicatorResult);
      } catch (error: unknown) {
        logger.warn(
          `[TechnicalAnalysis] ⚠️ ${indicatorName} failed for ${symbol}: ${errorMessage(error)}`,
        );
      }
    }

    const overallSignal = deriveOverallSignal(results);

    return {
      symbol: symbol.toUpperCase(),
      interval,
      candleCount: candles.length,
      indicators: results,
      overallSignal,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    logger.error(
      `[TechnicalAnalysis] ❌ ${symbol}: ${errorMessage(error)}`,
    );
    throw error;
  }
}

interface PriceData {
  closePrices: number[];
  highPrices: number[];
  lowPrices: number[];
  openPrices: number[];
  volumes: number[];
  period: number;
}

function computeIndicator(
  name: string,
  data: PriceData,
): IndicatorResult | null {
  const { closePrices, highPrices, lowPrices, volumes, period } = data;
  const tailCount = 20;

  switch (name.toLowerCase()) {
    case "rsi": {
      const rsiValues = RSI.calculate({ values: closePrices, period });
      const latestRsi = rsiValues.at(-1) ?? null;
      let signal = "neutral";
      if (latestRsi != null) {
        if (latestRsi < 30) signal = "oversold (bullish)";
        else if (latestRsi > 70) signal = "overbought (bearish)";
      }
      return {
        name: "RSI",
        values: rsiValues.slice(-tailCount),
        latest: latestRsi != null ? round(latestRsi, 2) : null,
        signal,
      };
    }

    case "macd": {
      const macdValues = MACD.calculate({
        values: closePrices,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });
      const latestMacd = macdValues.at(-1);
      let signal = "neutral";
      if (latestMacd) {
        const histogram = latestMacd.histogram ?? 0;
        if (histogram > 0) signal = "bullish (MACD above signal)";
        else if (histogram < 0) signal = "bearish (MACD below signal)";
      }
      return {
        name: "MACD",
        values: macdValues.slice(-tailCount).map((macdItem) => ({
          macd: round(macdItem.MACD ?? 0, 4),
          signal: round(macdItem.signal ?? 0, 4),
          histogram: round(macdItem.histogram ?? 0, 4),
        })),
        latest: latestMacd
          ? {
              macd: round(latestMacd.MACD ?? 0, 4),
              signal: round(latestMacd.signal ?? 0, 4),
              histogram: round(latestMacd.histogram ?? 0, 4),
            }
          : null,
        signal,
      };
    }

    case "sma": {
      const smaValues = SMA.calculate({ values: closePrices, period });
      const latestSma = smaValues.at(-1) ?? null;
      const latestPrice = closePrices.at(-1) ?? null;
      let signal = "neutral";
      if (latestSma != null && latestPrice != null) {
        if (latestPrice > latestSma) signal = "bullish (price above SMA)";
        else signal = "bearish (price below SMA)";
      }
      return {
        name: `SMA(${period})`,
        values: smaValues.slice(-tailCount).map((value) => round(value, 4)),
        latest: latestSma != null ? round(latestSma, 4) : null,
        signal,
      };
    }

    case "ema": {
      const emaValues = EMA.calculate({ values: closePrices, period });
      const latestEma = emaValues.at(-1) ?? null;
      const latestPrice = closePrices.at(-1) ?? null;
      let signal = "neutral";
      if (latestEma != null && latestPrice != null) {
        if (latestPrice > latestEma) signal = "bullish (price above EMA)";
        else signal = "bearish (price below EMA)";
      }
      return {
        name: `EMA(${period})`,
        values: emaValues.slice(-tailCount).map((value) => round(value, 4)),
        latest: latestEma != null ? round(latestEma, 4) : null,
        signal,
      };
    }

    case "bb": {
      const bollingerBandValues = BollingerBands.calculate({
        values: closePrices,
        period,
        stdDev: 2,
      });
      const latestBollingerBand = bollingerBandValues.at(-1);
      const latestPrice = closePrices.at(-1) ?? null;
      let signal = "neutral";
      if (latestBollingerBand && latestPrice != null) {
        if (latestPrice <= latestBollingerBand.lower)
          signal = "oversold (at lower band)";
        else if (latestPrice >= latestBollingerBand.upper)
          signal = "overbought (at upper band)";
        else signal = "within bands";
      }
      return {
        name: `Bollinger Bands(${period})`,
        values: bollingerBandValues.slice(-tailCount).map((bandValue) => ({
          upper: round(bandValue.upper, 4),
          middle: round(bandValue.middle, 4),
          lower: round(bandValue.lower, 4),
        })),
        latest: latestBollingerBand
          ? {
              upper: round(latestBollingerBand.upper, 4),
              middle: round(latestBollingerBand.middle, 4),
              lower: round(latestBollingerBand.lower, 4),
            }
          : null,
        signal,
      };
    }

    case "stoch": {
      const stochasticValues = Stochastic.calculate({
        high: highPrices,
        low: lowPrices,
        close: closePrices,
        period,
        signalPeriod: 3,
      });
      const latestStochastic = stochasticValues.at(-1);
      let signal = "neutral";
      if (latestStochastic) {
        if (latestStochastic.k < 20) signal = "oversold";
        else if (latestStochastic.k > 80) signal = "overbought";
      }
      return {
        name: "Stochastic",
        values: stochasticValues.slice(-tailCount).map((stochasticItem) => ({
          k: round(stochasticItem.k, 2),
          d: round(stochasticItem.d, 2),
        })),
        latest: latestStochastic
          ? {
              k: round(latestStochastic.k, 2),
              d: round(latestStochastic.d, 2),
            }
          : null,
        signal,
      };
    }

    case "adx": {
      const adxValues = ADX.calculate({
        high: highPrices,
        low: lowPrices,
        close: closePrices,
        period,
      });
      const latestAdx = adxValues.at(-1);
      let signal = "neutral";
      if (latestAdx) {
        if (latestAdx.adx > 40) signal = "strong trend";
        else if (latestAdx.adx > 25) signal = "trending";
        else signal = "weak/no trend";
      }
      return {
        name: "ADX",
        values: adxValues.slice(-tailCount).map((adxItem) => ({
          adx: round(adxItem.adx, 2),
          pdi: round(adxItem.pdi, 2),
          mdi: round(adxItem.mdi, 2),
        })),
        latest: latestAdx
          ? {
              adx: round(latestAdx.adx, 2),
              pdi: round(latestAdx.pdi, 2),
              mdi: round(latestAdx.mdi, 2),
            }
          : null,
        signal,
      };
    }

    case "atr": {
      const atrValues = ATR.calculate({
        high: highPrices,
        low: lowPrices,
        close: closePrices,
        period,
      });
      const latestAtr = atrValues.at(-1) ?? null;
      return {
        name: `ATR(${period})`,
        values: atrValues.slice(-tailCount).map((value) => round(value, 4)),
        latest: latestAtr != null ? round(latestAtr, 4) : null,
        signal: latestAtr != null ? `volatility: ${round(latestAtr, 4)}` : "neutral",
      };
    }

    case "obv": {
      const obvValues = OBV.calculate({ close: closePrices, volume: volumes });
      const latestObv = obvValues.at(-1) ?? null;
      const previousObv = obvValues.at(-2) ?? null;
      let signal = "neutral";
      if (latestObv != null && previousObv != null) {
        signal =
          latestObv > previousObv
            ? "bullish (rising OBV)"
            : "bearish (falling OBV)";
      }
      return {
        name: "OBV",
        values: obvValues.slice(-tailCount),
        latest: latestObv,
        signal,
      };
    }

    case "vwap": {
      const vwapValues = VWAP.calculate({
        high: highPrices,
        low: lowPrices,
        close: closePrices,
        volume: volumes,
      });
      const latestVwap = vwapValues.at(-1) ?? null;
      const latestPrice = closePrices.at(-1) ?? null;
      let signal = "neutral";
      if (latestVwap != null && latestPrice != null) {
        signal =
          latestPrice > latestVwap
            ? "bullish (price above VWAP)"
            : "bearish (price below VWAP)";
      }
      return {
        name: "VWAP",
        values: vwapValues.slice(-tailCount).map((value) => round(value, 4)),
        latest: latestVwap != null ? round(latestVwap, 4) : null,
        signal,
      };
    }

    default:
      return null;
  }
}

function deriveOverallSignal(indicators: IndicatorResult[]): string {
  let bullishCount = 0;
  let bearishCount = 0;

  for (const indicator of indicators) {
    if (!indicator.signal) continue;
    const signalLower = indicator.signal.toLowerCase();
    if (signalLower.includes("bullish") || signalLower.includes("oversold"))
      bullishCount++;
    if (signalLower.includes("bearish") || signalLower.includes("overbought"))
      bearishCount++;
  }

  const total = bullishCount + bearishCount;
  if (total === 0) return "neutral";
  const bullishRatio = bullishCount / total;
  if (bullishRatio >= 0.7) return "strong buy";
  if (bullishRatio >= 0.5) return "buy";
  if (bullishRatio <= 0.3) return "strong sell";
  if (bullishRatio < 0.5) return "sell";
  return "neutral";
}

function round(value: number, decimals: number): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

export { SUPPORTED_INDICATORS };
