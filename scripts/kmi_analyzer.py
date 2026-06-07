import json
import math
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

try:
    from kmi_reasons import fetch_company_context
except Exception:
    fetch_company_context = None


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


def clamp(value, lower, upper):
    return max(lower, min(upper, value))


def percent_label(value):
    number = safe_number(value)
    if number is None:
        return "not available"
    sign = "+" if number > 0 else ""
    return f"{sign}{number:.2f}%"


def money_label(value):
    number = safe_number(value)
    if number is None:
        return "not available"
    units = [
        (1_000_000_000_000, "T"),
        (1_000_000_000, "B"),
        (1_000_000, "M"),
    ]
    for threshold, suffix in units:
        if abs(number) >= threshold:
            return f"Rs {number / threshold:.1f}{suffix}"
    return f"Rs {number:,.0f}"


PRESERVED_TERMS = {"PSX", "KMI", "YTD", "TTM", "P/E", "CEO", "CFO", "CBS"}
SMALL_WORDS = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"}


def display_title(value):
    text = " ".join(str(value or "").split())
    letters = "".join(character for character in text if character.isalpha())
    if not letters or letters != letters.upper():
        return text

    words = text.lower().split(" ")
    output = []
    for index, word in enumerate(words):
        clean = word.strip(".,()")
        upper = clean.upper()
        if upper in PRESERVED_TERMS:
            output.append(word.replace(clean, upper))
        elif index > 0 and clean in SMALL_WORDS:
            output.append(word)
        else:
            output.append(word[:1].upper() + word[1:])
    return " ".join(output)


def log_score(value, max_score):
    number = safe_number(value)
    if number is None or number <= 0:
        return 0
    return clamp(math.log10(number) / 12 * max_score, 0, max_score)


def positive_score(value, scale, max_score, min_score=0):
    number = safe_number(value)
    if number is None:
        return 0
    return clamp(number / scale * max_score, min_score, max_score)


def score_company(company, context=None):
    context = context or {}
    one_year = safe_number(company.get("oneYear"))
    ytd = safe_number(company.get("ytd"))
    daily = safe_number(company.get("changePct"))
    weight = safe_number(company.get("indexWeight"))
    points = safe_number(company.get("indexPoint"))
    market_cap = safe_number(company.get("marketCap"))
    volume = safe_number(company.get("volume"))
    pe = safe_number(company.get("pe")) or safe_number(context.get("pe"))
    eps = safe_number(context.get("eps"))
    sales = safe_number(context.get("sales"))
    profit = safe_number(context.get("profit"))
    announcements = context.get("latest_announcements") or []
    site_development = context.get("site_development")

    momentum_score = positive_score(one_year, 80, 38, -10)
    ytd_score = positive_score(ytd, 35, 18, -8)
    daily_score = positive_score(daily, 6, 7, -5)
    weight_score = positive_score(weight, 12, 12)
    point_score = positive_score(points, 10_000, 8)
    cap_score = log_score(market_cap, 9)
    liquidity_score = log_score(volume, 8)

    data_quality = sum(
        value is not None for value in [one_year, ytd, daily, weight, points, market_cap, volume]
    )
    quality_score = data_quality / 7 * 8
    total = (
        40
        + momentum_score
        + ytd_score
        + daily_score
        + weight_score
        + point_score
        + cap_score
        + liquidity_score
        + quality_score
    )
    total = clamp(total, 0, 100)

    if total >= 78 and (one_year or 0) >= 20:
        action = "Strong Buy"
    elif total >= 68:
        action = "Growth buy watch"
    elif total >= 58:
        action = "Accumulate carefully"
    else:
        action = "Watch only"

    if daily is not None and daily > 0:
        daily_reason = "buyers are still active in the latest session"
    elif daily is not None and daily < 0:
        daily_reason = "the latest session shows pullback or profit-taking"
    else:
        daily_reason = "the latest session is neutral"

    if one_year is not None and one_year > 20 and ytd is not None and ytd > 0:
        trend_reason = "longer-term performance and current-year trend are aligned"
    elif one_year is not None and one_year > 0:
        trend_reason = "the one-year trend is constructive but needs stronger recent confirmation"
    elif ytd is not None and ytd > 0:
        trend_reason = "recent recovery is visible but the longer trend is not fully repaired"
    else:
        trend_reason = "trend support is weak or incomplete"

    valuation_reason = (
        "valuation looks reasonable versus earnings"
        if pe is not None and 0 < pe <= 12
        else "valuation needs extra caution"
        if pe is not None and pe > 20
        else "valuation data is limited"
    )
    liquidity_reason = (
        "liquidity is strong enough for a cleaner signal"
        if volume is not None and volume >= 1_000_000
        else "liquidity is thinner, so confirmation matters"
    )
    fundamentals = []
    if pe is not None:
        fundamentals.append(
            "P/E supports valuation discipline"
            if 0 < pe <= 12
            else "P/E requires valuation caution"
            if pe > 20
            else "P/E is neutral"
        )
    if eps is not None:
        fundamentals.append("EPS is available for earnings confirmation")
    if sales is not None and profit is not None:
        fundamentals.append("sales and profit after taxation support a fundamentals check")
    fundamentals_reason = ", ".join(fundamentals) if fundamentals else "fundamental detail is limited"
    if announcements:
        clean_announcements = [display_title(item) for item in announcements[:2]]
        development_reason = f"latest developments include {', '.join(clean_announcements)}"
    elif site_development:
        development_reason = site_development
    else:
        development_reason = "no fresh company website or announcement development was available during this fetch"

    confidence = round(clamp(total, 45, 88))
    return {
        "symbol": company.get("symbol") or "",
        "name": company.get("name") or "Pakistan Stock Exchange",
        "action": action,
        "score": round(total, 2),
        "confidence": confidence,
        "thesis": (
            f"One-year setup: {percent_label(one_year)} return, {percent_label(ytd)} YTD, "
            f"and {percent_label(daily)} latest daily move. The model favors names with "
            "positive one-year momentum, current participation, index weight, points, "
            "liquidity, and market-cap support."
        ),
        "risk": (
            f"Market cap is {money_label(market_cap)} and KMI weight is "
            f"{percent_label(weight)}. Treat as a research shortlist; reduce size if daily "
            "momentum turns negative or broader KMI trend weakens."
        ),
        "reason": (
            f"{daily_reason}, {trend_reason}, {valuation_reason}, {liquidity_reason}, "
            f"{fundamentals_reason}, and {development_reason}. This is why the model ranks "
            "the stock as a one-year buy/growth candidate rather than relying on a single metric."
        ),
        "metrics": {
            "oneYear": one_year,
            "ytd": ytd,
            "daily": daily,
            "indexWeight": weight,
            "indexPoint": points,
            "marketCap": market_cap,
            "volume": volume,
        },
    }


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    companies = payload.get("companies") or []
    companies_by_symbol = {
        company.get("symbol"): company
        for company in companies
        if isinstance(company, dict) and company.get("symbol")
    }
    scored = [score_company(company) for company in companies if isinstance(company, dict)]
    scored.sort(key=lambda item: item["score"], reverse=True)
    picks = scored[:5]
    if fetch_company_context:
        contexts = {}
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {
                executor.submit(fetch_company_context, companies_by_symbol.get(pick["symbol"], pick)): pick["symbol"]
                for pick in picks
                if pick.get("symbol")
            }
            for future in as_completed(futures):
                symbol = futures[future]
                try:
                    contexts[symbol] = future.result()
                except Exception:
                    contexts[symbol] = {}
        picks = [
            score_company(companies_by_symbol.get(pick["symbol"], pick), contexts.get(pick["symbol"], {}))
            for pick in picks
        ]
    leader = picks[0]["symbol"] if picks else "KMI30"

    output = {
        "engine": "KMI one-year buy/growth analysis",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "horizon": "12m",
        "summary": (
            f"The Expert model prefers {leader} for the next one year "
            "because it has the strongest blended score across performance, latest daily "
            "move, index points, index weight, liquidity, and market-cap support."
        ),
        "recommendations": picks,
        "agentSteps": [
            "Read the latest KMI30 constituent table already fetched by the dashboard.",
            "Scored one-year return, YTD trend, daily update, index weight, KMI points, market cap, and volume.",
            "Ranked the best one-year buying and growth candidates from the KMI universe.",
            "Returned a research shortlist with risk notes rather than an automatic trade instruction.",
        ],
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()
