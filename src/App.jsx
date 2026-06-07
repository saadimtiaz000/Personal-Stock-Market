import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  ChevronRight,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8787"
    : "");
const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, "Segoe UI", system-ui, sans-serif';

const formatNumber = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return Number(value).toLocaleString("en-PK", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  const sign = Number(value) > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}%`;
};

const formatMarketCap = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  const amount = Number(value);
  const absAmount = Math.abs(amount);
  const units = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
  ];
  const unit = units.find((item) => absAmount >= item.threshold);

  if (!unit) {
    return `Rs ${formatNumber(amount, 0)}`;
  }

  return `Rs ${formatNumber(amount / unit.threshold, 1)}${unit.suffix}`;
};

const formatLiveDateTime = (date) =>
  new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);

const PRESERVED_REASON_TERMS = new Set([
  "PSX",
  "KMI",
  "YTD",
  "TTM",
  "EPS",
  "CEO",
  "CFO",
  "COO",
  "CBS",
]);

const REASON_SMALL_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

const formatReasonLine = (value) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return text;

  const letters = text.replace(/[^a-z]/gi, "");
  if (!letters || letters !== letters.toUpperCase()) {
    return text;
  }

  let wordIndex = 0;
  return text.toLowerCase().replace(/[a-z][a-z'/-]*/g, (word) => {
    const upper = word.toUpperCase();
    const isFirstWord = wordIndex === 0;
    wordIndex += 1;

    if (PRESERVED_REASON_TERMS.has(upper)) {
      return upper;
    }

    if (!isFirstWord && REASON_SMALL_WORDS.has(word)) {
      return word;
    }

    return word.charAt(0).toUpperCase() + word.slice(1);
  });
};

const getOneYearPeriod = (snapshot) => {
  const sourceDate = snapshot?.asOf && snapshot.asOf !== "Demo data"
    ? new Date(snapshot.asOf)
    : new Date();

  if (Number.isNaN(sourceDate.getTime())) {
    return "";
  }

  const startYear = sourceDate.getFullYear() - 1;
  const endYear = sourceDate.getFullYear();
  return `${startYear}-${endYear}`;
};

const getSnapshotDateLabel = (snapshot) => {
  if (!snapshot?.asOf) return "";
  if (snapshot.asOf === "Demo data") return "";

  const sourceDate = new Date(snapshot.asOf);
  if (Number.isNaN(sourceDate.getTime())) {
    return snapshot.asOf;
  }

  return new Intl.DateTimeFormat("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(sourceDate);
};

const toneFor = (value) => {
  if (value > 0) return styles.positiveText;
  if (value < 0) return styles.negativeText;
  return styles.mutedText;
};

const accentPalette = [
  { badge: "#5f75ff", chart: "#63f2df", panel: "rgba(91, 112, 186, 0.36)" },
  { badge: "#7c5d92", chart: "#ff8fa1", panel: "rgba(124, 93, 146, 0.34)" },
  { badge: "#3e89a8", chart: "#63d7f2", panel: "rgba(62, 137, 168, 0.32)" },
  { badge: "#9b7a44", chart: "#ffd58d", panel: "rgba(155, 122, 68, 0.32)" },
  { badge: "#4f8f78", chart: "#62f2c9", panel: "rgba(79, 143, 120, 0.32)" },
];

const getAccent = (rank) => accentPalette[(rank - 1) % accentPalette.length];

const getInitialModal = () => {
  if (typeof window === "undefined") return null;
  const modal = new URLSearchParams(window.location.search).get("modal");
  return modal === "expert" || modal === "brokers" || modal === "kmi" ? modal : null;
};

const MARKET_LOGO_SRC = "/market-logo-original.png";

function MarketLogo({ compact }) {
  return (
    <Image
      accessibilityLabel="Stock Market Analytics Pakistan logo"
      resizeMode="contain"
      source={{ uri: MARKET_LOGO_SRC }}
      style={[styles.brandLogoImage, compact && styles.brandLogoImageCompact]}
    />
  );
}

function App() {
  const { width } = useWindowDimensions();
  const isCompact = width < 900;
  const [market, setMarket] = useState(null);
  const [opinion, setOpinion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agentLoading, setAgentLoading] = useState(false);
  const [kmi, setKmi] = useState(null);
  const [kmiLoading, setKmiLoading] = useState(false);
  const [kmiError, setKmiError] = useState("");
  const [kmiSignalOpen, setKmiSignalOpen] = useState(false);
  const [kmiSignalLoading, setKmiSignalLoading] = useState(false);
  const [kmiSignalError, setKmiSignalError] = useState("");
  const [kmiSignal, setKmiSignal] = useState(null);
  const [error, setError] = useState("");
  const [horizon, setHorizon] = useState("12m");
  const [now, setNow] = useState(() => new Date());
  const [activeModal, setActiveModal] = useState(getInitialModal);

  const loadMarket = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/market`);
      if (!response.ok) {
        throw new Error(`Market API returned ${response.status}`);
      }

      const payload = await response.json();
      setMarket(payload);
    } catch (err) {
      setError(err.message || "Unable to load market data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const runExpertOpinion = useCallback(async () => {
    setAgentLoading(true);
    setOpinion(null);

    try {
      const response = await fetch(`${API_BASE}/api/expert-opinion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon }),
      });
      if (!response.ok) {
        throw new Error(`Expert API returned ${response.status}`);
      }

      const payload = await response.json();
      setOpinion(payload);
    } catch (err) {
      setOpinion({
        generatedAt: new Date().toISOString(),
        summary:
          "The analyst agent could not reach the data service. Start the API server, then run the opinion again.",
        recommendations: [],
        agentSteps: [err.message || "Expert opinion failed."],
      });
    } finally {
      setAgentLoading(false);
    }
  }, [horizon]);

  const loadKmi = useCallback(async () => {
    const hasReasonData = kmi?.companies?.some((company) => company.reason);
    if (hasReasonData) return;

    setKmiLoading(true);
    setKmiError("");

    try {
      const response = await fetch(`${API_BASE}/api/kmi30`);
      if (!response.ok) {
        throw new Error(`KMI API returned ${response.status}`);
      }

      const payload = await response.json();
      setKmi(payload);
    } catch (err) {
      setKmiError(err.message || "Unable to load KMI30 companies.");
    } finally {
      setKmiLoading(false);
    }
  }, [kmi]);

  const openModal = useCallback((modal) => {
    setActiveModal(modal);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
    setKmiSignalOpen(false);

    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      if (nextUrl.searchParams.has("modal")) {
        nextUrl.searchParams.delete("modal");
        window.history.replaceState(
          {},
          "",
          `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
        );
      }
    }
  }, []);

  const runKmiSignal = useCallback(async () => {
    setKmiSignalOpen(true);
    setKmiSignalLoading(true);
    setKmiSignalError("");

    try {
      const response = await fetch(`${API_BASE}/api/kmi30-opinion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`KMI opinion API returned ${response.status}`);
      }

      setKmiSignal(await response.json());
    } catch (err) {
      setKmiSignalError(err.message || "Unable to run KMI buying analysis.");
    } finally {
      setKmiSignalLoading(false);
    }
  }, []);

  const closeKmiSignal = useCallback(() => {
    setKmiSignalOpen(false);
  }, []);

  useEffect(() => {
    loadMarket();
  }, [loadMarket]);

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    const refreshTimer = setInterval(loadMarket, 10 * 60 * 1000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(refreshTimer);
    };
  }, [loadMarket]);

  useEffect(() => {
    if (activeModal === "kmi") {
      loadKmi();
    }
  }, [activeModal, loadKmi]);

  const topStocks = market?.topStocks || [];
  const brokers = market?.brokers || [];
  const sourceMode = market?.sourceMode || "loading";
  const snapshot = market?.snapshot || {};

  const strongestStock = topStocks[0];
  const oneYearPeriod = getOneYearPeriod(snapshot);
  const snapshotDateLabel = getSnapshotDateLabel(snapshot);

  return (
    <>
    <ScrollView style={styles.app} contentContainerStyle={styles.page}>
      <View style={[styles.shell, isCompact && styles.shellCompact]}>
        <View style={[styles.header, isCompact && styles.headerCompact]}>
            <View style={[styles.brandWrap, isCompact && styles.brandWrapCompact]}>
            <View style={[styles.brandMark, isCompact && styles.brandMarkCompact]}>
              <MarketLogo compact={isCompact} />
            </View>
            <View style={styles.brandText}>
              <Text
                style={[styles.brandTitle, isCompact && styles.brandTitleCompact]}
              >
                Pakistan Stock Market Analytics
              </Text>
              <Text
                style={[styles.brandSub, isCompact && styles.brandSubCompact]}
              >
                Market Research
              </Text>
            </View>
          </View>

          <View style={[styles.headerRight, isCompact && styles.headerRightCompact]}>
            <View style={styles.headerActions}>
              <Pill icon={Clock3} text={formatLiveDateTime(now)} />
              <IconButton
                icon={RefreshCw}
                label="Refresh"
                onPress={loadMarket}
                disabled={loading}
              />
            </View>
          </View>
        </View>

        {error ? (
          <Notice
            title="Data service needs attention"
            body={error}
            icon={AlertTriangle}
          />
        ) : null}

        <View style={[styles.statsGrid, isCompact && styles.stack]}>
          <StatTile
            label="Best one year performer"
            value={strongestStock?.symbol || "-"}
            meta={
              strongestStock
                ? `${formatPercent(strongestStock.oneYear)}${oneYearPeriod ? ` (${oneYearPeriod})` : ""}`
                : "-"
            }
            icon={TrendingUp}
          />
          <DeskActionCard
            icon={BarChart3}
            eyebrow="Market index"
            title="KMI - 30 Index"
            detail="Islamic index tracker"
            onPress={() => openModal("kmi")}
            prominent
          />
          <DeskActionCard
            icon={Sparkles}
            eyebrow="Analyst desk"
            title="Expert opinion"
            detail="Six months and one year view"
            onPress={() => openModal("expert")}
            prominent
            navy
          />
          <DeskActionCard
            icon={Building2}
            eyebrow="Broker board"
            title="Top 10 brokers"
            detail={`${brokers.length || "Live"} brokers available`}
            onPress={() => openModal("brokers")}
            prominent
          />
        </View>

        <View style={[styles.mainGrid, isCompact && styles.stack]}>
          <View style={styles.primaryColumn}>
            <SectionTitle
              icon={TrendingUp}
              eyebrow="Performance leaders"
              title="Top 10 profit leaders"
              action={
                <View style={styles.sectionMetaWrap}>
                  <Text style={styles.sourceText}>
                    {snapshot.asOf
                      ? `Latest PSX session: ${snapshot.asOf}`
                      : sourceMode === "live"
                        ? "Live adapter"
                        : "Live PSX data unavailable; using saved fallback values"}
                  </Text>
                </View>
              }
            />

            {loading ? (
              <LoadingBlock text="Ranking Pakistan Stock Exchange symbols..." />
            ) : (
              <View style={styles.stockList}>
                {topStocks.map((stock, index) => (
                  <StockRow
                    key={stock.symbol}
                    stock={stock}
                    rank={index + 1}
                    compact={isCompact}
                    snapshotDateLabel={snapshotDateLabel}
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.disclosure}>
          <ShieldCheck size={18} color="#bfe0ff" />
          <Text style={styles.disclosureText}>
            Research only. This app ranks public market signals and does not
            guarantee returns or replace a licensed financial adviser.
          </Text>
        </View>
      </View>
    </ScrollView>

      {activeModal === "expert" ? (
        <ModalShell
          icon={Bot}
          eyebrow="Analyst desk"
          title="Expert opinion"
          onClose={closeModal}
        >
          <ExpertPanel
            horizon={horizon}
            setHorizon={setHorizon}
            loading={agentLoading}
            opinion={opinion}
            onRun={runExpertOpinion}
            embedded
          />
        </ModalShell>
      ) : null}

      {activeModal === "brokers" ? (
        <ModalShell
          icon={Building2}
          eyebrow="Investor access"
          title="Top 10 brokers"
          onClose={closeModal}
        >
          {loading ? (
            <LoadingBlock text="Loading broker ranking..." />
          ) : (
            <View style={styles.brokerListModal}>
              {brokers.map((broker, index) => (
                <BrokerRow
                  broker={broker}
                  rank={index + 1}
                  key={`${broker.name}-${index}`}
                />
              ))}
            </View>
          )}
        </ModalShell>
      ) : null}

      {activeModal === "kmi" ? (
        <ModalShell
          icon={BarChart3}
          eyebrow="Market index"
          title="KMI - 30 Index"
          onClose={closeModal}
          headerAction={
            <Pressable
              style={[styles.kmiOpinionButton, kmiSignalLoading && styles.disabled]}
              onPress={runKmiSignal}
              disabled={kmiSignalLoading}
            >
              <View style={styles.kmiSignalIconTile}>
                {kmiSignalLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Sparkles size={16} color="#ffffff" />
                )}
              </View>
              <Text style={styles.kmiOpinionButtonText}>
                {kmiSignalLoading ? "Analysing..." : "Expert Signal"}
              </Text>
            </Pressable>
          }
        >
          <KmiIndexPanel
            loading={kmiLoading}
            error={kmiError}
            data={kmi}
            period={oneYearPeriod || "2025-2026"}
          />
        </ModalShell>
      ) : null}

      {activeModal === "kmi" && kmiSignalOpen ? (
        <KmiOpinionModal
          error={kmiSignalError}
          loading={kmiSignalLoading}
          onClose={closeKmiSignal}
          opinion={kmiSignal}
        />
      ) : null}
    </>
  );
}

function DeskActionCard({ icon: Icon, eyebrow, title, detail, onPress, prominent, navy }) {
  return (
    <Pressable
      style={[
        styles.deskActionCard,
        prominent && styles.deskActionCardProminent,
        navy && styles.deskActionCardNavy,
      ]}
      onPress={onPress}
    >
      <View style={[styles.deskActionIcon, navy && styles.deskActionIconNavy]}>
        <Icon size={18} color="#ffffff" />
      </View>
      <View style={styles.deskActionCopy}>
        <Text style={styles.deskActionEyebrow}>{eyebrow}</Text>
        <Text style={styles.deskActionTitle}>{title}</Text>
        <Text style={styles.deskActionDetail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <View style={styles.deskActionArrow}>
        <ChevronRight size={18} color="#bfe0ff" />
      </View>
    </Pressable>
  );
}

function ModalShell({ icon: Icon, eyebrow, title, children, onClose, headerAction }) {
  return (
    <View style={styles.modalLayer}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <View style={styles.modalTitleWrap}>
            <View style={styles.modalIcon}>
              <Icon size={19} color="#ffffff" />
            </View>
            <View style={styles.sectionTitleTextWrap}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.sectionTitle}>{title}</Text>
            </View>
          </View>
          {headerAction ? (
            <View style={styles.modalHeaderAction}>{headerAction}</View>
          ) : null}
          <Pressable
            accessibilityLabel="Close"
            title="Close"
            onPress={onClose}
            style={styles.closeButton}
          >
            <X size={20} color="#ffffff" />
          </Pressable>
        </View>
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalBody}
          showsVerticalScrollIndicator
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

function SectionTitle({ icon: Icon, eyebrow, title, action }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleWrap}>
        <View style={styles.sectionIcon}>
          <Icon size={18} color="#ffffff" />
        </View>
        <View style={styles.sectionTitleTextWrap}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      </View>
      {action}
    </View>
  );
}

function StatTile({ label, value, meta, icon: Icon }) {
  return (
    <View style={styles.statTile}>
      <View style={styles.statCopy}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statMeta}>{meta}</Text>
      </View>
      <View style={styles.statIcon}>
        <Icon size={20} color="#ffffff" />
      </View>
    </View>
  );
}

function StockRow({ stock, rank, compact, snapshotDateLabel }) {
  const accent = getAccent(rank);

  return (
    <View style={[styles.stockCard, compact && styles.stockCardCompact]}>
      <View style={[styles.cardAccent, { backgroundColor: accent.badge }]} />
      <View style={[styles.stockLeft, compact && styles.stockLeftCompact]}>
        <View style={styles.stockIdentity}>
          <Text style={styles.symbol}>{stock.symbol}</Text>
          <Text style={styles.companyName} numberOfLines={1}>
            {stock.name || stock.sector || "Pakistan Stock Exchange"}
          </Text>
          {snapshotDateLabel ? (
            <Text style={styles.stockDateText} numberOfLines={1}>
              As of {snapshotDateLabel}
            </Text>
          ) : null}
        </View>
        <View style={[styles.symbolBadge, { backgroundColor: accent.badge }]}>
          <Text style={styles.symbolBadgeText}>{stock.symbol.slice(0, 2)}</Text>
        </View>
      </View>

      <View style={[styles.stockValueBlock, compact && styles.stockValueBlockCompact]}>
        <Text style={styles.metricLabel}>Latest price</Text>
        <Text style={styles.priceText}>Rs {formatNumber(stock.price)}</Text>
      </View>

      <View style={styles.cardMetricGrid}>
        <View style={styles.cardMetric}>
          <Text style={styles.cardMetricLabel}>Year to date</Text>
          <Text style={[styles.cardMetricValue, toneFor(stock.ytd)]}>
            {formatPercent(stock.ytd)}
          </Text>
        </View>
        <View style={styles.cardMetric}>
          <Text style={styles.cardMetricLabel}>One year</Text>
          <Text style={[styles.cardMetricValue, toneFor(stock.oneYear)]}>
            {formatPercent(stock.oneYear)}
          </Text>
          {snapshotDateLabel ? (
            <Text style={styles.cardMetricDate}>As of {snapshotDateLabel}</Text>
          ) : null}
        </View>
        <View style={styles.cardMetric}>
          <Text style={styles.cardMetricLabel}>Daily move</Text>
          <Text style={[styles.cardMetricValue, toneFor(stock.changePct)]}>
            {formatPercent(stock.changePct)}
          </Text>
        </View>
        <View style={styles.cardMetric}>
          <Text style={styles.cardMetricLabel}>Model score</Text>
          <Text style={styles.cardMetricValue}>{formatNumber(stock.score, 1)}</Text>
        </View>
      </View>

      <View style={[styles.cardFooter, { backgroundColor: accent.panel }]}>
        <Text style={styles.cardFooterLabel}>Research note</Text>
        <Text style={styles.cardFooterText}>
          Ranked by one year profit, year to date move, liquidity, and valuation.
        </Text>
      </View>
    </View>
  );
}

function BrokerRow({ broker, rank }) {
  return (
    <View style={styles.brokerCard}>
      <View style={styles.brokerRank}>
        <Text style={styles.brokerRankText}>{rank}</Text>
      </View>
      <View style={styles.brokerCopy}>
        <Text style={styles.brokerName}>{broker.name}</Text>
        <Text style={styles.brokerMeta}>{broker.category}</Text>
      </View>
    </View>
  );
}

function KmiIndexPanel({ loading, error, data, period }) {
  const { width } = useWindowDimensions();
  const companies = data?.companies || [];
  const isNarrowKmi = width < 640;

  if (loading) {
    return <LoadingBlock text="Loading KMI30 ranking..." />;
  }

  if (error) {
    return (
      <Notice
        title="KMI index needs attention"
        body={error}
        icon={AlertTriangle}
      />
    );
  }

  return (
    <View style={styles.kmiPanel}>
      <View style={styles.kmiList}>
        {companies.map((company, index) => (
          <KmiCompanyRow
            company={company}
            compact={isNarrowKmi}
            rank={index + 1}
            period={period}
            key={`${company.symbol}-${index}`}
          />
        ))}
      </View>
    </View>
  );
}

function KmiOpinionPanel({ opinion }) {
  const picks = opinion?.recommendations || [];
  const engineLabel = opinion.engine?.replace(/^Python\s+/i, "");

  return (
    <View style={styles.kmiOpinionPanel}>
      <View style={styles.kmiOpinionHeader}>
        <View style={styles.kmiOpinionIcon}>
          <Bot size={18} color="#ffffff" />
        </View>
        <View style={styles.sectionTitleTextWrap}>
          <Text style={styles.eyebrow}>One year buy/growth view</Text>
          <Text style={styles.kmiOpinionTitle}>Best KMI stocks after analysis</Text>
        </View>
      </View>

      <Text style={styles.kmiOpinionSummary}>{opinion.summary}</Text>
      {engineLabel ? (
        <Text style={styles.kmiOpinionEngine}>{engineLabel}</Text>
      ) : null}

      <View style={styles.kmiOpinionList}>
        {picks.map((pick, index) => (
          <View style={styles.kmiOpinionCard} key={`${pick.symbol}-${index}`}>
            <View style={styles.kmiOpinionTop}>
              <View style={styles.kmiOpinionRank}>
                <Text style={styles.kmiOpinionRankText}>{index + 1}</Text>
              </View>
              <View style={styles.kmiOpinionCopy}>
                <View style={styles.kmiOpinionSymbolRow}>
                  <Text style={styles.kmiOpinionSymbol}>{pick.symbol}</Text>
                  <Text style={styles.kmiOpinionScore}>
                    {formatNumber(pick.score, 1)}
                  </Text>
                </View>
                <Text style={styles.kmiOpinionName} numberOfLines={1}>
                  {pick.name}
                </Text>
              </View>
              <View style={styles.kmiOpinionAction}>
                <Text style={styles.kmiOpinionActionText}>{pick.action}</Text>
              </View>
            </View>
            <View style={styles.kmiOpinionMetrics}>
              <MiniMetric label="1Y" value={formatPercent(pick.metrics?.oneYear)} tone={pick.metrics?.oneYear} />
              <MiniMetric label="Daily" value={formatPercent(pick.metrics?.daily)} tone={pick.metrics?.daily} />
              <MiniMetric label="Points" value={formatNumber(pick.metrics?.indexPoint)} />
              <MiniMetric label="Cap" value={formatMarketCap(pick.metrics?.marketCap)} />
            </View>
            {pick.reason ? (
              <View style={styles.kmiOpinionReasonBox}>
                <Text style={styles.kmiOpinionReasonLabel}>Reason</Text>
                <Text style={styles.kmiOpinionReason}>{pick.reason}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function KmiOpinionModal({ error, loading, onClose, opinion }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <View style={styles.signalModalLayer}>
      <View style={styles.signalModalCard}>
        <View style={styles.signalModalHeader}>
          <View style={styles.modalTitleWrap}>
            <View style={styles.modalIcon}>
              <Sparkles size={19} color="#ffffff" />
            </View>
            <View style={styles.sectionTitleTextWrap}>
              <Text style={styles.eyebrow}>One year buy/growth view</Text>
              <Text style={styles.sectionTitle}>Expert Signal</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Close expert signal"
            onPress={onClose}
            style={styles.closeButton}
          >
            <X size={20} color="#ffffff" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.signalModalScroll}
          contentContainerStyle={styles.signalModalBody}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <LoadingBlock text="Analysing KMI stocks..." />
          ) : error ? (
            <Notice
              title="KMI buying analysis needs attention"
              body={error}
              icon={AlertTriangle}
            />
          ) : opinion ? (
            <KmiOpinionPanel opinion={opinion} />
          ) : null}
        </ScrollView>
      </View>
    </View>,
    document.body,
  );
}

function MiniMetric({ label, value, tone }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricLabel}>{label}</Text>
      <Text style={[styles.miniMetricValue, tone !== undefined && toneFor(tone)]}>
        {value}
      </Text>
    </View>
  );
}

function KmiCompanyRow({ company, rank, period, compact }) {
  return (
    <View style={[styles.kmiRow, compact && styles.kmiRowCompact]}>
      <View style={styles.kmiRank}>
        <Text style={styles.kmiRankText}>{rank}</Text>
      </View>
      <View style={styles.kmiCompanyCopy}>
        <View style={styles.kmiCompanyHeader}>
          <Text style={styles.kmiSymbol}>{company.symbol}</Text>
          <Text style={[styles.kmiReturn, toneFor(company.oneYear)]}>
            {formatPercent(company.oneYear)}
          </Text>
        </View>
        <Text style={styles.kmiName} numberOfLines={1}>
          {company.name || "Pakistan Stock Exchange"}
        </Text>
        <Text style={styles.kmiPeriod}>One year: {period}</Text>
      </View>
      <View style={styles.kmiMetricGroup}>
        <View style={[styles.kmiMetric, compact && styles.kmiMetricCompact]}>
          <Text style={styles.kmiMetricLabel}>Daily</Text>
          <Text style={[styles.kmiMetricValue, toneFor(company.changePct)]}>
            {formatPercent(company.changePct)}
          </Text>
        </View>
        <View style={[styles.kmiMetric, compact && styles.kmiMetricCompact]}>
          <Text style={styles.kmiMetricLabel}>YTD</Text>
          <Text style={[styles.kmiMetricValue, toneFor(company.ytd)]}>
            {formatPercent(company.ytd)}
          </Text>
        </View>
        <View style={[styles.kmiMetric, compact && styles.kmiMetricCompact]}>
          <Text style={styles.kmiMetricLabel}>Weight</Text>
          <Text style={styles.kmiMetricValue}>
            {company.indexWeight === null || company.indexWeight === undefined
              ? "-"
              : `${formatNumber(company.indexWeight)}%`}
          </Text>
        </View>
        <View style={[styles.kmiMetric, compact && styles.kmiMetricCompact]}>
          <Text style={styles.kmiMetricLabel}>Points</Text>
          <Text style={styles.kmiMetricValue}>
            {formatNumber(company.indexPoint)}
          </Text>
        </View>
        <View style={[styles.kmiMetric, compact && styles.kmiMetricCompact]}>
          <Text style={styles.kmiMetricLabel}>Price</Text>
          <Text style={styles.kmiMetricValue}>Rs {formatNumber(company.price)}</Text>
        </View>
        <View
          style={[
            styles.kmiMetric,
            styles.kmiMetricWide,
            compact && styles.kmiMetricCompact,
          ]}
        >
          <Text style={styles.kmiMetricLabel}>Market cap</Text>
          <Text style={styles.kmiMetricValue}>
            {formatMarketCap(company.marketCap)}
          </Text>
        </View>
      </View>
      <View style={styles.kmiReasonBox}>
        <KmiReasonDetails company={company} />
      </View>
    </View>
  );
}

function KmiReasonDetails({ company }) {
  const details = company.reasonDetails;

  if (!details) {
    return (
      <Text style={styles.kmiReasonText}>
        {company.reason || "Reason unavailable while KMI analysis data refreshes."}
      </Text>
    );
  }

  const fundamentals = details.fundamentals?.length
    ? details.fundamentals
    : ["Fundamental fields were limited in the latest PSX company fetch."];
  const developments = details.developments?.length
    ? details.developments
    : ["No fresh filtered company announcement or website development was found during this fetch."];

  return (
    <View style={styles.kmiReasonSections}>
      <ReasonSection title="Company profile">
        <Text style={styles.kmiReasonText}>{formatReasonLine(details.companyProfile)}</Text>
      </ReasonSection>
      <ReasonSection title="Company website link">
        <Text style={styles.kmiReasonLink}>{details.companyWebsite}</Text>
      </ReasonSection>
      <ReasonSection title="Fundamentals">
        {fundamentals.map((item, index) => (
          <Text style={styles.kmiReasonText} key={`fundamental-${index}`}>
            {formatReasonLine(item)}
          </Text>
        ))}
      </ReasonSection>
      <ReasonSection title="Developments">
        {developments.map((item, index) => (
          <Text style={styles.kmiReasonText} key={`development-${index}`}>
            {formatReasonLine(item)}
          </Text>
        ))}
      </ReasonSection>
      <ReasonSection title="Reason">
        <Text style={styles.kmiReasonText}>
          {formatReasonLine(
            details.performanceReason ||
              "Performance reason is unavailable while KMI analysis data refreshes.",
          )}
        </Text>
      </ReasonSection>
    </View>
  );
}

function ReasonSection({ title, children }) {
  return (
    <View style={styles.kmiReasonSection}>
      <Text style={styles.kmiReasonSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ExpertPanel({ horizon, setHorizon, loading, opinion, onRun, embedded }) {
  const engineLabel = opinion?.engine?.replace(/^Python\s+/i, "");

  return (
    <View style={[styles.expertPanel, embedded && styles.expertPanelEmbedded]}>
      {!embedded ? (
        <View style={styles.expertHeader}>
          <View style={styles.expertHeaderIcon}>
            <Bot size={18} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.eyebrow}>Analyst desk</Text>
            <Text style={styles.sectionTitle}>Expert opinion</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.segmented}>
        {[
          ["6m", "Six months"],
          ["12m", "One year"],
        ].map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setHorizon(value)}
            style={[
              styles.segmentButton,
              horizon === value && styles.segmentButtonActive,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                horizon === value && styles.segmentTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.agentButton, loading && styles.disabled]}
        onPress={onRun}
        disabled={loading}
      >
        {loading ? (
          <View style={styles.kmiSignalIconTile}>
            <ActivityIndicator color="#ffffff" />
          </View>
        ) : (
          <View style={styles.kmiSignalIconTile}>
            <Sparkles size={16} color="#ffffff" />
          </View>
        )}
        <Text style={styles.agentButtonText}>
          {loading ? "Analysing..." : "Run expert opinion"}
        </Text>
      </Pressable>

      {opinion ? (
        <View style={styles.opinionWrap}>
          {engineLabel ? (
            <Text style={styles.engineLabel}>{engineLabel}</Text>
          ) : null}
          <Text style={styles.opinionSummary}>{opinion.summary}</Text>
          {opinion.recommendations.map((item, index) => (
            <View style={styles.recoCard} key={item.symbol}>
              <View
                style={[
                  styles.recoAccent,
                  { backgroundColor: getAccent(index + 1).badge },
                ]}
              />
              <View style={styles.recoTop}>
                <View>
                  <Text style={styles.recoSymbol}>{item.symbol}</Text>
                  <Text style={styles.recoName} numberOfLines={1}>
                    {item.name || "Pakistan Stock Exchange"}
                  </Text>
                </View>
                <View style={styles.actionPill}>
                  <Text style={styles.recoAction}>{item.action}</Text>
                </View>
              </View>
              <Text style={styles.recoText}>{item.thesis}</Text>
              {item.indicators ? (
                <View style={styles.indicatorGrid}>
                  <Indicator
                    label="Projected return"
                    value={formatPercent(item.indicators.projectedReturn)}
                  />
                  <Indicator
                    label="Relative strength"
                    value={formatNumber(item.indicators.relativeStrengthIndex, 1)}
                  />
                  <Indicator
                    label="Annual volatility"
                    value={formatPercent(item.indicators.annualizedVolatility)}
                  />
                </View>
              ) : null}
              <View style={styles.riskBox}>
                <Text style={styles.riskLabel}>Risk view</Text>
                <Text style={styles.recoMeta}>{item.risk}</Text>
              </View>
            </View>
          ))}
          <View style={styles.agentSteps}>
            {opinion.agentSteps.map((step) => (
              <Text style={styles.agentStep} key={step}>
                {step}
              </Text>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.panelHint}>
          The agent ranks momentum, liquidity, valuation bands, and risk before
          producing a watchlist.
        </Text>
      )}
    </View>
  );
}

function Indicator({ label, value }) {
  return (
    <View style={styles.indicatorItem}>
      <Text style={styles.indicatorLabel}>{label}</Text>
      <Text style={styles.indicatorValue}>{value}</Text>
    </View>
  );
}

function Metric({ label, value, textStyle, compact }) {
  return (
    <View style={[styles.metric, compact && styles.metricCompact]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, textStyle]}>{value}</Text>
    </View>
  );
}

function Pill({ icon: Icon, text }) {
  return (
    <View style={styles.pill}>
      <Icon size={15} color="#e6f0ff" />
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

function IconButton({ icon: Icon, label, onPress, disabled }) {
  return (
    <Pressable
      accessibilityLabel={label}
      title={label}
      onPress={onPress}
      disabled={disabled}
      style={[styles.iconButton, disabled && styles.disabled]}
    >
      <View style={styles.iconButtonTile}>
        <Icon size={16} color="#ffffff" />
      </View>
      <Text style={styles.iconButtonText}>{label}</Text>
    </Pressable>
  );
}

function LoadingBlock({ text }) {
  return (
    <View style={styles.loadingBlock}>
      <ActivityIndicator color="#2e6b57" />
      <Text style={styles.loadingText}>{text}</Text>
    </View>
  );
}

function Notice({ title, body, icon: Icon }) {
  return (
    <View style={styles.notice}>
      <Icon size={18} color="#9c4f1a" />
      <View>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    minHeight: "100%",
    backgroundColor: "#081225",
    backgroundImage:
      "radial-gradient(circle at 82% 12%, rgba(10, 132, 255, 0.22), transparent 34%), radial-gradient(circle at 18% 8%, rgba(42, 92, 170, 0.18), transparent 32%), linear-gradient(160deg, #060b16 0%, #0b1630 48%, #121931 100%)",
  },
  page: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  shell: {
    alignSelf: "center",
    marginHorizontal: 0,
    width: "100%",
    maxWidth: 1240,
    gap: 22,
    minWidth: 0,
  },
  shellCompact: {
    gap: 16,
  },
  header: {
    alignItems: "stretch",
    backgroundColor: "rgba(9, 20, 43, 0.82)",
    borderColor: "rgba(133, 184, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18,
    shadowColor: "#020713",
    shadowOpacity: 0.36,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
  },
  headerCompact: {
    alignItems: "stretch",
    gap: 14,
    flexDirection: "column",
  },
  brandWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  brandWrapCompact: {
    alignItems: "center",
    width: "100%",
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: "#061836",
    borderColor: "rgba(54, 130, 246, 0.54)",
    borderRadius: 16,
    borderWidth: 1.5,
    flexShrink: 0,
    height: 58,
    justifyContent: "center",
    overflow: "visible",
    shadowColor: "#001433",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    width: 58,
  },
  brandMarkCompact: {
    borderRadius: 15,
    height: 54,
    width: 54,
  },
  brandLogoImage: {
    borderRadius: 13,
    height: 52,
    overflow: "hidden",
    width: 52,
  },
  brandLogoImageCompact: {
    borderRadius: 12,
    height: 48,
    width: 48,
  },
  brandTitle: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
    maxWidth: "100%",
  },
  brandTitleCompact: {
    fontSize: 21,
    lineHeight: 25,
  },
  brandText: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  brandSub: {
    color: "#b8c7df",
    flexShrink: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    marginTop: 2,
    maxWidth: "100%",
  },
  brandSubCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    maxWidth: "100%",
    minWidth: 0,
  },
  headerRight: {
    alignItems: "flex-end",
    flexShrink: 0,
    justifyContent: "center",
    minWidth: 0,
  },
  headerRightCompact: {
    alignItems: "stretch",
    minWidth: 0,
    width: "100%",
  },
  deskActions: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    width: "100%",
  },
  deskActionsCompact: {
    flexDirection: "column",
  },
  deskActionCard: {
    alignItems: "center",
    backgroundColor: "rgba(8, 28, 72, 0.78)",
    borderColor: "rgba(133, 184, 255, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 78,
    minWidth: 0,
    padding: 12,
    shadowColor: "#020713",
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  deskActionCardProminent: {
    backgroundColor: "rgba(8, 28, 72, 0.82)",
    borderColor: "rgba(133, 184, 255, 0.24)",
    minHeight: 132,
    padding: 16,
    shadowOpacity: 0.34,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  deskActionCardNavy: {
    backgroundColor: "rgba(8, 28, 72, 0.96)",
    borderColor: "rgba(133, 184, 255, 0.26)",
  },
  deskActionIcon: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  deskActionIconNavy: {
    backgroundColor: "#0a84ff",
  },
  deskActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  deskActionEyebrow: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  deskActionTitle: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 2,
  },
  deskActionDetail: {
    color: "#c4d1e5",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  deskActionArrow: {
    alignItems: "center",
    backgroundColor: "rgba(10, 132, 255, 0.2)",
    borderColor: "rgba(133, 184, 255, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  pill: {
    alignItems: "center",
    backgroundColor: "rgba(8, 28, 72, 0.68)",
    borderColor: "rgba(133, 184, 255, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  pillText: {
    color: "#eef7ff",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "750",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "rgba(8, 28, 72, 0.96)",
    borderColor: "rgba(133, 184, 255, 0.26)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  iconButtonTile: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  iconButtonText: {
    color: "#f5f5f7",
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.72,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 14,
  },
  stack: {
    flexDirection: "column",
  },
  statTile: {
    alignItems: "center",
    backgroundColor: "rgba(8, 28, 72, 0.78)",
    borderColor: "rgba(133, 184, 255, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    minHeight: 132,
    padding: 16,
    shadowColor: "#020713",
    shadowOpacity: 0.34,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  statCopy: {
    flex: 1,
    minWidth: 0,
  },
  statIcon: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  statLabel: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "750",
  },
  statValue: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 32,
    fontWeight: "850",
    marginTop: 4,
  },
  statMeta: {
    color: "#9dccff",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 3,
  },
  mainGrid: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 18,
  },
  primaryColumn: {
    flex: 1,
    gap: 12,
    minWidth: 0,
    width: "100%",
  },
  sideColumn: {
    flex: 0.85,
    gap: 18,
    minWidth: 0,
    width: "100%",
  },
  sectionGap: {
    gap: 12,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitleWrap: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
  },
  sectionTitleTextWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  sectionIcon: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  eyebrow: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: "#ffffff",
    flexShrink: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 1,
  },
  sourceText: {
    color: "#b8c7df",
    flexShrink: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  sectionMetaWrap: {
    alignItems: "flex-end",
    flexShrink: 1,
    gap: 3,
    minWidth: 0,
  },
  stockList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  stockCard: {
    alignItems: "stretch",
    backgroundColor: "rgba(9, 20, 43, 0.82)",
    borderColor: "rgba(133, 184, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "calc(33.333% - 10px)",
    flexDirection: "column",
    gap: 13,
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 270,
    overflow: "hidden",
    padding: 14,
    shadowColor: "#020713",
    shadowOpacity: 0.3,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 16 },
  },
  stockCardCompact: {
    flexBasis: "100%",
    minHeight: 0,
  },
  cardAccent: {
    borderRadius: 8,
    height: 4,
    marginBottom: 1,
    width: 46,
  },
  stockLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minWidth: 0,
  },
  stockLeftCompact: {
    width: "100%",
  },
  symbolBadge: {
    alignItems: "center",
    borderRadius: 8,
    flexShrink: 0,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  symbolBadgeText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  stockIdentity: {
    flex: 1,
    minWidth: 0,
  },
  stockIdentityCompact: {
    flexBasis: "72%",
    flexGrow: 1,
    minWidth: 0,
  },
  symbol: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 22,
    fontWeight: "800",
  },
  companyName: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    marginTop: 3,
  },
  stockDateText: {
    color: "#9dccff",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    textTransform: "uppercase",
  },
  stockValueBlock: {
    minWidth: 0,
  },
  stockValueBlockCompact: {
    width: "100%",
    minWidth: 0,
  },
  priceText: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 3,
  },
  holdingsText: {
    color: "#aeb9ca",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  cardMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cardMetric: {
    backgroundColor: "rgba(10, 39, 86, 0.58)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "calc(50% - 4px)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  cardMetricLabel: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardMetricValue: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4,
  },
  cardMetricDate: {
    color: "#9dccff",
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
    textTransform: "uppercase",
  },
  metric: {
    minWidth: 72,
  },
  metricCompact: {
    minWidth: "28%",
  },
  metricLabel: {
    color: "#8a94a4",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metricValue: {
    color: "#172234",
    fontSize: 14,
    fontWeight: "850",
    marginTop: 4,
  },
  positiveText: {
    color: "#74f0ce",
  },
  negativeText: {
    color: "#ff82a3",
  },
  mutedText: {
    color: "#b8adc9",
  },
  scoreWrap: {
    alignItems: "center",
    backgroundColor: "rgba(10, 39, 86, 0.72)",
    borderColor: "rgba(133, 184, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 88,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scoreWrapCompact: {
    alignItems: "flex-start",
    minWidth: 0,
    width: "100%",
  },
  scoreLabel: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  scoreText: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },
  cardFooter: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardFooterLabel: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardFooterText: {
    color: "#f3f7ff",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 4,
  },
  expertPanel: {
    backgroundColor: "rgba(9, 20, 43, 0.82)",
    borderColor: "rgba(133, 184, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    padding: 16,
    shadowColor: "#020713",
    shadowOpacity: 0.3,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 16 },
  },
  expertPanelEmbedded: {
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
    shadowOpacity: 0,
  },
  expertHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  expertHeaderIcon: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  segmented: {
    backgroundColor: "rgba(10, 39, 86, 0.58)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    padding: 3,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    minHeight: 36,
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#0a84ff",
    shadowColor: "#1a2944",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  segmentText: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "850",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  agentButton: {
    alignItems: "center",
    backgroundColor: "rgba(8, 28, 72, 0.96)",
    borderColor: "rgba(133, 184, 255, 0.26)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  agentButtonText: {
    color: "#f5f5f7",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "800",
  },
  panelHint: {
    color: "#c6d0e5",
    fontSize: 13,
    lineHeight: 20,
  },
  opinionWrap: {
    gap: 12,
  },
  engineLabel: {
    color: "#9dccff",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  opinionSummary: {
    backgroundColor: "rgba(10, 39, 86, 0.58)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    color: "#eef3ff",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    padding: 12,
  },
  recoCard: {
    backgroundColor: "rgba(9, 20, 43, 0.78)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    padding: 14,
    shadowColor: "#1a2944",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
  },
  recoAccent: {
    borderRadius: 8,
    height: 4,
    marginBottom: 12,
    width: 44,
  },
  recoTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 9,
  },
  recoSymbol: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: "800",
  },
  recoName: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  actionPill: {
    backgroundColor: "rgba(10, 132, 255, 0.16)",
    borderColor: "rgba(133, 184, 255, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  recoAction: {
    color: "#bfe0ff",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "900",
  },
  recoText: {
    color: "#eef3ff",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    lineHeight: 20,
  },
  indicatorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  indicatorItem: {
    backgroundColor: "rgba(10, 39, 86, 0.58)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 116,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  indicatorLabel: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  indicatorValue: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 3,
  },
  riskBox: {
    backgroundColor: "rgba(10, 39, 86, 0.58)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
  },
  riskLabel: {
    color: "#9dccff",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  recoMeta: {
    color: "#d8d0e8",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "750",
    lineHeight: 18,
    marginTop: 4,
  },
  agentSteps: {
    borderTopColor: "rgba(191, 206, 255, 0.14)",
    borderTopWidth: 1,
    gap: 5,
    paddingTop: 10,
  },
  agentStep: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    lineHeight: 17,
  },
  brokerList: {
    gap: 9,
  },
  brokerListModal: {
    gap: 10,
  },
  brokerCard: {
    alignItems: "center",
    backgroundColor: "rgba(9, 20, 43, 0.82)",
    borderColor: "rgba(133, 184, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  brokerRank: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  brokerRankText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  brokerCopy: {
    flex: 1,
  },
  brokerName: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: "800",
  },
  brokerMeta: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    marginTop: 3,
  },
  kmiPanel: {
    gap: 12,
  },
  kmiOpinionButton: {
    alignItems: "center",
    backgroundColor: "rgba(8, 28, 72, 0.96)",
    borderColor: "rgba(133, 184, 255, 0.26)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 11,
    shadowOpacity: 0,
  },
  kmiSignalIconTile: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.24)",
    borderRadius: 8,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    shadowOpacity: 0,
    width: 28,
  },
  kmiOpinionButtonText: {
    color: "#f5f5f7",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "800",
  },
  kmiOpinionPanel: {
    backgroundColor: "rgba(9, 20, 43, 0.82)",
    borderColor: "rgba(133, 184, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  kmiOpinionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  kmiOpinionIcon: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  kmiOpinionTitle: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 1,
  },
  kmiOpinionSummary: {
    color: "#eef3ff",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "750",
    lineHeight: 20,
  },
  kmiOpinionEngine: {
    color: "#9dccff",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  kmiOpinionList: {
    gap: 10,
  },
  kmiOpinionCard: {
    backgroundColor: "rgba(8, 28, 72, 0.68)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  kmiOpinionTop: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kmiOpinionRank: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  kmiOpinionRankText: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "800",
  },
  kmiOpinionCopy: {
    flex: 1,
    minWidth: 170,
  },
  kmiOpinionSymbolRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "space-between",
  },
  kmiOpinionSymbol: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: "800",
  },
  kmiOpinionScore: {
    color: "#9dccff",
    flexShrink: 0,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "800",
  },
  kmiOpinionName: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    marginTop: 3,
  },
  kmiOpinionAction: {
    backgroundColor: "rgba(10, 132, 255, 0.16)",
    borderColor: "rgba(133, 184, 255, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  kmiOpinionActionText: {
    color: "#bfe0ff",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "800",
  },
  kmiOpinionMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  miniMetric: {
    backgroundColor: "rgba(10, 39, 86, 0.58)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 78,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  miniMetricLabel: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  miniMetricValue: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
  },
  kmiOpinionReasonBox: {
    backgroundColor: "rgba(10, 39, 86, 0.58)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  kmiOpinionReasonLabel: {
    color: "#9dccff",
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  kmiOpinionReason: {
    color: "#e8fff8",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "750",
    lineHeight: 18,
  },
  signalModalLayer: {
    alignItems: "center",
    backgroundColor: "rgba(7, 5, 18, 0.58)",
    backdropFilter: "blur(16px)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 16,
    position: "fixed",
    right: 0,
    top: 0,
    WebkitBackdropFilter: "blur(16px)",
    zIndex: 100,
  },
  signalModalCard: {
    backgroundColor: "rgba(9, 20, 43, 0.98)",
    borderColor: "rgba(133, 184, 255, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: "86vh",
    maxWidth: 720,
    overflow: "hidden",
    shadowColor: "#05030d",
    shadowOpacity: 0.54,
    shadowRadius: 42,
    shadowOffset: { width: 0, height: 24 },
    width: "100%",
  },
  signalModalHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(230, 219, 255, 0.12)",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 16,
  },
  signalModalScroll: {
    maxHeight: "calc(86vh - 74px)",
  },
  signalModalBody: {
    gap: 14,
    padding: 16,
  },
  kmiList: {
    gap: 9,
  },
  kmiRow: {
    alignItems: "flex-start",
    backgroundColor: "rgba(9, 20, 43, 0.82)",
    borderColor: "rgba(133, 184, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    minWidth: 0,
    padding: 12,
  },
  kmiRowCompact: {
    gap: 11,
    padding: 14,
  },
  kmiRank: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  kmiRankText: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "600",
  },
  kmiCompanyCopy: {
    flex: 1,
    flexBasis: 220,
    minWidth: 0,
  },
  kmiCompanyHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "space-between",
    minHeight: 30,
    width: "100%",
  },
  kmiSymbol: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 17,
    fontWeight: "800",
  },
  kmiReturn: {
    alignSelf: "center",
    flexShrink: 0,
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
    marginLeft: "auto",
    textAlign: "right",
  },
  kmiName: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    marginTop: 3,
  },
  kmiPeriod: {
    color: "#aebadd",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    textTransform: "uppercase",
  },
  kmiMetricGroup: {
    flexBasis: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    justifyContent: "flex-start",
    minWidth: 0,
    width: "100%",
  },
  kmiMetric: {
    backgroundColor: "rgba(10, 39, 86, 0.58)",
    borderColor: "rgba(133, 184, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "calc(33.333% - 5px)",
    flexGrow: 1,
    minWidth: 104,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  kmiMetricCompact: {
    flexBasis: "calc(50% - 4px)",
    minWidth: 0,
  },
  kmiMetricWide: {
    minWidth: 128,
  },
  kmiMetricLabel: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  kmiMetricValue: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
  kmiReasonBox: {
    backgroundColor: "rgba(10, 39, 86, 0.5)",
    borderColor: "rgba(133, 184, 255, 0.16)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "100%",
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: "100%",
  },
  kmiReasonLabel: {
    color: "#b8c7df",
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: "850",
    textTransform: "uppercase",
  },
  kmiReasonSections: {
    gap: 9,
  },
  kmiReasonSection: {
    gap: 3,
  },
  kmiReasonSectionTitle: {
    color: "#74f0ce",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  kmiReasonText: {
    color: "#dce6fa",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
  kmiReasonLink: {
    color: "#aebfff",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  loadingBlock: {
    alignItems: "center",
    backgroundColor: "rgba(9, 20, 43, 0.9)",
    borderColor: "rgba(133, 184, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 84,
    padding: 16,
  },
  loadingText: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: "750",
  },
  notice: {
    alignItems: "flex-start",
    backgroundColor: "rgba(36, 30, 18, 0.92)",
    borderColor: "rgba(255, 204, 112, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  noticeTitle: {
    color: "#ffd58d",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "900",
  },
  noticeBody: {
    color: "#ffe6bd",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  disclosure: {
    alignItems: "center",
    backgroundColor: "rgba(9, 20, 43, 0.78)",
    borderColor: "rgba(133, 184, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    padding: 12,
  },
  disclosureText: {
    color: "#dce6fa",
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "750",
    lineHeight: 18,
  },
  modalLayer: {
    alignItems: "center",
    backgroundColor: "rgba(2, 7, 19, 0.62)",
    backdropFilter: "blur(18px)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 18,
    position: "fixed",
    right: 0,
    top: 0,
    WebkitBackdropFilter: "blur(18px)",
    zIndex: 20,
  },
  modalCard: {
    backgroundColor: "rgba(9, 20, 43, 0.98)",
    borderColor: "rgba(133, 184, 255, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    height: "88vh",
    maxHeight: "88vh",
    maxWidth: 760,
    overflow: "hidden",
    shadowColor: "#05030d",
    shadowOpacity: 0.5,
    shadowRadius: 42,
    shadowOffset: { width: 0, height: 24 },
    width: "100%",
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: "rgba(133, 184, 255, 0.16)",
    borderBottomWidth: 1,
    flexShrink: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
  },
  modalTitleWrap: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  modalHeaderAction: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center",
  },
  modalIcon: {
    alignItems: "center",
    backgroundColor: "#0a84ff",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(10, 39, 86, 0.72)",
    borderColor: "rgba(133, 184, 255, 0.22)",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  modalScroll: {
    flex: 1,
    maxHeight: "calc(88vh - 74px)",
    minHeight: 0,
    overflowY: "auto",
    scrollbarColor: "rgba(232, 222, 255, 0.24) transparent",
    scrollbarWidth: "thin",
  },
  modalBody: {
    gap: 14,
    padding: 16,
  },
});

export default App;
