import json
import math
import statistics
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


TIMEOUT_SECONDS = 12
USER_AGENT = "PakistanMarketDesk/1.0 research dashboard"


def safe_number(value):
    try:
        if value is None:
            return None
        number = float(value)
        if math.isfinite(number):
            return number
    except (TypeError, ValueError):
        return None
    return None


def percent_change(current, previous):
    current = safe_number(current)
    previous = safe_number(previous)
    if current is None or previous in (None, 0):
        return None
    return (current - previous) / previous * 100


def mean(values):
    cleaned = [safe_number(value) for value in values]
    cleaned = [value for value in cleaned if value is not None]
    return statistics.fmean(cleaned) if cleaned else None


def standard_deviation(values):
    cleaned = [safe_number(value) for value in values]
    cleaned = [value for value in cleaned if value is not None]
    if len(cleaned) < 2:
        return None
    return statistics.stdev(cleaned)


def clamp(value, lower, upper):
    return max(lower, min(upper, value))


def fetch_history(symbol):
    url = f"https://dps.psx.com.pk/timeseries/eod/{symbol}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))

    rows = payload.get("data", []) if isinstance(payload, dict) else []
    history = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 3:
            continue
        close = safe_number(row[1])
        volume = safe_number(row[2])
        open_price = safe_number(row[3] if len(row) > 3 else None)
        if close is None:
            continue
        history.append(
            {
                "time": int(row[0]),
                "close": close,
                "volume": volume or 0,
                "open": open_price,
            }
        )

    history.sort(key=lambda item: item["time"])
    return history


def moving_average(values, period):
    if len(values) < period:
        return None
    return mean(values[-period:])


def exponential_moving_average(values, period):
    if len(values) < period:
        return None
    multiplier = 2 / (period + 1)
    ema = mean(values[:period])
    for value in values[period:]:
        ema = (value - ema) * multiplier + ema
    return ema


def relative_strength_index(closes, period=14):
    if len(closes) <= period:
        return None

    gains = []
    losses = []
    for index in range(1, period + 1):
        change = closes[index] - closes[index - 1]
        gains.append(max(change, 0))
        losses.append(abs(min(change, 0)))

    average_gain = mean(gains) or 0
    average_loss = mean(losses) or 0

    for index in range(period + 1, len(closes)):
        change = closes[index] - closes[index - 1]
        gain = max(change, 0)
        loss = abs(min(change, 0))
        average_gain = ((average_gain * (period - 1)) + gain) / period
        average_loss = ((average_loss * (period - 1)) + loss) / period

    if average_loss == 0:
        return 100
    strength = average_gain / average_loss
    return 100 - (100 / (1 + strength))


def linear_regression_projection(values, forecast_days):
    if len(values) < 10:
        return None
    y_values = [math.log(value) for value in values if value > 0]
    if len(y_values) < 10:
        return None
    x_values = list(range(len(y_values)))
    x_mean = mean(x_values)
    y_mean = mean(y_values)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, y_values))
    denominator = sum((x - x_mean) ** 2 for x in x_values)
    if denominator == 0:
        return None
    daily_slope = numerator / denominator
    return (math.exp(daily_slope * forecast_days) - 1) * 100


def max_drawdown(closes):
    if not closes:
        return None
    peak = closes[0]
    worst = 0
    for close in closes:
        peak = max(peak, close)
        if peak:
            worst = min(worst, (close - peak) / peak * 100)
    return worst


def daily_returns(closes):
    returns = []
    for previous, current in zip(closes, closes[1:]):
        change = percent_change(current, previous)
        if change is not None:
            returns.append(change)
    return returns


def score_stock(stock, history, horizon):
    symbol = stock.get("symbol", "")
    closes = [item["close"] for item in history]
    volumes = [item["volume"] for item in history]
    if len(closes) < 80:
        return {
            "symbol": symbol,
            "action": "Insufficient data",
            "confidence": 35,
            "score": 0,
            "thesis": "The historical data window is too small for a responsible forecast.",
            "risk": "Wait for more complete market history before acting on this symbol.",
            "indicators": {},
        }

    latest = closes[-1]
    return_one_month = percent_change(latest, closes[-22]) if len(closes) >= 22 else None
    return_three_month = percent_change(latest, closes[-64]) if len(closes) >= 64 else None
    return_six_month = percent_change(latest, closes[-127]) if len(closes) >= 127 else None
    return_one_year = percent_change(latest, closes[-253]) if len(closes) >= 253 else None
    selected_return = return_six_month if horizon == "6m" else return_one_year
    if selected_return is None:
        selected_return = return_three_month or return_one_month or 0

    average_20 = moving_average(closes, 20)
    average_50 = moving_average(closes, 50)
    average_200 = moving_average(closes, 200)
    ema_12 = exponential_moving_average(closes, 12)
    ema_26 = exponential_moving_average(closes, 26)
    macd = ema_12 - ema_26 if ema_12 is not None and ema_26 is not None else None
    relative_strength = relative_strength_index(closes)
    returns = daily_returns(closes[-253:])
    volatility = (standard_deviation(returns) or 0) * math.sqrt(252)
    drawdown = max_drawdown(closes[-127:]) or 0
    forecast_days = 126 if horizon == "6m" else 252
    trend = linear_regression_projection(closes[-126:], forecast_days) or 0
    average_volume = mean(volumes[-20:]) or safe_number(stock.get("volume")) or 0
    liquidity_score = clamp(math.log10(max(average_volume, 1)) * 1.35, 0, 10)

    price_above_average = 0
    if average_20 and latest > average_20:
        price_above_average += 3
    if average_50 and latest > average_50:
        price_above_average += 4
    if average_200 and latest > average_200:
        price_above_average += 5

    relative_strength_score = 0
    if relative_strength is not None:
        if 45 <= relative_strength <= 68:
            relative_strength_score = 10
        elif 35 <= relative_strength < 45 or 68 < relative_strength <= 78:
            relative_strength_score = 4
        else:
            relative_strength_score = -5

    valuation_score = 0
    price_to_earnings = safe_number(stock.get("pe"))
    if price_to_earnings:
        if 0 < price_to_earnings <= 12:
            valuation_score = 6
        elif price_to_earnings <= 20:
            valuation_score = 2
        else:
            valuation_score = -4

    momentum_score = clamp(selected_return * 0.3, -18, 24)
    trend_score = clamp(trend * 0.08, -12, 16)
    risk_penalty = clamp(volatility * 0.28 + abs(drawdown) * 0.32, 0, 34)
    score = (
        34
        + momentum_score
        + trend_score
        + price_above_average
        + relative_strength_score
        + valuation_score
        + liquidity_score
        - risk_penalty
    )
    score = clamp(score, 0, 100)

    projected_return = clamp(
        (selected_return * 0.32) + (trend * 0.14) - (volatility * 0.18),
        -18,
        28,
    )
    confidence = round(
        clamp(38 + score * 0.5 - volatility * 0.08 - abs(drawdown) * 0.05, 30, 84)
    )

    if score >= 70 and projected_return > 7:
        action = "Buy on pullback"
    elif score >= 58 and projected_return > 3:
        action = "Accumulate gradually"
    elif score >= 48:
        action = "Watch closely"
    else:
        action = "Avoid for now"

    horizon_label = "six-month" if horizon == "6m" else "one-year"
    support = latest * (1 - min(0.12, max(0.04, volatility / 450)))
    target = latest * (1 + projected_return / 100)

    thesis = (
        f"For the {horizon_label} view, the model estimates a {projected_return:.2f}% "
        f"base case move from the latest price, supported by a {selected_return:.2f}% "
        f"historical horizon return and a trend strength reading of {trend:.2f}%."
    )
    risk = (
        f"Key risk is volatility near {volatility:.2f}% with recent maximum drawdown "
        f"around {drawdown:.2f}%. Reassess below Rs {support:.2f}; first model target is Rs {target:.2f}."
    )

    return {
        "symbol": symbol,
        "name": stock.get("name", ""),
        "action": action,
        "confidence": confidence,
        "score": round(score, 2),
        "thesis": thesis,
        "risk": risk,
        "indicators": {
            "latestPrice": round(latest, 2),
            "sixMonthReturn": None if return_six_month is None else round(return_six_month, 2),
            "oneYearReturn": None if return_one_year is None else round(return_one_year, 2),
            "relativeStrengthIndex": None if relative_strength is None else round(relative_strength, 2),
            "movingAverage20": None if average_20 is None else round(average_20, 2),
            "movingAverage50": None if average_50 is None else round(average_50, 2),
            "movingAverage200": None if average_200 is None else round(average_200, 2),
            "movingAverageConvergenceDivergence": None if macd is None else round(macd, 2),
            "annualizedVolatility": round(volatility, 2),
            "averageVolume20": round(average_volume),
            "maximumDrawdown": round(drawdown, 2),
            "projectedReturn": round(projected_return, 2),
        },
    }


def analyze(payload):
    horizon = payload.get("horizon") if isinstance(payload, dict) else "12m"
    if horizon not in {"6m", "12m"}:
        horizon = "12m"
    stocks = payload.get("stocks", []) if isinstance(payload, dict) else []

    histories = {}
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {
            executor.submit(fetch_history, stock.get("symbol")): stock
            for stock in stocks
            if stock.get("symbol")
        }
        for future in as_completed(future_map):
            stock = future_map[future]
            try:
                histories[stock.get("symbol")] = future.result()
            except Exception:
                histories[stock.get("symbol")] = []

    recommendations = [
        score_stock(stock, histories.get(stock.get("symbol"), []), horizon)
        for stock in stocks
    ]
    recommendations.sort(key=lambda item: item.get("score", 0), reverse=True)
    recommendations = recommendations[:3]
    leader = recommendations[0] if recommendations else {}
    leader_symbol = leader.get("symbol", "the highest ranked symbol")
    leader_projected = (
        leader.get("indicators", {}).get("projectedReturn")
        if isinstance(leader.get("indicators"), dict)
        else None
    )
    horizon_label = "six-month" if horizon == "6m" else "one-year"
    if leader_projected is not None and leader_projected <= 3:
        summary = (
            f"Expert opinion: for the {horizon_label} view, keep {leader_symbol} on the priority watchlist. "
            "The setup is cautious, with the decision based on momentum, moving averages, relative strength, "
            "volatility, drawdown, liquidity, and valuation."
        )
    else:
        summary = (
            f"Expert opinion: for the {horizon_label} view, {leader_symbol} currently has the strongest "
            "risk-adjusted setup after reviewing momentum, moving averages, relative strength, volatility, "
            "drawdown, liquidity, and valuation."
        )

    return {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "engine": "Python technical analysis engine",
        "horizon": horizon,
        "summary": summary,
        "recommendations": recommendations,
        "agentSteps": [
            "Fetched historical end of day price and volume data from the Pakistan Stock Exchange Data Portal.",
            "Calculated momentum, moving averages, relative strength, trend slope, volatility, drawdown, and liquidity.",
            "Scored each symbol with a risk-adjusted model for the selected horizon.",
            "Converted the highest scoring symbols into action labels with support and target levels.",
        ],
    }


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        print(json.dumps(analyze(payload), separators=(",", ":")))
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
