import json
import math
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


TIMEOUT_SECONDS = 3
MAX_WORKERS = 10
USER_AGENT = "PakistanMarketDesk/1.0 KMI reason fetcher"


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


def direction(value):
    number = safe_number(value)
    if number is None:
        return "unknown"
    if number > 0:
        return "positive"
    if number < 0:
        return "negative"
    return "neutral"

def clean_text(value):
    value = value or ""
    replacements = {
        "\u00e2\u20ac\u2122": "'",
        "\u00e2\u20ac\u02dc": "'",
        "\u00e2\u20ac\u0153": '"',
        "\u00e2\u20ac\u009d": '"',
        "\u00e2\u20ac\u201c": "-",
        "\u00e2\u20ac\u201d": "-",
        "\u00c2": "",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    value = re.sub(r"([A-Za-z])'(?=[A-Z])", r"\1 '", value)
    return re.sub(r"\s+", " ", value).strip()


def short_text(value, limit=260):
    value = clean_text(value)
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "..."


def text_from_html(html):
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&#039;", "'")
        .replace("&quot;", '"')
    )
    return clean_text(text)


def fetch_url(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read().decode("utf-8", errors="ignore")


def first_number_after(text, label, radius=120):
    index = text.lower().find(label.lower())
    if index < 0:
        return None
    match = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", text[index + len(label) : index + len(label) + radius])
    return safe_number(match.group(0).replace(",", "")) if match else None


def extract_between(text, start_label, end_labels, limit=420):
    start = text.lower().find(start_label.lower())
    if start < 0:
        return None
    source = text[start + len(start_label) :]
    end_positions = [
        source.lower().find(label.lower())
        for label in end_labels
        if source.lower().find(label.lower()) > 0
    ]
    if end_positions:
        source = source[: min(end_positions)]
    source = clean_text(source)
    return short_text(source, limit)


def extract_latest_announcements(text):
    start = text.find("Announcements")
    end = text.find("Financials", start if start >= 0 else 0)
    source = text[start:end] if start >= 0 and end > start else text
    pattern = re.compile(
        r"([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\s+(.+?)\s+View",
        re.S,
    )
    titles = []
    for _, title in pattern.findall(source):
        title = clean_text(title)
        title = re.sub(r"^(Date Title Document|Financial Results|Board Meetings|Others)\s+", "", title)
        if is_market_data_junk(title):
            continue
        if title and title not in titles:
            titles.append(title)
        if len(titles) >= 3:
            break
    return titles


def is_market_data_junk(title):
    lowered = title.lower()
    junk_terms = [
        "open ",
        " high ",
        " low ",
        " volume ",
        "circuit breaker",
        "day range",
        "52-week range",
        "ask price",
        "bid price",
        "ldcp",
        "haircut",
        "p/e ratio",
        "1-year change",
        "ytd change",
        "market data powered",
        "company profile",
        "business description",
        "no record found",
        "last update:",
        "total trades",
    ]
    if any(term in lowered for term in junk_terms):
        return True
    if len(title) > 180:
        return True
    number_count = len(re.findall(r"\d", title))
    return number_count > 24


def format_number(value):
    number = safe_number(value)
    if number is None:
        return None
    return f"{number:,.2f}".rstrip("0").rstrip(".")


def build_reason_details(company, context):
    symbol = company.get("symbol") or "This company"
    profile = context.get("profile")
    website = context.get("website")
    pe = safe_number(company.get("pe")) or safe_number(context.get("pe"))
    eps = safe_number(context.get("eps"))
    sales = safe_number(context.get("sales"))
    profit = safe_number(context.get("profit"))
    announcements = context.get("latest_announcements") or []

    one_year = safe_number(company.get("oneYear"))
    ytd = safe_number(company.get("ytd"))
    daily = safe_number(company.get("changePct"))
    volume = safe_number(company.get("volume"))
    weight = safe_number(company.get("indexWeight"))

    fundamentals = []
    if pe is not None:
        if 0 < pe <= 12:
            fundamentals.append(f"P/E {format_number(pe)} suggests valuation is still reasonable versus earnings.")
        elif pe > 20:
            fundamentals.append(f"P/E {format_number(pe)} suggests valuation needs caution.")
        else:
            fundamentals.append(f"P/E {format_number(pe)} is available, but not a clear standalone signal.")
    if eps is not None:
        fundamentals.append(f"EPS data is available at {format_number(eps)} for earnings confirmation.")
    if sales is not None:
        fundamentals.append(f"Sales data is available at {format_number(sales)}.")
    if profit is not None:
        fundamentals.append(f"Profit after taxation data is available at {format_number(profit)}.")
    if not fundamentals:
        fundamentals.append("Fundamental fields were limited in the latest PSX company fetch.")

    developments = announcements[:3]
    if not developments:
        developments = ["No fresh filtered PSX/company announcement was found during this fetch."]

    yearly_label = f"{one_year:+.2f}%" if one_year is not None else "not available"
    if one_year is not None and one_year > 0:
        performance_reason = (
            f"In 2025-2026 it rose {yearly_label} because the one-year price trend stayed positive"
        )
    elif one_year is not None and one_year < 0:
        performance_reason = (
            f"In 2025-2026 it fell {yearly_label} because the one-year price trend stayed negative"
        )
    else:
        performance_reason = "The 2025-2026 one-year performance reason is limited because return data was unavailable"

    drivers = []
    if ytd is not None:
        if ytd > 0:
            drivers.append(f"YTD performance is also positive at {ytd:+.2f}%, showing recent momentum supported the move")
        elif ytd < 0:
            drivers.append(f"YTD performance is {ytd:+.2f}%, so the one-year gain may be facing recent pressure")
    if daily is not None:
        if daily > 0:
            drivers.append(f"the latest daily move is positive at {daily:+.2f}%, showing current buying interest")
        elif daily < 0:
            drivers.append(f"the latest daily move is negative at {daily:+.2f}%, suggesting short-term profit-taking")
    if pe is not None:
        if 0 < pe <= 12:
            drivers.append(f"P/E {format_number(pe)} suggests valuation did not look stretched versus earnings")
        elif pe > 20:
            drivers.append(f"P/E {format_number(pe)} suggests valuation risk may limit follow-through")
    if volume is not None:
        if volume >= 1_000_000:
            drivers.append("volume participation was strong enough to support the signal")
        elif volume > 0:
            drivers.append("volume was thinner, so the move needs confirmation")
    if weight is not None and weight >= 1:
        drivers.append(f"KMI index weight of {format_number(weight)}% gives the stock visible index relevance")
    if announcements:
        drivers.append("recent financial reports or corporate announcements provide fresh information for investors")

    if drivers:
        performance_reason = f"{performance_reason}; " + "; ".join(drivers[:5]) + "."
    else:
        performance_reason = f"{performance_reason}."

    return {
        "companyProfile": profile or f"{symbol} profile was not available in the latest PSX company fetch.",
        "companyWebsite": website or "Website link was not available in the latest PSX company fetch.",
        "fundamentals": fundamentals[:4],
        "developments": developments,
        "performanceReason": performance_reason,
    }


def fetch_company_context(company):
    if isinstance(company, dict):
        return {
            "website": clean_text(company.get("website")) or None,
            "profile": clean_text(company.get("companyProfile")) or None,
            "latest_announcements": [
                clean_text(item) for item in (company.get("latestAnnouncements") or [])
            ],
            "eps": company.get("eps"),
            "pe": company.get("pe"),
            "sales": company.get("sales"),
            "profit": company.get("profit"),
        }

    symbol = company
    context = {
        "website": None,
        "profile": None,
        "latest_announcements": [],
        "eps": None,
        "pe": None,
        "sales": None,
        "profit": None,
    }
    if not symbol:
        return context

    try:
        html = fetch_url(f"https://dps.psx.com.pk/company/{symbol}")
    except Exception:
        return context

    text = text_from_html(html)
    website_match = re.search(r"WEBSITE\s+((?:https?://)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s]*)?)", text, re.I)
    if website_match:
        context["website"] = website_match.group(1)
    context["profile"] = extract_between(
        text,
        "BUSINESS DESCRIPTION",
        ["KEY PEOPLE", "WEBSITE", "REGISTRAR", "Company Secretary"],
    )
    context["latest_announcements"] = extract_latest_announcements(text)
    context["pe"] = first_number_after(text, "P/E Ratio")
    context["eps"] = first_number_after(text, "EPS")
    context["sales"] = first_number_after(text, "Sales")
    context["profit"] = first_number_after(text, "Profit after Taxation")
    return context


def build_reason(company, context=None):
    context = context or {}
    symbol = company.get("symbol") or "This stock"
    daily = safe_number(company.get("changePct"))
    ytd = safe_number(company.get("ytd"))
    one_year = safe_number(company.get("oneYear"))
    weight = safe_number(company.get("indexWeight"))
    market_cap = safe_number(company.get("marketCap"))
    volume = safe_number(company.get("volume"))
    pe = safe_number(company.get("pe")) or safe_number(context.get("pe"))
    eps = safe_number(context.get("eps"))
    sales = safe_number(context.get("sales"))
    profit = safe_number(context.get("profit"))
    announcements = context.get("latest_announcements") or []

    daily_dir = direction(daily)
    ytd_dir = direction(ytd)
    yearly_dir = direction(one_year)

    if daily_dir == "positive":
        opening = "The latest move suggests active buying interest rather than immediate selling pressure."
    elif daily_dir == "negative":
        opening = "The latest move suggests profit-taking or short-term selling pressure."
    else:
        opening = "The latest move is neutral, so the stock needs confirmation from trend and liquidity."

    if yearly_dir == "positive" and ytd_dir == "positive":
        trend = "Both the one-year and year-to-date trends support a growth case, which makes the move more credible than a single-session spike."
    elif yearly_dir == "positive" and ytd_dir != "positive":
        trend = "The one-year trend is still constructive, but recent year-to-date performance is less supportive, so entries should be more selective."
    elif yearly_dir == "negative" and ytd_dir == "positive":
        trend = "Recent year-to-date recovery is improving, but the longer one-year trend still needs repair before it becomes a stronger buy case."
    elif yearly_dir == "negative" and ytd_dir == "negative":
        trend = "Both short and longer trend signals are weak, so the stock looks more like a watchlist candidate than a clean growth buy."
    else:
        trend = "Trend data is incomplete, so the reason relies more on current participation and index relevance."

    support_notes = []
    if weight is not None:
        if weight >= 5:
            support_notes.append("its larger KMI weight means the stock has meaningful influence inside the index")
        elif weight >= 1:
            support_notes.append("its moderate KMI weight gives it some index relevance")
        else:
            support_notes.append("its small KMI weight makes the signal more speculative")

    if market_cap is not None:
        if market_cap >= 100_000_000_000:
            support_notes.append("market-cap depth adds stability and usually improves institutional interest")
        elif market_cap >= 20_000_000_000:
            support_notes.append("market cap is reasonable, but the stock may still move sharply on sentiment")
        else:
            support_notes.append("smaller market cap can increase volatility and execution risk")

    if volume is not None:
        if volume >= 1_000_000:
            support_notes.append("recent volume shows enough participation to support the signal")
        elif volume > 0:
            support_notes.append("volume is thinner, so price moves need extra confirmation")

    support = " ".join(support_notes)
    if not support:
        support = "Index relevance, market-cap support, and liquidity data are limited, so conviction should stay lower."

    fundamentals = []
    if pe is not None:
        if 0 < pe <= 12:
            fundamentals.append("P/E looks reasonable versus earnings")
        elif pe > 20:
            fundamentals.append("valuation looks expensive on P/E")
        else:
            fundamentals.append("P/E is available but not a clear standalone signal")
    if eps is not None:
        fundamentals.append("latest EPS data is available for earnings confirmation")
    if sales is not None and profit is not None:
        fundamentals.append("sales and profit after taxation data support a fundamentals check")
    fundamentals_text = " ".join(fundamentals) if fundamentals else "Fundamental detail is limited, so price and liquidity confirmation matter more."

    if announcements:
        development_text = f"Latest PSX/company developments include: {', '.join(announcements[:2])}."
    else:
        development_text = "No fresh filtered PSX/company announcement was available during this fetch."

    if daily_dir == "negative" and (yearly_dir == "positive" or ytd_dir == "positive"):
        close = "The negative daily sign may be a pullback inside a broader trend, but wait for price to stabilize before treating it as a buy setup."
    elif daily_dir == "positive" and (yearly_dir == "positive" or ytd_dir == "positive"):
        close = "The positive sign is stronger because current demand lines up with broader performance momentum."
    elif daily_dir == "positive":
        close = "The positive sign is encouraging, but it needs follow-through because broader trend support is not fully clear."
    else:
        close = "The risk is that weakness continues if buyers do not return with stronger volume."

    return f"{symbol}: {opening} {trend} {support} {fundamentals_text} {development_text} {close}"


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    companies = payload.get("companies") or []
    contexts = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(fetch_company_context, company): company.get("symbol")
            for company in companies
            if isinstance(company, dict) and company.get("symbol")
        }
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                contexts[symbol] = future.result()
            except Exception:
                contexts[symbol] = {}

    output = []
    for company in companies:
        if not isinstance(company, dict):
            continue
        output.append(
            {
                "symbol": company.get("symbol"),
                "reason": build_reason(company, contexts.get(company.get("symbol"))),
                "reasonDetails": build_reason_details(company, contexts.get(company.get("symbol"), {})),
            }
        )
    print(json.dumps({"companies": output}))


if __name__ == "__main__":
    main()
