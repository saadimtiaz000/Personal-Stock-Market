import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif';

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

const formatLiveDateTime = (date) =>
  new Intl.DateTimeFormat("en-PK", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);

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
  return modal === "expert" || modal === "brokers" ? modal : null;
};

function App() {
  const { width } = useWindowDimensions();
  const isCompact = width < 900;
  const [market, setMarket] = useState(null);
  const [opinion, setOpinion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agentLoading, setAgentLoading] = useState(false);
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

  const openModal = useCallback((modal) => {
    setActiveModal(modal);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);

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

  const topStocks = market?.topStocks || [];
  const brokers = market?.brokers || [];
  const sourceMode = market?.sourceMode || "loading";
  const snapshot = market?.snapshot || {};

  const strongestStock = topStocks[0];

  return (
    <>
    <ScrollView style={styles.app} contentContainerStyle={styles.page}>
      <View style={[styles.shell, isCompact && styles.shellCompact]}>
        <View style={[styles.header, isCompact && styles.headerCompact]}>
          <View style={[styles.brandWrap, isCompact && styles.brandWrapCompact]}>
            <View style={styles.brandMark}>
              <BarChart3 size={24} color="#ffffff" />
            </View>
            <View style={styles.brandText}>
              <Text
                style={[styles.brandTitle, isCompact && styles.brandTitleCompact]}
                numberOfLines={1}
              >
                Pakistan Market Desk
              </Text>
              <Text
                style={[styles.brandSub, isCompact && styles.brandSubCompact]}
                numberOfLines={1}
              >
                Pakistan market research
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
            meta={strongestStock ? formatPercent(strongestStock.oneYear) : "-"}
            icon={TrendingUp}
          />
          <DeskActionCard
            icon={Bot}
            eyebrow="Analyst desk"
            title="Expert opinion"
            detail="Six months and one year view"
            onPress={() => openModal("expert")}
            prominent
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
                <Text style={styles.sourceText}>
                  {snapshot.asOf
                    ? `Latest PSX session: ${snapshot.asOf}`
                    : sourceMode === "live"
                      ? "Live adapter"
                      : "Demo fallback while Pakistan Stock Exchange is unavailable"}
                </Text>
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
                  />
                ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.disclosure}>
          <ShieldCheck size={18} color="#d5c5ff" />
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
    </>
  );
}

function DeskActionCard({ icon: Icon, eyebrow, title, detail, onPress, prominent }) {
  return (
    <Pressable
      style={[styles.deskActionCard, prominent && styles.deskActionCardProminent]}
      onPress={onPress}
    >
      <View style={styles.deskActionIcon}>
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
        <ChevronRight size={18} color="#d5c5ff" />
      </View>
    </Pressable>
  );
}

function ModalShell({ icon: Icon, eyebrow, title, children, onClose }) {
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
          showsVerticalScrollIndicator={false}
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
          <Icon size={18} color="#d5c5ff" />
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
        <Icon size={20} color="#d5c5ff" />
      </View>
    </View>
  );
}

function StockRow({ stock, rank, compact }) {
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

function ExpertPanel({ horizon, setHorizon, loading, opinion, onRun, embedded }) {
  return (
    <View style={[styles.expertPanel, embedded && styles.expertPanelEmbedded]}>
      {!embedded ? (
        <View style={styles.expertHeader}>
          <View style={styles.expertHeaderIcon}>
            <Bot size={18} color="#d5c5ff" />
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
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Sparkles size={19} color="#ffffff" />
        )}
        <Text style={styles.agentButtonText}>
          {loading ? "Analysing..." : "Run expert opinion"}
        </Text>
      </Pressable>

      {opinion ? (
        <View style={styles.opinionWrap}>
          {opinion.engine ? (
          <Text style={styles.engineLabel}>{opinion.engine}</Text>
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
      <Icon size={18} color="#f8fbff" />
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
    backgroundColor: "#130d2c",
    backgroundImage:
      "radial-gradient(circle at 78% 18%, rgba(119, 70, 210, 0.35), transparent 34%), radial-gradient(circle at 18% 10%, rgba(58, 88, 180, 0.28), transparent 34%), linear-gradient(160deg, #0d0b21 0%, #171033 45%, #2a1742 100%)",
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
    backgroundColor: "rgba(25, 18, 52, 0.76)",
    borderColor: "rgba(230, 219, 255, 0.13)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18,
    shadowColor: "#090615",
    shadowOpacity: 0.42,
    shadowRadius: 30,
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
    alignItems: "flex-start",
    width: "100%",
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: "#8a72ff",
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  brandTitle: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 28,
    fontWeight: "800",
  },
  brandTitleCompact: {
    fontSize: 24,
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  brandSub: {
    color: "#b8adc9",
    flexShrink: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    marginTop: 2,
    maxWidth: "100%",
  },
  brandSubCompact: {
    fontSize: 13,
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
    backgroundColor: "rgba(255, 255, 255, 0.075)",
    borderColor: "rgba(230, 219, 255, 0.16)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 78,
    minWidth: 0,
    padding: 12,
    shadowColor: "#090615",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  deskActionCardProminent: {
    backgroundColor: "rgba(28, 22, 58, 0.78)",
    borderColor: "rgba(230, 219, 255, 0.13)",
    minHeight: 132,
    padding: 16,
    shadowOpacity: 0.34,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  deskActionIcon: {
    alignItems: "center",
    backgroundColor: "#8a72ff",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  deskActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  deskActionEyebrow: {
    color: "#b8adc9",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "850",
    textTransform: "uppercase",
  },
  deskActionTitle: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 17,
    fontWeight: "850",
    marginTop: 2,
  },
  deskActionDetail: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  deskActionArrow: {
    alignItems: "center",
    backgroundColor: "rgba(213, 197, 255, 0.1)",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  pill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.12)",
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
    backgroundColor: "#8a72ff",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 13,
  },
  iconButtonText: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
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
    backgroundColor: "rgba(28, 22, 58, 0.78)",
    borderColor: "rgba(230, 219, 255, 0.13)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    minHeight: 132,
    padding: 16,
    shadowColor: "#090615",
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
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    flexShrink: 0,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  statLabel: {
    color: "#b8adc9",
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
    color: "#d5c5ff",
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
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  eyebrow: {
    color: "#b8adc9",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "850",
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: "#ffffff",
    flexShrink: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 22,
    fontWeight: "850",
    marginTop: 1,
  },
  sourceText: {
    color: "#b8adc9",
    flexShrink: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "750",
  },
  stockList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  stockCard: {
    alignItems: "stretch",
    backgroundColor: "rgba(28, 22, 58, 0.78)",
    borderColor: "rgba(230, 219, 255, 0.13)",
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
    shadowColor: "#090615",
    shadowOpacity: 0.34,
    shadowRadius: 24,
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
    fontWeight: "900",
  },
  companyName: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    marginTop: 3,
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "calc(50% - 4px)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  cardMetricLabel: {
    color: "#b8adc9",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "850",
    textTransform: "uppercase",
  },
  cardMetricValue: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
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
    backgroundColor: "rgba(64, 78, 130, 0.78)",
    borderColor: "rgba(191, 206, 255, 0.14)",
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
    color: "#aebadd",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "850",
    textTransform: "uppercase",
  },
  scoreText: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2,
  },
  cardFooter: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardFooterLabel: {
    color: "#b8adc9",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "850",
    textTransform: "uppercase",
  },
  cardFooterText: {
    color: "#f3f7ff",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 4,
  },
  expertPanel: {
    backgroundColor: "rgba(28, 22, 58, 0.78)",
    borderColor: "rgba(230, 219, 255, 0.13)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 16,
    padding: 16,
    shadowColor: "#090615",
    shadowOpacity: 0.34,
    shadowRadius: 24,
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
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  segmented: {
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 8,
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
    backgroundColor: "#ded2ff",
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
    color: "#1b1433",
  },
  agentButton: {
    alignItems: "center",
    backgroundColor: "#8a72ff",
    borderRadius: 8,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 48,
  },
  agentButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
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
    color: "#d5c5ff",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  opinionSummary: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
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
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(255, 255, 255, 0.1)",
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
    fontWeight: "900",
  },
  recoName: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  actionPill: {
    backgroundColor: "rgba(213, 197, 255, 0.12)",
    borderColor: "rgba(213, 197, 255, 0.2)",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  recoAction: {
    color: "#d5c5ff",
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
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 116,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  indicatorLabel: {
    color: "#aebadd",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "850",
    textTransform: "uppercase",
  },
  indicatorValue: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 3,
  },
  riskBox: {
    backgroundColor: "rgba(255, 255, 255, 0.055)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
  },
  riskLabel: {
    color: "#d5c5ff",
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: "900",
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
    backgroundColor: "rgba(28, 22, 58, 0.78)",
    borderColor: "rgba(230, 219, 255, 0.13)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  brokerRank: {
    alignItems: "center",
    backgroundColor: "rgba(213, 197, 255, 0.12)",
    borderRadius: 8,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  brokerRankText: {
    color: "#d5c5ff",
    fontSize: 13,
    fontWeight: "900",
  },
  brokerCopy: {
    flex: 1,
  },
  brokerName: {
    color: "#ffffff",
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: "850",
  },
  brokerMeta: {
    color: "#c6d0e5",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    marginTop: 3,
  },
  loadingBlock: {
    alignItems: "center",
    backgroundColor: "rgba(42, 54, 98, 0.92)",
    borderColor: "rgba(188, 204, 249, 0.16)",
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
    backgroundColor: "#fff8ed",
    borderColor: "#efd8b7",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  noticeTitle: {
    color: "#8a4b16",
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: "900",
  },
  noticeBody: {
    color: "#8a4b16",
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  disclosure: {
    alignItems: "center",
    backgroundColor: "rgba(28, 22, 58, 0.72)",
    borderColor: "rgba(230, 219, 255, 0.13)",
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
    backgroundColor: "rgba(7, 5, 18, 0.56)",
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
    backgroundColor: "rgba(25, 18, 52, 0.96)",
    borderColor: "rgba(230, 219, 255, 0.18)",
    borderRadius: 8,
    borderWidth: 1,
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
    borderBottomColor: "rgba(230, 219, 255, 0.12)",
    borderBottomWidth: 1,
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
  modalIcon: {
    alignItems: "center",
    backgroundColor: "#8a72ff",
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 8,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  modalScroll: {
    maxHeight: "calc(88vh - 74px)",
  },
  modalBody: {
    gap: 14,
    padding: 16,
  },
});

export default App;
