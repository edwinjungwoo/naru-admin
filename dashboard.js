// 집계를 읽어 주는 유일한 통로. 비밀번호 확인도 이 함수 안(서버)에서 한다 —
// 이 파일은 공개돼 있어서 여기 둔 검사는 소스로 다 보이고 아무것도 막지 못한다.
// 그래서 페이지에는 비밀이 없고, 주소만 있다.
const FUNCTION_URL = "https://ebbuloiyjemmyhxazmxh.supabase.co/functions/v1/admin-dashboard";
const $ = (id) => document.getElementById(id);
const KOREAN_STEP_NAMES = {
  // 흔적 기반 이정표(analytics.milestone_funnel)
  signed_up: "가입", profile_created: "프로필 생성", partner_connected: "파트너 연결",
  first_event: "첫 일정", push_enabled: "알림 허용", first_note: "첫 쪽지", first_idea: "첫 버킷",
  // 앱 계측 단계(analytics.funnel_overall)
  onboarding_started: "온보딩 시작", timezone_confirmed: "시간대 확인",
  partner_setup_started: "파트너 설정 시작", partner_invite_sent: "초대 발송",
  dual_timezone_event_viewed: "두 시간대 일정 확인 ①", notification_value_screen_viewed: "알림 안내 화면 조회",
  notification_permission_requested: "알림 권한 요청", notification_permission_granted: "알림 허용",
  notification_permission_denied: "알림 거부", notification_ask_deferred: "알림 요청 보류",
  first_notification_configured: "첫 알림 설정 ②",
  calendar_permission_requested: "캘린더 권한 요청", calendar_permission_granted: "캘린더 허용",
  calendar_permission_denied: "캘린더 거부", onboarding_completed: "커플 연결",
  home_viewed_after_onboarding: "홈 도달", first_note_created: "첫 쪽지", first_idea_saved: "첫 버킷",
  paywall_viewed: "페이월 조회", trial_ended_paywall_viewed: "체험 종료 페이월 조회",
  paywall_tier_selected: "요금제 선택", purchase_started: "결제 시작",
  purchase_succeeded: "결제 성공", purchase_cancelled: "결제 취소", purchase_failed: "결제 실패",
  trial_ended_paywall_continued_free: "체험 종료 → 무료로 계속", trial_ended_paywall_left_app: "체험 종료 페이월에서 앱 떠남",
  paywall_products_unavailable: "상품 못 불러옴",
  // funnel_steps 밖의 이벤트(event_counts_14d로만 온다)
  partner_invite_share_completed: "초대 공유 완료", partner_invite_share_cancelled: "초대 공유 취소",
  accept_invite_sheet_opened: "초대 코드 입력 화면 진입",
  invitee_entry_chosen: "첫 화면 '코드 받았어요'", invitee_paste_card_shown: "붙여넣기 카드 봄",
  invitee_code_pasted: "코드 붙여넣음", invitee_switched_to_inviter: "받는 화면 → 내가 초대",
  widget_nudge_viewed: "위젯 안내 노출", widget_nudge_opened: "위젯 안내 열람", widget_nudge_dismissed: "위젯 안내 닫음",
};

// 화면이 켜져 있는 동안 OS가 라이트/다크를 바꾸면 CSS 변수는 즉시 따라가지만,
// 리텐션 히트맵의 글자색은 렌더 시점에 JS로 미리 계산해 둔 값이라 따라가지 않는다.
// 마지막 스냅샷을 들고 있다가 그 순간에만 다시 그린다.
let lastData = null;
const darkMode = window.matchMedia("(prefers-color-scheme: dark)");
darkMode.addEventListener("change", () => { if (lastData) renderRetention(lastData.retention_weekly); });

function show(section) {
  $("login").style.display = section === "login" ? "block" : "none";
  $("dashboard").style.display = section === "dashboard" ? "block" : "none";
}

// 탭은 URL 해시가 원본이다 — 새로고침·뒤로가기에도 보던 탭이 유지된다.
const TABS = ["summary", "couples", "usage", "trends", "revenue", "ops"];
function selectTab(name) {
  const tab = TABS.includes(name) ? name : "summary";
  for (const t of TABS) {
    document.querySelector(`.tab[data-tab="${t}"]`).setAttribute("aria-selected", String(t === tab));
    document.getElementById(`panel-${t}`).hidden = t !== tab;
  }
  if (location.hash !== `#${tab}`) history.replaceState(null, "", `#${tab}`);
}
document.querySelectorAll(".tab").forEach((b) => b.onclick = () => selectTab(b.dataset.tab));
window.addEventListener("hashchange", () => selectTab(location.hash.slice(1)));

const SECTION_IDS = ["attention", "summary-tiles", "summary-spark",
  "couple-needs", "couple-widgets", "couple-table", "unpaired", "countries",
  "usage-home", "usage-calendar", "usage-notes", "usage-bucket", "usage-widgets", "usage-hours", "signups", "signups-country", "deletions", "dau", "feature-usage",
  "retention", "survival", "activation", "milestones", "funnel", "nudges",
  "payment-detail", "membership-dist", "membership-table", "paywall",
  "pipeline-detail", "cron", "http", "gcal", "push", "holidays", "storage", "versions", "feedback",
  "eco-journey", "eco-matrix", "eco-pulse", "eco-features",
  "revenue-summary", "revenue-weekly", "revenue-breakdown", "revenue-list"];

function showSkeletons() {
  for (const id of SECTION_IDS) {
    const el = $(id);
    if (el && !el.innerHTML.trim()) el.innerHTML = `<div class="skeleton"></div>`;
  }
}

const fmtInt = (v) => Number(v ?? 0).toLocaleString("ko-KR");
// 상대 시간이 판단이고 절대 시각은 근거다 — 앞은 텍스트로, 뒤는 title로.
function relTime(iso) {
  if (!iso) return "기록 없음";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}
// 몇 분·몇 시간 단위가 판단인 곳(cron·동기화)용. 날짜 단위로 뭉개면 "오늘"이 6시간 전과 5분 전을 가린다.
function relTimeFine(iso) {
  if (!iso) return "기록 없음";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}
const fmtBytes = (n) => {
  const v = Number(n ?? 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}GB`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}MB`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}KB`;
  return `${v}B`;
};
const countryName = (() => {
  let names = null;
  try { names = new Intl.DisplayNames(["ko"], { type: "region" }); } catch { /* 구형 브라우저 */ }
  return (code) => { try { return names?.of(code) ?? code; } catch { return code; } };
})();
// 한 줄짜리 상태 행. 모든 운영 카드가 같은 모양이어야 훑어볼 때 눈이 안 흔들린다.
const statusRow = (label, value, level) =>
  `<div class="status-row"><span>${level ? `<span class="dot ${level}"></span>` : ""}${label}</span>` +
  `<span class="muted">${value}</span></div>`;
// 옛 함수가 아직 배포된 창: 그 섹션만 정직하게 비우고 나머지는 그린다.
function missingKey(el) {
  el.innerHTML = `<div class="empty">서버 집계가 아직 배포되지 않았습니다(migration 필요).</div>`;
}
// 닉네임은 사용자 입력이다 — 삽입 전 반드시 이스케이프한다.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 새로고침 때마다 다시 치지 않게 탭 세션에만 둔다 — 탭을 닫으면 사라지므로
// 남의 기기에서 잠깐 열어봐도 비밀번호가 남지 않는다.
const PASSWORD_KEY = "naru.admin.password";
let password = sessionStorage.getItem(PASSWORD_KEY) ?? "";

async function init() {
  if (password) { show("dashboard"); showSkeletons(); await load(); } else { show("login"); }
  selectTab(location.hash.slice(1));
}

$("enter").onclick = enter;
// 비밀번호 한 칸짜리 폼에서 엔터가 안 먹으면 폰에서 특히 답답하다.
$("password").onkeydown = (event) => { if (event.key === "Enter") enter(); };
async function enter() {
  $("login-error").textContent = "";
  const value = $("password").value.trim();
  if (!value) { $("login-error").textContent = "비밀번호를 입력하세요."; return; }
  const btn = $("enter");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "확인 중…";
  password = value;
  const ok = await load({ fromLogin: true });
  btn.disabled = false;
  btn.textContent = originalLabel;
  if (!ok) { password = ""; return; }
  sessionStorage.setItem(PASSWORD_KEY, value);
  $("password").value = "";
  show("dashboard");
}

$("signout").onclick = () => {
  password = "";
  sessionStorage.removeItem(PASSWORD_KEY);
  lastData = null;
  ecoFilter = null; needFilter = null; openCouple = null;
  show("login");
};
$("reload").onclick = () => load();

async function load(options = {}) {
  const fromLogin = options.fromLogin === true;
  // 로그인 화면에서 부를 땐 대시보드가 아직 안 보이므로 그쪽에 쓰면 아무도 못 본다.
  const fail = (message) => {
    if (fromLogin) $("login-error").textContent = message;
    else $("generated-at").textContent = message;
    // 실패해도 스켈레톤은 그대로 반짝이며 남는다 — 응답이 없으니 실패 상태로 바꿔 준다.
    for (const id of SECTION_IDS) {
      const el = $(id);
      if (el && el.innerHTML.includes('class="skeleton"')) {
        el.innerHTML = `<div class="empty">데이터를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.</div>`;
      }
    }
    return false;
  };
  showSkeletons();
  if (!fromLogin) $("generated-at").textContent = "불러오는 중…";

  let response;
  try {
    response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch {
    return fail("서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.");
  }

  if (response.status === 401) {
    if (fromLogin) return fail("비밀번호가 올바르지 않습니다.");
    // 저장해 둔 비밀번호가 그새 바뀐 경우다. 들고 있어봐야 계속 튕기니 버린다.
    password = "";
    sessionStorage.removeItem(PASSWORD_KEY);
    show("login");
    $("login-error").textContent = "비밀번호가 변경되었습니다. 다시 입력하세요.";
    return false;
  }
  if (!response.ok) {
    return fail("불러오기 실패 (" + response.status + ") · 새로고침 후 다시 시도하세요.");
  }

  const data = await response.json();
  lastData = data;
  // 개요에서 고른 커플은 그때 스냅샷의 판정이다 — 새 데이터에 옛 라벨을 붙여 두지 않는다.
  ecoFilter = null;
  $("generated-at").textContent = "데이터 기준 " + new Date(data.generated_at).toLocaleString("ko-KR");
  renderSummary(data);
  renderAttention(data);
  renderPipeline(data.pipeline_health);
  renderPayment(data.payment_health, data.ops_health);
  renderOps(data);
  renderSignups(data.signups_daily);
  renderSignupsByCountry(data.signups_by_country_daily);
  renderDeletions(data.deletions_recent);
  renderCountries(data.users_by_country);
  renderNudges(data.event_counts_14d);
  renderCouples(data);
  renderEcosystem(data);
  renderUsage(data);
  renderRevenue(data);
  renderRevenueAmounts(data);
  renderDau(data.actives_daily);
  renderFeatureUsage(data.feature_usage_weekly);
  renderFunnel($("milestones"), orderMilestones(data.milestone_funnel ?? []));
  renderFunnel($("funnel"), data.funnel_overall);
  renderRetention(data.retention_weekly);
  renderSurvival(data.connection_survival_weekly);
  renderActivation(data.activation_weekly);
  renderFunnel($("paywall"), data.paywall_funnel);
  // 로그인 화면이 이 값을 보고 대시보드로 넘어간다 — 빠뜨리면 조용히 실패로 읽힌다.
  return true;
}

// 색 대비를 배경 밝기에 맞춰 고른다: 칠이 옅으면 잉크색, 진해지면 반전색.
// (dataviz 원칙 — 칠 안 라벨은 칠의 밝기로 흰/잉크를 고른다. 라이트 모드에서
// tide 100% 위 잉크는 4.3:1로 겨우 턱걸이, 다크 모드는 1.9:1까지 떨어져
// 실패한다 — 옅은 칸과 진한 칸이 섞여 나오므로 두 후보 색 중 대비가 높은
// 쪽을 고른다.)
function readCssColor(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  const hex = m[1];
  return {
    r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16),
  };
}
function relLuminance({ r, g, b }) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function mixToward(fg, bg, pct) {
  const p = pct / 100;
  return {
    r: fg.r * p + bg.r * (1 - p), g: fg.g * p + bg.g * (1 - p), b: fg.b * p + bg.b * (1 - p),
  };
}
function contrastRatio(l1, l2) {
  const a = Math.max(l1, l2) + 0.05, b = Math.min(l1, l2) + 0.05;
  return a / b;
}
function textColorForFill(pct) {
  const tide = readCssColor("--tide");
  const surface = readCssColor("--surface");
  const ink = readCssColor("--ink");
  const inkInvert = readCssColor("--ink-invert");
  const bgLum = relLuminance(mixToward(tide, surface, pct));
  const withInk = contrastRatio(bgLum, relLuminance(ink));
  const withInvert = contrastRatio(bgLum, relLuminance(inkInvert));
  return withInk >= withInvert ? "var(--ink)" : "var(--ink-invert)";
}

// 시리즈 색은 팔레트 토큰만 — 다크 모드가 공짜로 따라온다.
const FEATURE_SERIES = [
  ["events", "일정", "var(--sunset)"],
  ["wall_notes", "쪽지", "var(--tide)"],
  ["wall_note_replies", "답장", "var(--deep-water)"],
  ["meet_ideas", "버킷", "var(--series-idea)"],
  ["widget_taps", "위젯 탭", "var(--secondary-ink)"],
];

function renderFeatureUsage(rows) {
  if (!rows) { missingKey($("feature-usage")); return; }
  if (!rows.length) { $("feature-usage").innerHTML = `<div class="empty">데이터가 없습니다</div>`; return; }
  const weeks = [...new Set(rows.map((r) => r.week))].sort();
  const byKey = Object.fromEntries(rows.map((r) => [`${r.feature}|${r.week}`, Number(r.cnt)]));
  const series = FEATURE_SERIES.map(([key, label, color]) =>
    ({ key, label, color, values: weeks.map((w) => byKey[`${key}|${w}`] ?? 0) }));
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const w = 640, h = 240, padL = 34, padR = 8, padT = 12, padB = 46;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const x = (i) => padL + i * plotW / Math.max(weeks.length - 1, 1);
  const y = (v) => padT + plotH - v * plotH / max;
  const paths = series.map((s) =>
    `<path d="${s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"
       fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`).join("");
  const grid = [...new Set([0, Math.round(max / 2), max])].map((v) => `
    <line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${w - padR}" y2="${y(v).toFixed(1)}" stroke="var(--line)"/>
    <text x="${padL - 8}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle"
          fill="var(--secondary-ink)" font-size="11">${v}</text>`).join("");
  const fmtW = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  const tickIdx = [...new Set([0, Math.floor((weeks.length - 1) / 2), weeks.length - 1])];
  const xLabels = tickIdx.map((i) => `
    <text x="${x(i).toFixed(1)}" y="${h - 30}" text-anchor="middle" fill="var(--secondary-ink)" font-size="11">${fmtW(weeks[i])}</text>`).join("");
  // 범례는 차트 아래 한 줄 — 5개면 옆 라벨은 겹친다.
  const legend = series.map((s) =>
    `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px">
       <span style="width:14px;height:3px;background:${s.color};border-radius:2px"></span>
       <span class="muted" style="font-size:12px">${s.label}</span></span>`).join("");
  $("feature-usage").innerHTML = `
    <svg viewBox="0 0 ${w} ${h - 20}" style="width:100%;height:auto;display:block" role="img"
         aria-label="기능별 주간 생성 수, 최근 ${weeks.length}주">${grid}${paths}${xLabels}</svg>
    <div style="margin-top:8px">${legend}</div>`;
}

// 앱이 보내는 계측만 신선도로 판정한다. 결제 원천은 결제가 없는 날이 정상이라, 같은 기준을
// 대면 "도착한 적 없음 — 새 빌드가 배포돼야"라는 틀린 경보가 된다(평생권 실구매 0건일 때 실제로 떴다).
const PIPELINE_NAMES = {
  user_active_days: "일간 접속 기록", onboarding_events: "온보딩 이벤트",
  widget_installs: "위젯 설치 기록", widget_taps: "위젯 탭 기록",
};
const PAYMENT_SOURCE_NAMES = {
  subscriber_memberships: "구독 기록", lifetime_grants_purchased: "평생 이용권 구매",
};
const STALE_DAYS = 3;
// 표시용 일수(relTime)는 내림이라 3.x일이 "3일 전"으로 보인다 — 그 값으로 임계를
// 판정하면 실제 4일째까지 조용하다. 판정은 ms로, 표시만 날짜로 따로 한다.
const pipelineStale = (r) =>
  (r.last_arrival ? Date.now() - new Date(r.last_arrival).getTime() : Infinity) > STALE_DAYS * 86400000;
const instrumentationRows = (rows) => (rows ?? []).filter((r) => r.source in PIPELINE_NAMES);

function renderPipeline(rows) {
  if (!rows) { missingKey($("pipeline-detail")); return; }
  $("pipeline-detail").innerHTML = instrumentationRows(rows).map((r) =>
    statusRow(PIPELINE_NAMES[r.source], `<span title="${r.last_arrival ?? ""}">최근 수신 ${relTime(r.last_arrival)}</span> · 14일 ${fmtInt(r.recent_rows)}건`,
      pipelineStale(r) ? "stale" : "ok")).join("");
}

// 결제가 새는지. 두 달간 0건이던 걸 아무도 못 알아챈 이유가 "뷰는 있는데 화면이
// 없어서"였다 — 새면 요약의 "확인할 것" 맨 위에 뜬다.
const PAYMENT_LABELS = [
  ["paywall_viewed", "페이월 조회"],
  ["purchase_started", "결제 시작"],
  ["purchase_succeeded", "결제 성공 (앱 보고)"],
  ["purchase_failed", "결제 실패"],
  ["subscriptions_recorded", "구독 서버 기록"],
  ["lifetime_recorded", "평생 이용권 서버 기록"],
  // 심사·TestFlight 구매다. 위 기록 수에 포함돼 있으니 실매출을 볼 땐 이만큼 뺀다.
  ["sandbox_recorded", "그중 샌드박스"],
];

function renderPayment(h, ops) {
  // 뷰가 한 행을 내므로 객체다. 키가 없으면 migration이 아직이다.
  if (!h || h.status === undefined) { missingKey($("payment-detail")); return; }
  const dot = h.status === "LEAKING" ? "stale" : "ok";
  const headline = h.status === "LEAKING" ? "결제 누락 발생"
    : h.status === "no_purchases" ? "최근 30일 결제 성공 없음 (앱 보고 기준)"
    : "정상 — 성공한 결제가 모두 서버에 기록됨";
  // 샌드박스 기록이 성공 이벤트보다 많으면 음수가 된다 — "미기록"은 0 밑으로 내려가지 않는다.
  const unrecorded = Math.max(Number(h.unrecorded ?? 0), 0);
  const sources = (ops?.payment_sources ?? []).map((r) =>
    statusRow(PAYMENT_SOURCE_NAMES[r.source] ?? r.source,
      `<span title="${r.last_arrival ?? ""}">최근 수신 ${relTime(r.last_arrival)}</span> · 14일 ${fmtInt(r.recent_rows)}건`)).join("");
  $("payment-detail").innerHTML =
    statusRow(`<b>${headline}</b>`, `서버 미기록 ${fmtInt(unrecorded)}건`, dot) +
    PAYMENT_LABELS.map(([k, name]) => statusRow(name, fmtInt(h[k]))).join("") + sources;
}

// cron 식에서 "원래 몇 분마다 도는지"만 뽑는다. 이 페이지가 쓰는 세 모양(*/N분, M */H시, M H 매일)
// 밖이면 null — 모르는 주기로 늦음을 판정하느니 판정하지 않는다.
function cronIntervalMinutes(schedule) {
  const [min, hour, dom, mon, dow] = String(schedule).trim().split(/\s+/);
  if (dom !== "*" || mon !== "*" || dow !== "*") return null;
  const everyMin = /^\*\/(\d+)$/.exec(min);
  if (everyMin && hour === "*") return Number(everyMin[1]);
  const everyHour = /^\*\/(\d+)$/.exec(hour);
  if (/^\d+$/.test(min) && everyHour) return Number(everyHour[1]) * 60;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) return 1440;
  return null;
}
// 주기의 두 배 + 10분을 넘기면 한 번 이상 건너뛴 것이다.
function cronLate(job) {
  if (!job.active) return false;
  const every = cronIntervalMinutes(job.schedule);
  if (!every) return false;
  // 기록이 없는 건 지연과 구분되지 않는다 — cron을 다시 등록하면(0140) ID가 바뀌어 첫 실행 전까지
  // 기록이 비어 보인다. 지연은 기록이 있는데 멈춘 경우만 센다.
  if (!job.last_run) return false;
  return Date.now() - new Date(job.last_run).getTime() > (every * 2 + 10) * 60000;
}
const CRON_NAMES = {
  "send-upcoming-event-push": "상대 일정 30분 전 알림",
  "send-invite-reminder-push": "초대 코드 만료 알림",
  "renew-naru-google-calendar-watches": "Google 캘린더 변경 알림 갱신",
  "send-trial-ending-push": "체험 종료 전날 알림",
  "send-trial-ended-dormant-push": "체험 종료 후 휴면 알림",
  "sync-naru-holidays": "공휴일 동기화",
  "account-migration-ticket-cleanup": "계정 이전 티켓 정리",
  "purge-stale-testflight-applications": "TestFlight 신청 정리",
  "cron-run-log-cleanup": "cron 로그 정리",
  "hme-auto-recovery": "HME 계정 자동 복구",
};

// 결정은 여기 한 곳에서 한다 — 카드마다 경고를 따로 띄우면 어디가 급한지 순서가 사라진다.
// bad: 지금 사용자·돈이 새는 중. warn: 며칠 안에 봐야 함. info: 알아두면 좋음.
function buildAttention(data) {
  const items = [];
  const add = (level, title, detail, tab) => items.push({ level, title, detail, tab });
  const ops = data.ops_health;

  // 연결 직후 이탈은 가장 큰 구멍이었다(2026-10 대만 유입 분석). 판정 가능한 가장 최근 주가
  // 다섯 쌍 이상이고 40% 넘게 이틀 안에 떠났으면 올린다.
  const surv = [...(data.connection_survival_weekly ?? [])]
    .filter((r) => Number(r.judged_2d) >= 5).sort((a, b) => b.cohort_week.localeCompare(a.cohort_week))[0];
  if (surv && Number(surv.gone_2d) / Number(surv.judged_2d) >= 0.4) {
    add("warn", `${surv.cohort_week} 주차 연결 커플 2일 내 이탈률 ${Math.round(100 * surv.gone_2d / surv.judged_2d)}%`,
      `${fmtInt(surv.gone_2d)}/${fmtInt(surv.judged_2d)}쌍 — 성장 탭 '연결 후 잔존'에서 주차별 추이를 확인하세요.`, "trends");
  }

  const pay = data.payment_health;
  if (pay?.status === "LEAKING") {
    add("bad", `결제 ${fmtInt(pay.unrecorded)}건 서버 미기록`,
      `앱 보고 결제 성공 ${fmtInt(pay.purchase_succeeded)}건 대비 서버 권한 기록 ` +
      `${fmtInt(Number(pay.subscriptions_recorded) + Number(pay.lifetime_recorded))}건 — verify-plus-purchase 로그를 확인하세요.`, "revenue");
  }
  // 매출 기록은 구매 확인·웹훅의 응답을 막지 않으려고 실패를 로그로만 남긴다(0148) — 새는지는 여기서만 보인다.
  const txMissing = data.store_transactions_missing;
  const txMissingN = Number(txMissing?.subscriptions ?? 0) + Number(txMissing?.lifetime ?? 0);
  if (txMissingN) {
    add("warn", `매출 기록에 없는 거래 ${fmtInt(txMissingN)}건`,
      `구독 ${fmtInt(txMissing.subscriptions)} · 평생 이용권 ${fmtInt(txMissing.lifetime)} — 권한 기록에는 있는데 store_transactions에 없습니다. ` +
      `scripts/RESTORE.md의 매출 기록 백필로 채우세요.`, "revenue");
  }
  const stale = instrumentationRows(data.pipeline_health).filter(pipelineStale);
  if (stale.length) {
    add("bad", `데이터 수집 ${stale.length}개 중단`,
      stale.map((r) => `${PIPELINE_NAMES[r.source]}: ${r.last_arrival ? `마지막 수신 ${relTime(r.last_arrival)}` : "수신 기록 없음"}`).join(" · ") +
      " — 최근 빌드의 수집 호출(RLS·upsert)을 점검하세요.", "ops");
  }
  if (ops) {
    const failing = ops.cron.filter((j) => j.active && Number(j.failures_24h) > 0);
    const late = ops.cron.filter(cronLate);
    if (failing.length) {
      add("bad", `예약 작업 ${failing.length}개 실패 (24시간)`,
        failing.map((j) => `${CRON_NAMES[j.jobname] ?? j.jobname} ${fmtInt(j.failures_24h)}회`).join(" · "), "ops");
    }
    if (late.length) {
      add("bad", `예약 작업 ${late.length}개 지연`,
        late.map((j) => `${CRON_NAMES[j.jobname] ?? j.jobname}: 최근 실행 ${relTimeFine(j.last_run)}`).join(" · "), "ops");
    }
    if (Number(ops.http?.failed) > 0) {
      add("warn", `엣지 함수 오류 응답 ${fmtInt(ops.http.failed)}건 (최근 6시간)`,
        "시크릿 불일치(401) 또는 함수 오류일 수 있습니다 — net._http_response의 응답 본문을 확인하세요.", "ops");
    }
    const g = ops.google_calendar;
    if (g && (Number(g.reauth_failing) > 0 || Number(g.with_error) > 0)) {
      add("warn", "Google 캘린더 동기화 오류",
        `재인증 실패 ${fmtInt(g.reauth_failing)}명 · 오류 기록 연결 ${fmtInt(g.with_error)}건`, "ops");
    }
    if (g && Number(g.stale_2d_members) > 0) {
      add("warn", `멤버십 활성 커플 Google 동기화 2일 이상 중단 ${fmtInt(g.stale_2d_members)}건`,
        "6시간 주기 변경 알림 갱신 작업의 결과를 시스템 탭 '엣지 함수 응답'에서 확인하세요.", "ops");
    }
    const DB_LIMIT = 500e6;
    if (Number(ops.db_size_bytes) > DB_LIMIT * 0.7) {
      add("warn", `DB 용량 ${fmtBytes(ops.db_size_bytes)} — Free 한도(500MB)의 70% 초과`,
        "cron.job_run_details·net._http_response 등 자동 정리되지 않는 테이블부터 확인하세요.", "ops");
    }
  }
  const uncovered = data.uncovered_holiday_countries ?? [];
  if (uncovered.length) {
    const users = uncovered.reduce((s, r) => s + Number(r.users), 0);
    add("warn", `공휴일 미지원 국가 사용자 ${fmtInt(users)}명`,
      uncovered.map((r) => `${countryName(r.country_code)}(${r.country_code}) ${r.users}명`).join(" · ") +
      " — sync-holidays의 CALENDAR_SLUGS에 국가를 추가하세요.", "ops");
  }
  const days = data.signups_daily ?? [];
  if (days.length) {
    // 개요 '탈퇴' 칸과 같은 창(어제까지 7일)이다 — 같은 화면에서 두 숫자가 다르면 안 된다.
    const W = weekWindows();
    const total = (k, win) => days.filter((r) => inWindow(r.day, win)).reduce((s, r) => s + Number(r[k]), 0);
    const signups = total("signups", W.cur), deletions = total("deletions", W.cur);
    const before = total("deletions", W.prev);
    // 소수일 땐 비율이 요동친다 — 절대 수도 같이 넘어야 신호로 본다. 가입 대비 비율과
    // 직전 주 대비 급증, 둘 중 하나면 본다(가입이 같이 몰리면 비율만으론 묻힌다).
    if (deletions >= 5 && (deletions >= signups * 0.1 || deletions >= before * 3)) {
      add("warn", `탈퇴 ${fmtInt(deletions)}명 — 어제까지 7일 (직전 7일 ${fmtInt(before)}명 · 같은 기간 가입 대비 ${Math.round(100 * deletions / Math.max(signups, 1))}%)`,
        "성장 탭 '탈퇴 분석'에서 가입 후 탈퇴까지 걸린 시간과 마지막 도달 단계를 확인하세요.", "trends");
    }
  }
  const fresh = (data.feedback_recent ?? []).filter((f) =>
    Date.now() - new Date(f.created_at).getTime() < 7 * 86400000);
  if (fresh.length) add("info", `신규 피드백 ${fresh.length}건 (최근 7일)`, esc(String(fresh[0].message).slice(0, 80)), "ops");

  // 체험 종료 예정은 할 일이 아니라 현황이라 개요 '유료 커플' 칸으로 옮겼다.
  const order = { bad: 0, warn: 1, info: 2 };
  return items.sort((a, b) => order[a.level] - order[b.level]);
}

function renderAttention(data) {
  const items = buildAttention(data);
  // 운영 탭 배지는 운영 탭에서 풀 일만 센다 — 다른 탭 경고까지 세면 들어가도 못 찾는다.
  const urgent = items.filter((i) => i.level !== "info" && i.tab === "ops").length;
  const badge = $("ops-count");
  badge.hidden = !urgent;
  badge.textContent = urgent ? String(urgent) : "";
  $("attention").innerHTML = items.length
    ? items.map((i) => `<a class="attention ${i.level}" href="#${i.tab}">
        <span class="dot ${i.level}"></span>
        <span><b>${i.title}</b><span class="muted">${i.detail}</span></span></a>`).join("")
    : statusRow("<b>모두 정상</b> — 결제·데이터 수집·예약 작업·동기화에 이상이 없습니다", "", "ok");
}

function renderOps(data) {
  const ops = data.ops_health;
  const opsIds = ["cron", "http", "gcal", "push", "storage"];
  if (!ops) { opsIds.forEach((id) => missingKey($(id))); }
  else {
    $("cron").innerHTML = ops.cron.map((j) => {
      const level = !j.active || !j.last_run ? "" : (Number(j.failures_24h) > 0 || cronLate(j)) ? "stale" : "ok";
      const state = !j.active ? "비활성"
        : `최근 실행 <span title="${j.last_run ?? ""}">${relTimeFine(j.last_run)}</span> · 24시간 ${fmtInt(j.runs_24h)}회` +
          (Number(j.failures_24h) ? ` · <b class="bad-text">실패 ${fmtInt(j.failures_24h)}</b>` : "");
      return statusRow(`${CRON_NAMES[j.jobname] ?? esc(j.jobname)} <span class="muted mono">${esc(j.schedule)}</span>`, state, level);
    }).join("");

    const h = ops.http ?? {};
    $("http").innerHTML =
      statusRow("정상 응답 (2xx)", fmtInt(h.ok), "ok") +
      statusRow("오류 응답 (3xx 이상)", fmtInt(h.failed), Number(h.failed) ? "stale" : "ok") +
      statusRow("응답 없음 (타임아웃)", fmtInt(h.timeouts), Number(h.timeouts) ? "warn" : "ok") +
      (h.last_failure ? statusRow("최근 이상 발생", `<span title="${h.last_failure}">${relTimeFine(h.last_failure)}</span>`) : "") +
      `<div class="muted hint">타임아웃은 pg_net이 응답 대기를 중단한 것으로, 함수는 정상 완료됐을 수 있습니다. 다만 결과 코드(401 등)는 확인할 수 없습니다.</div>`;

    const g = ops.google_calendar ?? {};
    // 연동은 멤버십 기능이라 체험이 끝난 커플은 동기화가 멈추는 게 정상이다. 0140부터 멤버십
    // 있는 연결만 센 값이 오므로 경보는 그걸로 판정하고, 나머지는 설명으로 내린다.
    const split = g.members != null;
    const stopped = Number(g.connections) - Number(g.members);
    $("gcal").innerHTML =
      statusRow("연동 사용자", split
        ? `${fmtInt(g.connections)} <span class="muted">· 멤버십 활성 ${fmtInt(g.members)}</span>` : fmtInt(g.connections)) +
      statusRow("최근 동기화", `<span title="${g.last_sync ?? ""}">${relTimeFine(g.last_sync)}</span>`) +
      statusRow("재인증 실패", fmtInt(g.reauth_failing), Number(g.reauth_failing) ? "warn" : "ok") +
      statusRow("오류 기록 연결", fmtInt(g.with_error), Number(g.with_error) ? "warn" : "ok") +
      (split
        ? statusRow("멤버십 활성 · 2일 이상 미동기화", fmtInt(g.stale_2d_members), Number(g.stale_2d_members) ? "warn" : "ok") +
          statusRow("변경 알림 채널 (watch)", `${fmtInt(g.watches)}개 · 멤버십 활성 중 만료 ${fmtInt(g.watches_expired_members)}개`,
            Number(g.watches_expired_members) ? "warn" : "ok") +
          (stopped > 0 ? `<div class="muted hint">멤버십이 종료된 ${fmtInt(stopped)}명은 동기화 중단이 정상입니다(캘린더 연동은 멤버십 기능). 결제 시 다음 주기부터 재개됩니다.</div>` : "")
        : statusRow("2일 이상 미동기화", fmtInt(g.stale_2d)) +
          statusRow("변경 알림 채널 (watch)", `${fmtInt(g.watches)}개 · 만료 ${fmtInt(g.watches_expired)}개`,
            Number(g.watches_expired) ? "warn" : "ok"));

    const p = ops.push ?? {};
    $("push").innerHTML =
      statusRow("프로덕션 토큰", `${fmtInt(p.production_tokens)}개 · ${fmtInt(p.production_users)}명`) +
      statusRow("샌드박스 토큰(개발·TestFlight 빌드)", fmtInt(p.sandbox_tokens)) +
      statusRow("최근 등록", `<span title="${p.last_registered ?? ""}">${relTimeFine(p.last_registered)}</span>`);

    // Free 플랜 기준(0110). 플랜을 올리면 이 두 숫자만 바꾼다.
    const DB_LIMIT = 500e6, STORAGE_LIMIT = 1e9;
    const storageBytes = (ops.storage ?? []).reduce((s, b) => s + Number(b.bytes), 0);
    const meter = (label, used, limit) => {
      const pct = Math.min(100, 100 * used / limit);
      return `<div class="bar-row" tabindex="0" aria-label="${label}: ${fmtBytes(used)} / ${fmtBytes(limit)}">
        <span>${label}</span>
        <div class="bar-track"><div class="bar-fill${pct > 70 ? " hot" : ""}" style="width:${pct.toFixed(1)}%"></div></div>
        <span class="muted">${fmtBytes(used)} · ${pct.toFixed(0)}%</span></div>`;
    };
    $("storage").innerHTML = meter("DB (한도 500MB)", Number(ops.db_size_bytes), DB_LIMIT) +
      meter("Storage (한도 1GB)", storageBytes, STORAGE_LIMIT) +
      (ops.storage ?? []).map((b) => statusRow(`<span class="mono">${esc(b.bucket)}</span>`,
        `${fmtInt(b.objects)}개 · ${fmtBytes(b.bytes)}`)).join("");
  }

  const uncovered = data.uncovered_holiday_countries;
  if (!uncovered) missingKey($("holidays"));
  else {
    $("holidays").innerHTML = uncovered.length
      ? statusRow("<b>공휴일 데이터가 없는 국가</b>", "sync-holidays CALENDAR_SLUGS 추가 필요", "warn") +
        uncovered.map((r) => statusRow(`${countryName(r.country_code)} <span class="muted">${esc(r.country_code)}</span>`,
          `${fmtInt(r.users)}명 · 연결 ${fmtInt(r.paired_users)}명`)).join("")
      : statusRow("모든 사용자 국가의 공휴일 데이터가 있습니다", "", "ok");
  }

  const versions = data.app_versions;
  if (!versions) missingKey($("versions"));
  else if (!versions.length) $("versions").innerHTML = `<div class="empty">최근 14일 신규 온보딩 없음</div>`;
  else {
    // 버전 문자열 정렬 — "1.0.10"이 "1.0.9" 뒤로 가야 한다.
    const cmp = (a, b) => b.app_version.localeCompare(a.app_version, undefined, { numeric: true });
    const sorted = [...versions].sort(cmp);
    const max = Math.max(...sorted.map((v) => Number(v.users)), 1);
    $("versions").innerHTML = sorted.map((v, i) => `<div class="bar-row" tabindex="0" aria-label="${esc(v.app_version)}: ${v.users}명">
        <span class="mono">${esc(v.app_version)}${i === 0 ? ` <span class="badge plus">최신</span>` : ""}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(100 * v.users / max).toFixed(1)}%"></div></div>
        <span class="muted" title="${v.last_seen}">${fmtInt(v.users)}명 · ${relTimeFine(v.last_seen)}</span></div>`).join("");
  }
  // 0133: 온보딩 버전은 새로 온 사람만 본다. 기존 사용자가 업데이트했는지는 푸시 토큰이 실행마다 싣는 버전으로 본다.
  const live = data.app_versions_live;
  if (live?.length) {
    const cmp = (a, b) => (b.app_version ?? "").localeCompare(a.app_version ?? "", undefined, { numeric: true });
    const sorted = [...live].sort(cmp);
    const max = Math.max(...sorted.map((v) => Number(v.users)), 1);
    const total = sorted.reduce((n, v) => n + Number(v.users), 0);
    $("versions").innerHTML += `<div class="muted" style="margin-top:12px">현재 사용 버전 (최근 14일 실행 · 알림 허용 사용자 ${fmtInt(total)}명)</div>` +
      sorted.map((v) => {
        const label = v.app_version ?? "1.0.6 이하";
        return `<div class="bar-row" tabindex="0" aria-label="${esc(label)}: ${v.users}명">
        <span class="mono">${esc(label)}</span>
        <div class="bar-track"><div class="bar-fill${v.app_version ? "" : " light"}" style="width:${(100 * v.users / max).toFixed(1)}%"></div></div>
        <span class="muted" title="${v.last_seen}">${fmtInt(v.users)}명 · ${Math.round(100 * v.users / total)}%</span></div>`;
      }).join("");
  }

  const feedback = data.feedback_recent;
  if (!feedback) missingKey($("feedback"));
  else {
    $("feedback").innerHTML = feedback.length
      ? feedback.map((f) => `<div class="feedback">
          <div class="muted"><span title="${f.created_at}">${relTime(f.created_at)}</span> · ${esc(f.app_version ?? "")} · ${esc(f.locale ?? "")}
            ${f.contact_email ? ` · <a href="mailto:${encodeURIComponent(f.contact_email)}">${esc(f.contact_email)}</a>` : ""}</div>
          <div class="feedback-body">${esc(f.message)}</div></div>`).join("")
      : `<div class="empty">접수된 피드백이 없습니다.</div>`;
  }
}

// 가입은 위로, 탈퇴는 아래로 — 같은 날 둘을 나란히 두면 "가입이 몰려서 탈퇴도 는 것"이 모양으로 보인다.
function renderSignups(rows) {
  const el = $("signups");
  if (!rows) { missingKey(el); return; }
  if (!rows.length) { el.innerHTML = `<div class="empty">데이터가 없습니다</div>`; return; }
  const w = 640, h = 200, padL = 34, padR = 8, padT = 10, padB = 24;
  const up = Math.max(...rows.map((r) => Number(r.signups)), 1);
  const down = Math.max(...rows.map((r) => Number(r.deletions)), 1);
  const plotH = h - padT - padB;
  // 기준선 위치를 두 최대값 비율로 나눈다 — 탈퇴가 적을 때 아래 칸이 빈 채로 절반을 먹지 않게.
  const zero = padT + plotH * up / (up + down);
  const scale = plotH / (up + down);
  const band = (w - padL - padR) / rows.length;
  const bw = Math.max(band - 2, 1);
  const bars = rows.map((r, i) => {
    const x = padL + i * band + (band - bw) / 2;
    const s = Number(r.signups), d = Number(r.deletions);
    return `<g><title>${fmtDauDate(r.day)} · 가입 ${s} · 탈퇴 ${d}</title>
      <rect x="${x.toFixed(1)}" y="${(zero - s * scale).toFixed(1)}" width="${bw.toFixed(1)}" height="${(s * scale).toFixed(1)}" fill="var(--tide)" rx="1"/>
      <rect x="${x.toFixed(1)}" y="${zero.toFixed(1)}" width="${bw.toFixed(1)}" height="${(d * scale).toFixed(1)}" fill="var(--error)" opacity="0.75" rx="1"/>
      <rect x="${(padL + i * band).toFixed(1)}" y="${padT}" width="${band.toFixed(1)}" height="${plotH}" fill="transparent"/></g>`;
  }).join("");
  const fmt = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  const ticks = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])].map((i) =>
    `<text x="${(padL + i * band + band / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" fill="var(--secondary-ink)" font-size="11">${fmt(rows[i].day)}</text>`).join("");
  const axis = `<line x1="${padL}" y1="${zero.toFixed(1)}" x2="${w - padR}" y2="${zero.toFixed(1)}" stroke="var(--secondary-ink)" stroke-width="1"/>
    <text x="${padL - 8}" y="${(zero - up * scale).toFixed(1)}" text-anchor="end" dominant-baseline="hanging" fill="var(--secondary-ink)" font-size="11">${up}</text>
    <text x="${padL - 8}" y="${(zero + down * scale).toFixed(1)}" text-anchor="end" dominant-baseline="auto" fill="var(--secondary-ink)" font-size="11">${down}</text>`;
  const sum = (k, n) => rows.slice(-n).reduce((s, r) => s + Number(r[k]), 0);
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" role="img"
      aria-label="최근 60일 일별 가입(위)과 탈퇴(아래)">${axis}${bars}${ticks}</svg>
    <div class="legend"><span><i style="background:var(--tide)"></i>가입</span><span><i style="background:var(--error);opacity:.75"></i>탈퇴</span>
      <span class="muted">7일 가입 ${fmtInt(sum("signups", 7))} · 탈퇴 ${fmtInt(sum("deletions", 7))} · 30일 가입 ${fmtInt(sum("signups", 30))} · 탈퇴 ${fmtInt(sum("deletions", 30))}</span></div>`;
}

function renderDeletions(rows) {
  const el = $("deletions");
  if (!rows) { missingKey(el); return; }
  if (!rows.length) { el.innerHTML = `<div class="empty">최근 30일 탈퇴 없음</div>`; return; }
  // 머문 시간 구간 — "가입하자마자 지움"과 "써보고 지움"은 고칠 곳이 다르다.
  const buckets = [["1시간 이내", 1], ["1일 이내", 24], ["7일 이내", 168], ["7일 초과", Infinity]];
  const counts = buckets.map(([label, max], i) => [label, rows.filter((r) =>
    Number(r.hours_alive) < max && (i === 0 || Number(r.hours_alive) >= buckets[i - 1][1])).length]);
  const steps = {};
  for (const r of rows) {
    const k = r.last_funnel_step ?? "(기록 없음)";
    steps[k] = (steps[k] ?? 0) + 1;
  }
  const partnered = rows.filter((r) => r.had_partner).length;
  const max = Math.max(...counts.map(([, v]) => v), 1);
  el.innerHTML =
    `<div class="muted" style="margin-bottom:4px">가입 후 탈퇴까지 걸린 시간 · 파트너 연결 경험 ${fmtInt(partnered)}/${fmtInt(rows.length)}명</div>` +
    counts.map(([label, v]) => `<div class="bar-row" tabindex="0" aria-label="${label}: ${v}명">
      <span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${(100 * v / max).toFixed(1)}%"></div></div>
      <span class="muted">${fmtInt(v)}</span></div>`).join("") +
    `<div class="muted" style="margin:12px 0 4px">탈퇴 전 마지막 도달 단계</div>` +
    Object.entries(steps).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      statusRow(KOREAN_STEP_NAMES[k] ?? esc(k), `${fmtInt(v)}명`)).join("");
}

function renderCountries(rows) {
  const el = $("countries");
  if (!rows) { missingKey(el); return; }
  if (!rows.length) { el.innerHTML = `<div class="empty">데이터가 없습니다</div>`; return; }
  const max = Math.max(...rows.map((r) => Number(r.users)), 1);
  // 연결된 사람을 진하게, 혼자인 사람을 옅게 한 막대에 쌓는다 — 나라별 "연결률"이 길이 비로 보인다.
  const row = (r) => `<div class="bar-row" tabindex="0" aria-label="${countryName(r.country_code)}: ${r.users}명, 연결 ${r.paired_users}명">
      <span>${countryName(r.country_code)} <span class="muted">${esc(r.country_code)}</span></span>
      <div class="bar-track stacked"><div class="bar-fill" style="width:${(100 * r.paired_users / max).toFixed(1)}%"></div><div class="bar-fill light" style="width:${(100 * r.solo_users / max).toFixed(1)}%"></div></div>
      <span class="muted">${fmtInt(r.users)} · 연결 ${Math.round(100 * r.paired_users / Math.max(r.users, 1))}%</span></div>`;
  const top = rows.slice(0, 10), rest = rows.slice(10);
  el.innerHTML = top.map(row).join("") +
    (rest.length ? `<details class="unpaired"><summary>나머지 ${rest.length}개국</summary>${rest.map(row).join("")}</details>` : "") +
    `<div class="legend"><span><i style="background:var(--tide)"></i>연결</span><span><i style="background:color-mix(in srgb, var(--tide) 35%, transparent)"></i>미연결</span></div>`;
}

const NUDGE_GROUPS = [
  ["초대", ["partner_invite_sent", "partner_invite_share_completed", "partner_invite_share_cancelled", "accept_invite_sheet_opened"]],
  ["초대받은 쪽", ["invitee_entry_chosen", "invitee_paste_card_shown", "invitee_code_pasted", "invitee_switched_to_inviter"]],
  ["위젯 안내", ["widget_nudge_viewed", "widget_nudge_opened", "widget_nudge_dismissed"]],
];
function renderNudges(rows) {
  const el = $("nudges");
  if (!rows) { missingKey(el); return; }
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  el.innerHTML = NUDGE_GROUPS.map(([title, names]) => {
    const group = document.createElement("div");
    renderFunnel(group, names.map((name) => ({ name, users: byName[name]?.users ?? 0 })));
    return `<div class="muted" style="margin-top:4px">${title}</div>${group.innerHTML}`;
  }).join("");
}

// 상태 경계(7일/21일)는 집계가 아니라 표시 규칙이라 여기 둔다 — 문구와 함께 바뀐다.
function coupleStatus(lastActive) {
  if (!lastActive) return ["churned", "이탈"];
  const days = (Date.now() - new Date(lastActive).getTime()) / 86400000;
  if (days <= 7) return ["active", "활성"];
  if (days <= 21) return ["dormant", "휴면"];
  return ["churned", "이탈"];
}

const MEMBERSHIP_BADGE = {
  lifetime: "평생 이용권", trial_active: "체험 중", trial_over: "체험 종료", subscribed: "구독 중",
  promo_trial: "재체험 중",
};
const PROMO_NAMES = { moment_launch: "모먼트 출시 재체험" };
const LIFETIME_SOURCE = { seed: "시드", beta_gift: "베타 선물", store: "스토어 결제" };

let coupleSort = { key: "last_active_at", dir: -1 };
let needFilter = null;
let openCouple = null;

// 시각을 같이 보인다 — "오늘"만으로는 방금 쓴 건지 새벽에 한 번 연 건지 모른다.
// 기준은 보는 사람(어드민)의 시계다. 커플의 현지 시각은 상세에서 따로 보인다.
function fmtWhen(iso) {
  if (!iso) return "기록 없음";
  const d = new Date(iso);
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days <= 0) return `오늘 ${hm}`;
  if (days === 1) return `어제 ${hm}`;
  if (days < 7) return `${days}일 전 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  // 경과 시간을 24시간 단위로 내리면 같은 9/19 연결이 시각에 따라 "20일 전"과 "21일 전"으로
  // 갈렸다. 옆 칸 fmtWhen처럼 달력 날짜 차이로 센다.
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  return `${d.getMonth() + 1}/${d.getDate()} <span class="muted">(${days <= 0 ? "오늘" : `${days}일 전`})</span>`;
}
// 하트비트는 UTC 날짜로 쌓인다. 한국 오후에도 UTC "오늘"은 반나절밖에 안 지났으므로,
// 마지막 점을 다 찬 날처럼 그리면 그래프 끝이 매일 급락처럼 보인다.
const utcToday = () => new Date().toISOString().slice(0, 10);
const isPartialDay = (rows) => rows.length > 1 && rows[rows.length - 1].day === utcToday();
// 상대 도시의 지금 시각 — 롱디 커플이 "지금 뭘 할 시간인지"가 곧 사용 패턴의 이유다.
function localNow(offsetMin) {
  const d = new Date(Date.now() + (Number(offsetMin) + new Date().getTimezoneOffset()) * 60000);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const WIDGET_NAMES = {
  NaruPartnerMoment: "모먼트", NaruPartnerDrawingWidget: "낙서",
  NaruSameSkyWidget: "지금", NaruOverlapVennWidget: "캘린더", NaruPartnerClockWidget: "하루",
  NaruLatestNoteWidget: "쪽지", NaruDaysWidget: "디데이", NaruPartnerDayWidget: "하루(옛)",
};
const WIDGET_FAMILIES = {
  systemSmall: "작게", systemMedium: "중간", systemLarge: "크게", systemExtraLarge: "아주 크게",
  accessoryCircular: "잠금 원형", accessoryRectangular: "잠금 사각", accessoryInline: "잠금 한 줄",
};
const widgetName = (kind) => WIDGET_NAMES[kind] ?? esc(kind);

// 설치 목록은 앱이 포그라운드일 때 하루 한 번 올라온다(SupabaseWidgetUsageService). 그래서
// "마지막 확인"이 멈췄다는 건 둘 중 하나다 — 앱을 안 열었거나, 열었는데 그 위젯이 없었거나.
// 확인 뒤로 사흘 넘게 앱을 열었으면 뺀 것으로 본다(하루 주기에 시차·실패 여유를 더한 값).
const WIDGET_REMOVED_AFTER_DAYS = 3;
function widgetState(w, lastActive) {
  if (!w.last_seen_at) return ["tap_only", "설치 기록 없음"];
  const seen = new Date(w.last_seen_at).getTime();
  if (lastActive && (new Date(lastActive).getTime() - seen) / 86400000 > WIDGET_REMOVED_AFTER_DAYS) return ["removed", "제거 추정"];
  if ((Date.now() - seen) / 86400000 <= 14) return ["on", "사용 중"];
  return ["stale", "확인 지연"];
}

const SUBSCRIPTION_PLAN = (productID) =>
  /yearly|annual/.test(productID ?? "") ? "연" : /monthly/.test(productID ?? "") ? "월" : "";

// 커플 한 쌍이 지금 무엇이 필요한지. 판정은 이 표 하나에서만 한다 — 요약 칩·표 태그·상세가 같은 결과를 본다.
// level: bad(놓치는 중) · warn(막혀 있음) · opp(기회) · info(참고)
const NEED_RULES = [
  ["churned", "bad", "이탈", "21일 넘게 두 사람 모두 미접속",
    (c) => c.idleDays > 21],
  ["dormant", "warn", "휴면", "7~21일째 두 사람 모두 미접속",
    (c) => c.idleDays > 7 && c.idleDays <= 21],
  ["one_side", "warn", "한 명만 사용", "최근 14일 한 명만 접속 — 상대 재방문 유도 필요",
    (c) => c.members.length === 2 && c.members.some((m) => m.active_days_14.length >= 2) &&
      c.members.some((m) => m.active_days_14.length === 0)],
  ["no_push", "warn", "푸시 미등록", "푸시 토큰이 없는 멤버가 있음 — 쪽지·일정 알림 미수신",
    (c) => c.members.some((m) => !m.push)],
  // 연결 당일은 아직 둘러보는 중이다 — 하루는 기다려 본다.
  ["empty", "warn", "콘텐츠 없음", "연결 1일 경과 후에도 일정·쪽지·버킷 생성 없음 — 첫 사용 유도 필요",
    (c) => !c.calendar.events_total && !c.notes.notes_total && !c.bucket.ideas_total &&
      Date.now() - new Date(c.connected_at).getTime() > 86400000],
  ["convert", "opp", "전환 후보", "체험 종료 3일 이내 · 최근 14일 생성 5건 초과",
    (c) => (c.membership_state === "trial_active" || c.membership_state === "promo_trial") &&
      c.expiresInDays != null && c.expiresInDays <= 3 && c.made14 >= 5],
  ["paywall", "opp", "체험 종료 후 사용", "멤버십 없이 최근 7일 접속 — 페이월 노출 대상",
    (c) => c.membership_state === "trial_over" && c.idleDays <= 7],
  ["calendar_sync", "info", "캘린더 연동 후보", "최근 14일 직접 입력 일정 8건 이상 · 캘린더 연동 없음",
    (c) => c.calendar.events_14d >= 8 && !c.members.some((m) => m.apple_calendar || m.google_calendar)],
  ["sync_only", "info", "연동 일정만 사용", "연동 일정은 있으나 앱에서 직접 만든 일정 없음",
    (c) => (Number(c.synced.apple_events) + Number(c.synced.google_events)) > 0 && !c.calendar.events_total],
  ["unanswered", "info", "쪽지 무응답", "최근 14일 쪽지에 답장 없음",
    (c) => c.notes.notes_14d > 0 && !c.notes.replied],
  ["renew_off", "warn", "해지 예정", "자동 갱신 해제 — 만료일에 구독 종료",
    (c) => c.membership_state === "subscribed" && c.subscription?.will_renew === false],
  ["widget", "info", "위젯 안내 대상", "두 사람 모두 최근 14일 중 5일 초과 접속 · 위젯 없음",
    (c) => c.members.length === 2 && c.members.every((m) => m.active_days_14.length >= 5) &&
      c.members.every((m) => !m.widgetsOn.length)],
  ["widget_removed", "info", "위젯 제거", `위젯 설치 후 모두 제거 추정 — 마지막 확인 후 ${WIDGET_REMOVED_AFTER_DAYS}일 넘게 앱 실행`,
    (c) => c.members.some((m) => !m.widgetsOn.length && m.widgetRows.some((w) => w.state === "removed"))],
  ["no_anniversary", "info", "기념일 미설정", "기념일 미입력으로 디데이가 비어 있음",
    (c) => !c.anniversary_date],
];
const NEED_ORDER = { bad: 0, warn: 1, opp: 2, info: 3 };

function enrichCouple(c) {
  const members = (c.members ?? []).map((m) => {
    const widgetRows = (m.widget_detail ?? []).map((w) => {
      const [state, stateLabel] = widgetState(w, m.last_active_at);
      return { ...w, state, stateLabel };
    });
    // 0133 전 스냅샷에는 widget_detail이 없다 — 그땐 14일 목록을 "지금 있음"으로 본다.
    const widgetsOn = m.widget_detail ? widgetRows.filter((w) => w.state === "on").map((w) => w.kind) : (m.widgets ?? []);
    return { ...m, active_days_14: m.active_days_14 ?? [], widgets: m.widgets ?? [], widgetRows, widgetsOn };
  });
  const lastActive = members.map((m) => m.last_active_at).filter(Boolean).sort().pop() ?? null;
  const idleDays = lastActive ? (Date.now() - new Date(lastActive).getTime()) / 86400000 : Infinity;
  const expiresInDays = c.membership_expires_at
    ? (new Date(c.membership_expires_at).getTime() - Date.now()) / 86400000 : null;
  const offsets = members.map((m) => Number(m.utc_offset_min));
  const gapHours = offsets.length === 2 ? Math.abs(offsets[0] - offsets[1]) / 60 : 0;
  const row = {
    ...c, members, lastActive, idleDays, expiresInDays, gapHours,
    calendar: c.calendar ?? {}, synced: c.synced ?? {}, notes: c.notes ?? {}, bucket: c.bucket ?? {},
    events_14d: Number(c.calendar?.events_14d ?? 0), notes_14d: Number(c.notes?.notes_14d ?? 0),
    ideas_14d: Number(c.bucket?.ideas_14d ?? 0),
  };
  row.made14 = row.events_14d + row.notes_14d + row.ideas_14d;
  row.last_active_at = lastActive;
  // 표 정렬 키. 위젯은 "몇 명이 올렸나"가 먼저고 종류 수는 그다음이다 — 한 명이 셋 올린 커플보다 둘이 하나씩이 앞.
  row.widgetUsers = members.filter((m) => m.widgetsOn.length).length;
  row.widgetSort = row.widgetUsers * 100 + members.reduce((n, m) => n + m.widgetsOn.length, 0);
  row.activeSort = Number(c.both_active_days_14 ?? 0) * 100 + members.reduce((n, m) => n + m.active_days_14.length, 0);
  // 모먼트는 한 사람당 최근 한 장만 남아서 "올린 적 있는 사람 수"가 먼저, 누적 교체 횟수가 그다음이다.
  row.momentSort = members.filter((m) => m.moment).length * 1000 + members.reduce((n, m) => n + Number(m.moment?.uploads ?? 0), 0);
  row.needs = NEED_RULES.filter(([, , , , test]) => test(row)).map(([key, level, label, why]) => ({ key, level, label, why }))
    .sort((a, b) => NEED_ORDER[a.level] - NEED_ORDER[b.level]);
  return row;
}

function renderCouples(data) {
  const detail = data.couple_detail;
  if (!detail) { renderCouplesLegacy(data); return; }
  const rows = detail.map(enrichCouple);
  const picked = ecoFilter ? rows.filter((r) => ecoFilter.ids.has(r.couple_id)) : rows;

  // 니즈 요약: 몇 쌍이 어떤 상태인지. 누르면 표를 그 커플만으로 거른다. 개요에서 고른 커플이 있으면
  // 그 안에서 센다 — 칩 숫자와 눌렀을 때 보이는 줄 수가 같아야 한다.
  const counts = NEED_RULES.map(([key, level, label, why]) =>
    ({ key, level, label, why, n: picked.filter((r) => r.needs.some((x) => x.key === key)).length }))
    .filter((x) => x.n);
  const ecoChip = ecoFilter ? `<button class="chip on eco" data-eco-clear title="개요에서 고른 커플만 보는 중 — 누르면 해제">
      ${esc(ecoFilter.label)} <b>${fmtInt(picked.length)}</b> ✕</button>` : "";
  $("couple-needs").innerHTML = `<div class="chips">${ecoChip}${counts.map((x) =>
    `<button class="chip ${x.level}${needFilter === x.key ? " on" : ""}" data-need="${x.key}" title="${x.why}">
       ${x.label} <b>${x.n}</b></button>`).join("")}
     ${needFilter || ecoFilter ? `<button class="chip clear" data-clear-all>전체 보기</button>` : ""}</div>
    <div class="muted hint">${needFilter ? esc(NEED_RULES.find((r) => r[0] === needFilter)[3]) : "선택하면 해당 커플만 표시합니다. 한 커플이 여러 항목에 해당할 수 있습니다."}</div>`;
  $("couple-needs").querySelectorAll(".chip").forEach((b) => b.onclick = () => {
    if (b.dataset.clearAll !== undefined) { ecoFilter = null; needFilter = null; }
    else if (b.dataset.ecoClear !== undefined) ecoFilter = null;
    else needFilter = b.dataset.need || null;
    renderCouples(lastData);
  });

  const shown = needFilter ? picked.filter((r) => r.needs.some((x) => x.key === needFilter)) : picked;
  const sorted = [...shown].sort((a, b) => {
    const va = a[coupleSort.key], vb = b[coupleSort.key];
    const cmp = coupleSort.key === "last_active_at" || coupleSort.key === "connected_at"
      ? new Date(va ?? 0) - new Date(vb ?? 0)
      : Number(va ?? 0) - Number(vb ?? 0);
    return cmp * coupleSort.dir;
  });
  const sortableHead = (key, label) =>
    `<th class="sortable" data-key="${key}" tabindex="0" role="button" aria-sort="${coupleSort.key === key ? (coupleSort.dir === -1 ? "descending" : "ascending") : "none"}">${label}</th>`;
  const names = (r) => r.members.map((m) => esc(m.nickname)).join(" · ") + (r.members.length < 2 ? ` <span class="muted">(파트너 없음)</span>` : "");
  const dday = (r) => r.expiresInDays == null ? "" : r.expiresInDays < 0 ? " 만료" : ` D-${Math.ceil(r.expiresInDays)}`;
  // 두 사람 값을 "가 · 나" 한 칸에 — 커플 앱에서 한쪽만 쓰는지가 숫자 하나보다 먼저 보여야 한다.
  const activeCell = (r) => {
    const both = r.both_active_days_14;
    return `<span title="최근 14일 각자 접속일${both != null ? ` · 동시 접속일 ${both}일` : ""}">${r.members.map((m) => m.active_days_14.length).join(" · ")}` +
      (both != null ? ` <span class="muted">동시 ${both}</span>` : "") + `</span>`;
  };
  const momentCell = (r) => r.momentSort
    ? `<span title="각자 누적 교체 횟수">${r.members.map((m) => fmtInt(m.moment?.uploads ?? 0)).join(" · ")}</span>`
    : `<span class="muted">—</span>`;
  const widgetCell = (r) => {
    if (!r.widgetUsers) return `<span class="muted">—</span>`;
    const title = r.members.map((m) => `${m.nickname}: ${m.widgetsOn.map((k) => WIDGET_NAMES[k] ?? k).join(", ") || "없음"}`).join(" / ");
    return `<span class="widget-cell" title="${esc(title)}">${r.members.map((m) => m.widgetsOn.length
      ? `<span class="wchip">${m.widgetsOn.map(widgetName).join("·")}</span>` : `<span class="muted">없음</span>`).join(" ")}</span>`;
  };
  // 개요에서 넘어오면 표로 바로 내려온다 — 위 칩까지 올라가지 않아도 무엇을 보고 있는지 알게.
  const needLabel = needFilter ? NEED_RULES.find((r) => r[0] === needFilter)[2] : "";
  const ecoBanner = ecoFilter ? `<div class="eco-banner"><span>개요에서 고른 커플 · <b>${esc(ecoFilter.label)}</b> ${fmtInt(picked.length)}쌍${needFilter ? ` 중 ${esc(needLabel)} ${fmtInt(shown.length)}쌍` : ""}</span>
      <button class="link" data-clear-all>전체 보기</button></div>` : "";
  $("couple-table").innerHTML = ecoBanner + (shown.length ? `<table class="couples">
    <thead><tr><th>커플</th><th>상태</th><th>멤버십</th>
      ${sortableHead("last_active_at", "마지막 접속")}${sortableHead("connected_at", "연결")}
      ${sortableHead("gapHours", "시차")}${sortableHead("activeSort", "접속일")}${sortableHead("widgetSort", "위젯")}
      ${sortableHead("events_14d", "일정")}${sortableHead("notes_14d", "쪽지")}${sortableHead("ideas_14d", "버킷")}${sortableHead("momentSort", "모먼트")}<th>필요한 조치</th></tr></thead>
    <tbody>${sorted.map((r) => {
      const [cls, label] = coupleStatus(r.lastActive);
      const urgent = r.needs.filter((n) => n.level !== "info");
      // 참고 항목만 있는 커플은 칸에 "+2"만 덩그러니 남았다 — 그땐 참고 하나를 대신 보인다.
      const needs = urgent.length ? urgent.slice(0, 2) : r.needs.slice(0, 1);
      const more = r.needs.length - needs.length;
      return `<tr class="couple-row${openCouple === r.couple_id ? " open" : ""}" data-id="${r.couple_id}" tabindex="0">
        <td>${names(r)}</td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td>${r.membership_state ? `<span class="badge plus">${MEMBERSHIP_BADGE[r.membership_state] ?? r.membership_state}${r.membership_state === "subscribed" && SUBSCRIPTION_PLAN(r.subscription?.product_id) ? ` ${SUBSCRIPTION_PLAN(r.subscription.product_id)}` : ""}${dday(r)}</span>` : ""}</td>
        <td title="${r.lastActive ?? ""}">${fmtWhen(r.lastActive)}</td>
        <td title="${r.connected_at}">${fmtDate(r.connected_at)}</td>
        <td>${r.members.length === 2 && Number.isFinite(r.gapHours) ? `${+r.gapHours.toFixed(1)}h` : "—"}</td>
        <td>${activeCell(r)}</td><td>${widgetCell(r)}</td>
        <td>${fmtInt(r.events_14d)}</td><td>${fmtInt(r.notes_14d)}</td><td>${fmtInt(r.ideas_14d)}</td><td>${momentCell(r)}</td>
        <td class="needs">${needs.map((n) => `<span class="need ${n.level}">${n.label}</span>`).join("")}${more > 0 ? `<span class="muted">+${more}</span>` : ""}</td></tr>
        ${openCouple === r.couple_id ? `<tr class="couple-detail"><td colspan="13">${coupleDetailHtml(r)}</td></tr>` : ""}`;
    }).join("")}</tbody></table>` : `<div class="empty">해당 커플이 없습니다.</div>`);
  $("couple-table").querySelectorAll("[data-clear-all]").forEach((b) => b.onclick = () => { ecoFilter = null; needFilter = null; renderCouples(lastData); });

  const triggerSort = (th) => {
    coupleSort = th.dataset.key === coupleSort.key
      ? { key: coupleSort.key, dir: -coupleSort.dir } : { key: th.dataset.key, dir: -1 };
    renderCouples(lastData);
  };
  const onKey = (fn) => (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fn(); }
  };
  $("couple-table").querySelectorAll("th.sortable").forEach((th) => {
    th.onclick = () => triggerSort(th);
    th.onkeydown = onKey(() => triggerSort(th));
  });
  $("couple-table").querySelectorAll("tr.couple-row").forEach((tr) => {
    const toggle = () => { openCouple = openCouple === tr.dataset.id ? null : tr.dataset.id; renderCouples(lastData); };
    tr.onclick = toggle;
    tr.onkeydown = onKey(toggle);
  });
  renderCoupleWidgets(rows);
  renderUnpaired(data);
}

// 위젯을 둔 사람이 더 자주 들어오는지. 인과는 아니지만(원래 자주 쓰는 사람이 위젯도 올린다)
// 위젯 권유를 더 밀지 판단할 첫 근거다. 같은 커플 행에서 세서 표와 숫자가 어긋나지 않는다.
// 위젯 집계는 커플 탭과 기능 사용 탭이 이 함수 하나로 센다. 예전엔 기능 사용 탭이 SQL의
// "14일 안에 본 적 있음"(제거 추정 포함)을 따로 써서 같은 '위젯 사용 커플'이 29쌍·27쌍으로 갈렸다.
function widgetStats(rows) {
  const pairs = rows.filter((r) => r.members.length === 2);
  const both = pairs.filter((r) => r.widgetUsers === 2).length;
  const one = pairs.filter((r) => r.widgetUsers === 1).length;
  const members = rows.flatMap((r) => r.members);
  const byKind = {};
  for (const m of members) for (const w of m.widgetRows) {
    const k = (byKind[w.kind] ??= { on: 0, removed: 0, taps: 0 });
    if (w.state === "on") k.on += 1;
    if (w.state === "removed") k.removed += 1;
    k.taps += Number(w.taps ?? 0);
  }
  const kinds = Object.entries(byKind).sort((a, b) => b[1].on - a[1].on || b[1].taps - a[1].taps);
  return { pairs, both, one, none: pairs.length - both - one, members, kinds };
}
const widgetKindHtml = ([k, v]) =>
  `${widgetName(k)} ${fmtInt(v.on)}명${v.removed ? ` <span class="bad-text">제거 ${fmtInt(v.removed)}</span>` : ""} <span class="muted">(탭 ${fmtInt(v.taps)})</span>`;

function renderCoupleWidgets(rows) {
  const el = $("couple-widgets");
  if (!rows.length) { el.innerHTML = `<div class="empty">연결된 커플이 없습니다.</div>`; return; }
  const { pairs, both, one, none, members, kinds } = widgetStats(rows);
  const seg = (n, cls, label) => n ? `<div class="bar-fill${cls}" style="width:${(100 * n / pairs.length).toFixed(1)}%" title="${label} ${n}쌍"></div>` : "";
  const avg = (list, f) => list.length ? (list.reduce((n, x) => n + f(x), 0) / list.length).toFixed(1) : "—";
  const withW = members.filter((m) => m.widgetsOn.length), withoutW = members.filter((m) => !m.widgetsOn.length);
  const hasBoth = rows.some((r) => r.both_active_days_14 != null);
  el.innerHTML = `
    <div class="bar-row reach" tabindex="0" aria-label="위젯: 둘 다 ${both}쌍, 한 명만 ${one}쌍, 없음 ${none}쌍">
      <span>위젯 사용 커플</span>
      <div class="bar-track stacked">${seg(both, "", "둘 다")}${seg(one, " light", "한 명만")}</div>
      <span class="muted">${fmtInt(both + one)}/${fmtInt(pairs.length)}쌍</span></div>
    <div class="legend"><span><i style="background:var(--tide)"></i>둘 다 ${fmtInt(both)}쌍</span>
      <span><i style="background:color-mix(in srgb, var(--tide) 35%, transparent)"></i>한 명만 ${fmtInt(one)}쌍</span>
      <span><i style="background:var(--subtle)"></i>없음 ${fmtInt(none)}쌍</span></div>
    ${statusRow("평균 접속일 (14일) — 위젯 사용자 · 미사용자",
      `${avg(withW, (m) => m.active_days_14.length)}일 (${fmtInt(withW.length)}명) · ${avg(withoutW, (m) => m.active_days_14.length)}일 (${fmtInt(withoutW.length)}명)`)}
    ${hasBoth ? statusRow("동시 접속일 (14일 평균) — 위젯 사용 커플 · 미사용 커플",
      `${avg(pairs.filter((r) => r.widgetUsers), (r) => Number(r.both_active_days_14 ?? 0))}일 · ${avg(pairs.filter((r) => !r.widgetUsers), (r) => Number(r.both_active_days_14 ?? 0))}일`) : ""}
    ${kinds.length ? statusRow("위젯별 — 사용 중 · 제거 추정 · 누적 탭", kinds.map(widgetKindHtml).join(" · ")) : ""}`;
}

// 위젯 하나에 한 줄: 종류·크기가 왼쪽, 지금 있는지·누르는지가 오른쪽.
// "깔아두고 안 누르는 위젯"도 보는 위젯이다(모먼트·낙서는 누르지 않고 보는 게 목적) — 탭 0을 실패로 칠하지 않는다.
function widgetRowsHtml(m) {
  if (!m.widgetRows.length) return statusRow("위젯", `<span class="muted">설치 기록 없음</span>`);
  const stateHtml = (w) => w.state === "on" ? `<span class="ok-text">${w.stateLabel}</span>`
    : w.state === "removed" ? `<span class="bad-text" title="마지막 확인 ${w.last_seen_at}">${w.stateLabel}</span>`
    : `<span class="muted">${w.stateLabel}</span>`;
  return statusRow("위젯", m.widgetsOn.length ? `${fmtInt(m.widgetsOn.length)}종 사용 중` : `<span class="muted">현재 없음</span>`) +
    m.widgetRows.map((w) => `<div class="status-row widget-line"><span>${widgetName(w.kind)}
        <span class="muted">${(w.families ?? []).map((f) => WIDGET_FAMILIES[f] ?? esc(f)).join(" · ")}</span></span>
      <span class="muted">${stateHtml(w)}${w.first_seen_at ? ` · ${fmtDate(w.first_seen_at)}부터` : ""} · 탭 ${fmtInt(w.taps)}${w.last_tap_at ? ` <span title="${w.last_tap_at}">(${relTime(w.last_tap_at)})</span>` : ""}</span></div>`).join("");
}

// 온보딩 버전은 그 뒤 업데이트를 모른다. 푸시 토큰이 실행마다 싣는 버전(1.0.7+)이 있으면 그게 지금 앱이다.
function appVersionHtml(m) {
  if (m.app_version_live) return `<span title="${m.app_version_seen_at ?? ""}">${esc(m.app_version_live)}</span>`;
  if (m.app_version_seen_at) return `<span title="토큰은 있는데 버전이 비어 있음 — 1.0.7 전 앱">1.0.6 이하</span>`;
  if (!("app_version_live" in m)) return esc(m.app_version ?? "—");
  return `${esc(m.app_version ?? "—")} <span class="muted">(가입 시)</span>`;
}

const SUBSCRIPTION_STATUS = {
  active: "정상", grace_period: "결제 유예", billing_retry: "결제 재시도", expired: "만료", revoked: "환불",
};
function subscriptionRow(r) {
  const s = r.subscription;
  if (!s) return "";
  const plan = SUBSCRIPTION_PLAN(s.product_id);
  const renew = ["active", "grace_period", "billing_retry"].includes(s.status)
    ? (s.will_renew ? ` · <span class="ok-text">자동 갱신</span>` : ` · <span class="bad-text">자동 갱신 해제</span>`) : "";
  return statusRow("구독", `${plan ? `${plan} 구독 · ` : ""}${SUBSCRIPTION_STATUS[s.status] ?? esc(s.status)}${renew}` +
    `${s.expires_at ? ` · <span title="${s.expires_at}">${new Date(s.expires_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}까지</span>` : ""}` +
    `${s.environment && s.environment !== "Production" ? ` <span class="muted">(샌드박스)</span>` : ""}`);
}

function coupleDetailHtml(r) {
  const today = new Date();
  // 14칸 출석표. 하트비트가 UTC 날짜라 칸도 UTC로 센다.
  const strip = (days) => {
    const set = new Set(days);
    return `<span class="strip" aria-label="14일 중 ${days.length}일 접속">${Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 13 + i)).toISOString().slice(0, 10);
      return `<i class="${set.has(d) ? "on" : ""}" title="${d}"></i>`;
    }).join("")}</span> <span class="muted">${days.length}/14일</span>`;
  };
  const yes = (v, on, off) => v ? `<span class="ok-text">${on}</span>` : `<span class="bad-text">${off}</span>`;
  const member = (m) => `<div class="member">
    <div class="member-head"><b>${esc(m.nickname)}</b>
      <span class="muted">${esc(m.city ?? "")}${m.country_code ? ` · ${countryName(m.country_code)}` : ""} · 지금 ${localNow(m.utc_offset_min)}</span></div>
    ${statusRow("마지막 접속", `<span title="${m.last_active_at ?? ""}">${fmtWhen(m.last_active_at)}</span>`)}
    ${statusRow("최근 생성 활동", `<span title="${m.last_action_at ?? ""}">${fmtWhen(m.last_action_at)}</span>`)}
    ${statusRow("접속 (14일)", strip(m.active_days_14) + (m.active_days_30 != null ? ` <span class="muted">· 30일 ${fmtInt(m.active_days_30)}일</span>` : ""))}
    ${statusRow("생성 (14일)", `일정 ${fmtInt(m.events_14d)} · 쪽지 ${fmtInt(m.notes_14d)}${m.drawings_14d != null ? ` <span class="muted">(낙서 ${fmtInt(m.drawings_14d)})</span>` : ""} · 답장 ${fmtInt(m.replies_14d)} · 버킷 ${fmtInt(m.ideas_14d)}`)}
    ${m.moment ? statusRow("모먼트", `${fmtInt(m.moment.uploads)}회 업로드 · 최근 <span title="${m.moment.captured_at}">${fmtWhen(m.moment.captured_at)}</span>`) : ""}
    ${statusRow("알림", yes(m.push, "수신 가능", "토큰 없음"))}
    ${statusRow("캘린더 연동", [m.apple_calendar && "Apple", m.google_calendar && "Google"].filter(Boolean).join(" · ") || `<span class="muted">없음</span>`)}
    ${m.widget_detail ? widgetRowsHtml(m) : statusRow("위젯", m.widgets.length ? m.widgets.map(widgetName).join(" · ") : `<span class="muted">없음</span>`)}
    ${statusRow("가입 · 앱 버전", `${fmtDate(m.joined_at)} · ${appVersionHtml(m)}`)}
  </div>`;
  const cal = r.calendar, notes = r.notes, bucket = r.bucket;
  const pct = (a, b) => Number(b) ? `${Math.round(100 * Number(a) / Number(b))}%` : "—";
  return `<div class="detail">
    ${journeyHtml(r)}
    ${r.needs.length ? `<div class="need-list">${r.needs.map((n) =>
      `<div><span class="need ${n.level}">${n.label}</span> <span class="muted">${n.why}</span></div>`).join("")}</div>` : ""}
    <div class="members">${r.members.map(member).join("")}</div>
    <div class="tab-cards">
      <div><b>캘린더</b>
        ${statusRow("직접 만든 일정", `${fmtInt(cal.events_total)} <span class="muted">(14일 ${fmtInt(cal.events_14d)})</span>`)}
        ${statusRow("공유 · 반복 · 분류(이모지) 비율", `${pct(cal.shared, cal.events_total)} · ${pct(cal.series, cal.events_total)} · ${pct(cal.categorized, cal.events_total)}`)}
        ${statusRow("연동 일정", `Apple ${fmtInt(r.synced.apple_events)} · Google ${fmtInt(r.synced.google_events)}`)}
        ${statusRow("최근 생성", fmtWhen(cal.last_at))}</div>
      <div><b>쪽지</b>
        ${statusRow("쪽지", `${fmtInt(notes.notes_total)} <span class="muted">(14일 ${fmtInt(notes.notes_14d)})</span>`)}
        ${statusRow("손그림 · 답장 비율", `${pct(notes.drawings, notes.notes_total)} · ${pct(notes.replied, notes.notes_total)}`)}
        ${statusRow("최근 생성", fmtWhen(notes.last_at))}</div>
      <div><b>버킷</b>
        ${statusRow("버킷", `${fmtInt(bucket.ideas_total)} <span class="muted">(14일 ${fmtInt(bucket.ideas_14d)})</span>`)}
        ${statusRow("링크 · 사진 · 태그 비율", `${pct(bucket.with_link, bucket.ideas_total)} · ${pct(bucket.with_image, bucket.ideas_total)} · ${pct(bucket.tagged, bucket.ideas_total)}`)}
        ${statusRow("최근 생성", fmtWhen(bucket.last_at))}</div>
      <div><b>관계 정보</b>
        ${statusRow("연결", fmtDate(r.connected_at))}
        ${statusRow("기념일", r.anniversary_date ? esc(r.anniversary_date) : `<span class="muted">없음</span>`)}
        ${statusRow("시차", r.gapHours ? `${+r.gapHours.toFixed(1)}시간` : "같은 시간대")}
        ${r.both_active_days_14 != null ? statusRow("동시 접속일 (14일)", `${fmtInt(r.both_active_days_14)}일`) : ""}
        ${subscriptionRow(r)}
        ${Number(r.moments) ? statusRow("모먼트", `${fmtInt(r.moments)}명 업로드`) : ""}</div>
    </div></div>`;
}

// 0119 전 스냅샷(캐시된 응답 등)에서도 표가 비지 않게 옛 표를 남긴다.
function renderCouplesLegacy(data) {
  const rows = data.couple_activity;
  $("couple-needs").innerHTML = "";
  missingKey($("couple-widgets"));
  if (!rows) { missingKey($("couple-table")); missingKey($("unpaired")); return; }
  $("couple-table").innerHTML = rows.length ? `<table>
    <thead><tr><th>커플</th><th>상태</th><th>마지막 접속</th><th>연결</th><th>일정</th><th>쪽지</th><th>버킷</th></tr></thead>
    <tbody>${rows.map((r) => {
      const [cls, label] = coupleStatus(r.last_active_at);
      return `<tr><td>${esc(r.member_one)} · ${esc(r.member_two)}</td><td><span class="badge ${cls}">${label}</span></td>
        <td>${fmtWhen(r.last_active_at)}</td><td>${fmtDate(r.connected_at)}</td>
        <td>${fmtInt(r.events_14d)}</td><td>${fmtInt(r.notes_14d)}</td><td>${fmtInt(r.ideas_14d)}</td></tr>`;
    }).join("")}</tbody></table>` : `<div class="empty">연결된 커플이 없습니다.</div>`;
  renderUnpaired(data);
}

function renderUnpaired(data) {
  const un = data.unpaired_accounts ?? [];
  // 미연결이라도 가입한 지 며칠 안 됐으면 상대를 기다리는 중이다. 기다리는 쪽과 떠난 쪽을 먼저 가른다.
  // 초대 코드 수는 예전에 시스템 탭 푸시 카드에 있었는데, 읽는 사람이 찾는 곳은 여기다.
  const within = (iso, days) => iso && Date.now() - new Date(iso).getTime() <= days * 86400000;
  const invites = data.ops_health?.open_invites;
  const summary = un.length
    ? statusRow("가입 7일 이내 (상대 대기 중일 수 있음)", `${fmtInt(un.filter((u) => within(u.created_at, 7)).length)}명`) +
      statusRow("최근 7일 접속", `${fmtInt(un.filter((u) => within(u.last_active_at, 7)).length)}명`) +
      (invites != null ? statusRow("유효한 초대 코드", `${fmtInt(invites)}개`) : "")
    : "";
  $("unpaired").innerHTML = summary + (un.length
    ? `<details class="unpaired"><summary>미연결 계정 ${un.length}명</summary><table><tbody>
        ${un.map((u) => `<tr><td>${esc(u.nickname)}</td>
          <td title="${u.created_at}">가입 ${fmtWhen(u.created_at)}</td>
          <td title="${u.last_active_at ?? ""}">접속 ${fmtWhen(u.last_active_at)}</td></tr>`).join("")}
      </tbody></table></details>`
    : `<div class="empty">모든 계정이 파트너와 연결되어 있습니다.</div>`);
}

// ── 사용 탭: 앱 탭마다 몇 커플이 어떤 방식으로 쓰는지 ─────────────────────────
function renderUsage(data) {
  const u = data.tab_usage;
  const ids = ["usage-home", "usage-calendar", "usage-notes", "usage-bucket", "usage-widgets", "usage-hours"];
  if (!u) { ids.forEach((id) => missingKey($(id))); return; }
  const total = Number(u.connected_couples) || 1;
  // 한 줄 요약 막대: 전체 커플 중 몇 쌍이 14일 안에 이 탭에 뭔가 남겼는지.
  const reach = (n, label) => {
    const pct = Math.round(100 * Number(n) / total);
    return `<div class="bar-row reach" tabindex="0" aria-label="${label}: ${n}쌍, ${pct}%">
      <span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="muted">${fmtInt(n)}/${fmtInt(total)}쌍 · ${pct}%</span></div>`;
  };
  const h = u.home;
  $("usage-home").innerHTML =
    statusRow("최근 7일 접속자", `${fmtInt(h.active_users_7d)}명`) +
    statusRow("두 사람 모두 접속한 커플 (7일)", `${fmtInt(h.both_active_couples_7d)}쌍`) +
    statusRow("한 명만 접속한 커플 (7일)", `${fmtInt(h.one_side_couples_7d)}쌍`, Number(h.one_side_couples_7d) ? "warn" : "") +
    statusRow("평균 접속일 (14일)", `${h.avg_active_days_14d ?? "—"}일`) +
    statusRow("고빈도 사용자 (14일 중 10일 이상)", `${fmtInt(h.daily_habit_users)}명`);

  const c = u.calendar;
  const cats = (c.top_categories ?? []).map((x) => `${esc(x.category)} ${fmtInt(x.cnt)}`).join(" · ");
  $("usage-calendar").innerHTML = reach(c.couples_14d, "일정 생성 커플 (14일)") +
    statusRow("생성자 · 일정 수 (14일)", `${fmtInt(c.users_14d)}명 · ${fmtInt(c.events_14d)}개`) +
    statusRow("공유 일정 비율", `${c.shared_pct ?? "—"}%`) +
    statusRow("반복 일정 비율", `${c.series_pct ?? "—"}%`) +
    statusRow("분류(이모지) 지정 비율", `${c.categorized_pct ?? "—"}%`) +
    statusRow("캘린더 연동 사용자", `Apple ${fmtInt(c.apple_users)} · Google ${fmtInt(c.google_users)}`) +
    (cats ? statusRow("자주 쓰는 이모지 (30일)", cats) : "") +
    `<div class="muted hint">가입 시 자동 생성되는 일정과 연동 일정은 제외하고, 앱에서 직접 만든 일정만 집계합니다. 비율은 최근 30일 기준입니다.</div>`;

  const n = u.notes;
  $("usage-notes").innerHTML = reach(n.couples_14d, "쪽지 작성 커플 (14일)") +
    statusRow("쪽지 · 답장 (14일)", `${fmtInt(n.notes_14d)} · ${fmtInt(n.replies_14d)}`) +
    statusRow("손그림 비율", `${n.drawing_pct ?? "—"}%`) +
    statusRow("답장률", `${n.replied_pct ?? "—"}%`) +
    statusRow("첫 답장까지 소요 시간 (중앙값)", n.median_reply_minutes != null ? fmtMinutes(n.median_reply_minutes) : "—");

  const b = u.bucket;
  $("usage-bucket").innerHTML = reach(b.couples_14d, "버킷 추가 커플 (14일)") +
    statusRow("추가된 버킷 (14일)", fmtInt(b.ideas_14d)) +
    statusRow("링크 저장 비율", `${b.link_pct ?? "—"}%`) +
    statusRow("사진 포함 비율", `${b.image_pct ?? "—"}%`) +
    statusRow("태그 지정 비율", `${b.tagged_pct ?? "—"}%`);

  if (data.couple_detail) {
    // 커플 탭 '위젯 사용 현황'과 같은 판정이다(widgetStats) — 두 탭 숫자가 어긋나지 않게.
    const { both, one, kinds } = widgetStats(data.couple_detail.map(enrichCouple));
    const maxOn = Math.max(...kinds.map(([, v]) => v.on), 1);
    $("usage-widgets").innerHTML = reach(both + one, "위젯 사용 커플 (1명 이상)") + reach(both, "두 사람 모두 사용") +
      kinds.map(([k, v]) => `<div class="bar-row" tabindex="0" aria-label="${widgetName(k)}: 사용 중 ${v.on}명">
        <span>${widgetName(k)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(100 * v.on / maxOn).toFixed(1)}%"></div></div>
        <span class="muted">${fmtInt(v.on)}명${v.removed ? ` · 제거 ${fmtInt(v.removed)}` : ""} · 탭 ${fmtInt(v.taps)}</span></div>`).join("") +
      `<div class="muted hint">연결된 커플 기준 '사용 중' 사용자 수(최근 14일 확인, 제거 추정 제외)와 위젯별 누적 탭 수입니다. 커플 탭 '위젯 사용 현황'과 같은 기준입니다.</div>`;
  } else {
    const widgets = u.widgets ?? [];
    const maxW = Math.max(...widgets.map((w) => Number(w.installed_users)), 1);
    // 0133: 사람 수만으로는 커플 앱에서 위젯이 얼마나 퍼졌는지 모른다 — 커플 단위 도달을 위에 둔다.
    const wr = u.widget_reach;
    const reachHtml = wr ? reach(wr.couples_any, "위젯 사용 커플 (1명 이상)") + reach(wr.couples_both, "두 사람 모두 사용") : "";
    $("usage-widgets").innerHTML = reachHtml + (widgets.length ? widgets.map((w) =>
      `<div class="bar-row" tabindex="0" aria-label="${WIDGET_NAMES[w.kind] ?? w.kind}: ${w.installed_users}명">
        <span>${WIDGET_NAMES[w.kind] ?? esc(w.kind)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(100 * w.installed_users / maxW).toFixed(1)}%"></div></div>
        <span class="muted">${fmtInt(w.installed_users)}명 · 탭 ${fmtInt(w.taps_14d)}</span></div>`).join("") +
      `<div class="muted hint">최근 14일 홈 화면에서 확인된 사용자 수와, 최근 14일 안에 탭한 사용자의 누적 탭 수입니다.</div>`
      : `<div class="empty">최근 14일 위젯 기록 없음</div>`);
  }
  const mo = u.moments;
  if (Number(mo?.total)) {
    // 모먼트는 사람마다 한 장을 갈아 끼운다 — 장 수는 "올려 둔 사람", uploads가 실제로 찍어 올린 횟수다.
    $("usage-widgets").innerHTML += statusRow("모먼트", `업로드 사용자 ${fmtInt(mo.total)}명 · ${fmtInt(mo.couples)}쌍` +
      (mo.uploads != null ? ` · 누적 ${fmtInt(mo.uploads)}회 · 최근 7일 교체 ${fmtInt(mo.updated_7d)}명` : ""));
  }
  renderHours(data.activity_hours);
}
const fmtMinutes = (m) => {
  const v = Number(m);
  if (v < 60) return `${v}분`;
  if (v < 1440) return `${Math.round(v / 6) / 10}시간`;
  return `${Math.round(v / 144) / 10}일`;
};

// 시간대 격자: 줄마다 자기 최댓값으로 진하기를 정한다 — 앱 열기와 버킷은 규모가 달라
// 같은 눈금이면 버킷 줄이 통째로 흰색이 된다. 시각은 행동한 사람의 현지 시각.
const HOUR_ROWS = [["open", "앱 실행 (일 1회)"], ["events", "일정"], ["notes", "쪽지"], ["replies", "답장"], ["ideas", "버킷"]];
function renderHours(rows) {
  const el = $("usage-hours");
  if (!rows) { missingKey(el); return; }
  const by = {};
  for (const r of rows) by[`${r.feature}|${r.hour}`] = Number(r.cnt);
  const head = Array.from({ length: 24 }, (_, h) => `<th>${h % 3 === 0 ? h : ""}</th>`).join("");
  const body = HOUR_ROWS.map(([key, label]) => {
    const vals = Array.from({ length: 24 }, (_, h) => by[`${key}|${h}`] ?? 0);
    const max = Math.max(...vals, 1), sum = vals.reduce((a, b) => a + b, 0);
    const peak = vals.indexOf(Math.max(...vals));
    return `<tr><td>${label} <span class="muted">${fmtInt(sum)}</span></td>${vals.map((v, h) =>
      `<td class="cell" title="${label} ${h}시: ${v}" style="background:color-mix(in srgb, var(--tide) ${Math.round(100 * v / max)}%, transparent)"></td>`).join("")}
      <td class="muted peak">${sum ? `${peak}시` : ""}</td></tr>`;
  }).join("");
  el.innerHTML = `<table class="hours"><thead><tr><th></th>${head}<th>피크</th></tr></thead><tbody>${body}</tbody></table>
    <div class="muted hint">최근 30일, 사용자 현지 시각 기준입니다. 행마다 가장 많은 시간대를 가장 진하게 표시합니다.</div>`;
}


// 체험이 끝난(또는 끝나기 전에 결제한) 커플 중 지금 유료인 비율. 평생 이용권 중 시드·베타 선물은
// 결제가 아니라 분자·분모 모두에서 뺀다. 첫 체험 중인 커플은 아직 결정 전이라 넣지 않는다.
// 재체험 중인 커플은 첫 체험을 결제 없이 마친 커플이라 분모에 넣는다 — 빼면 행사 기간에
// 분모만 쪼그라들어 전환율이 부푼다(10/11 모먼트 재체험 때 4.6%가 10.2%로 보였다).
function paidConversion(s, rows) {
  const lifetimePaid = (rows ?? []).filter((r) => r.state === "lifetime" && r.lifetime_source === "store").length;
  const paid = Number(s.subscribed) + lifetimePaid;
  const base = paid + Number(s.trial_over) + Number(s.promo_trial ?? 0);
  return { paid, base, pct: base ? Math.round(1000 * paid / base) / 10 : null };
}

function renderRevenue(data) {
  const s = data.membership_summary, rows = data.membership_rows;
  if (!s || !rows) { missingKey($("membership-dist")); missingKey($("membership-table")); return; }
  const conv = paidConversion(s, rows);
  const dist = [
    ["평생 이용권", Number(s.lifetime)], ["체험 중", Number(s.trial_active)],
    ...(Number(s.promo_trial) ? [["재체험 중 (행사)", Number(s.promo_trial)]] : []),
    ["구독 중", Number(s.subscribed)], ["체험 종료 (미결제)", Number(s.trial_over)],
  ];
  const max = Math.max(...dist.map(([, v]) => v), 1);
  $("membership-dist").innerHTML = dist.map(([label, v]) =>
    `<div class="bar-row" tabindex="0" aria-label="${label}: ${v}쌍">
       <span>${label}</span>
       <div class="bar-track"><div class="bar-fill" style="width:${(100 * v / max).toFixed(1)}%"></div></div>
       <span class="muted">${fmtInt(v)}</span></div>`).join("") +
    (conv.pct != null ? statusRow("유료 전환율", `${conv.pct}% <span class="muted">· ${fmtInt(conv.paid)}/${fmtInt(conv.base)}쌍</span>`) +
      `<div class="muted hint">구독 중 + 평생 이용권 구매 커플 ÷ (그 커플 + 체험 종료 미결제 커플 + 재체험 중 커플). 첫 체험 중인 커플과 시드·베타 선물 평생 이용권은 제외합니다.</div>` : "");

  const dday = (iso) => {
    const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
    return d < 0 ? "만료" : `D-${d}`;
  };
  const rowHtml = (r) => `<tr>
      <td>${esc(r.member_one)} · ${esc(r.member_two)}${r.connected ? "" : ` <span class="muted">(연결 해제)</span>`}</td>
      <td><span class="badge plus">${MEMBERSHIP_BADGE[r.state] ?? r.state}</span>${r.promo ? ` <span class="muted">${esc(PROMO_NAMES[r.promo] ?? r.promo)}</span>` : ""}</td>
      <td title="${r.expires_at ?? ""}">${r.expires_at ? dday(r.expires_at) : "—"}</td>
      <td class="muted">${r.lifetime_source ? (LIFETIME_SOURCE[r.lifetime_source] ?? r.lifetime_source) : ""}</td>
    </tr>`;
  // 체험 종료(미결제)는 100쌍이 넘고 만료·출처 칸이 비어 있다. 다 펼쳐 두면 할 일이 있는 체험 중·
  // 구독·평생권이 그 밑에 묻힌다 — 접어 두고 숫자만 보인다.
  const head = `<thead><tr><th>커플</th><th>상태</th><th>만료</th><th>출처</th></tr></thead>`;
  // 재체험 커플도 같은 이유로 접는다 — 행사 하나가 100쌍을 한꺼번에 열면 첫 체험 커플이 묻힌다.
  const open = rows.filter((r) => r.state !== "trial_over" && r.state !== "promo_trial");
  const promo = rows.filter((r) => r.state === "promo_trial");
  const over = rows.filter((r) => r.state === "trial_over");
  const fold = (label, list) => list.length ? `<details class="unpaired"><summary>${label} ${fmtInt(list.length)}쌍</summary>
       <table>${head}<tbody>${list.map(rowHtml).join("")}</tbody></table></details>` : "";
  $("membership-table").innerHTML = `<table>${head}<tbody>${open.map(rowHtml).join("")}</tbody></table>` +
    fold("재체험 중 (행사)", promo) + fold("체험 종료 (미결제)", over);
}

// ── 개요: 들어오자마자 봐야 할 여섯 숫자 ─────────────────────────────────────
// 모두 "어제까지 다 찬 7일"(UTC)을 직전 7일과 견준다. 오늘을 넣으면 반나절치가 섞여 매일
// 줄어든 것처럼 보인다(isPartialDay와 같은 이유). 창은 부를 때마다 새로 잡는다 — 탭을 하루
// 넘게 열어 둘 수 있다.
const DAY_MS = 86400000;
const utcDaysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
const weekWindows = () => ({ cur: [utcDaysAgo(7), utcDaysAgo(1)], prev: [utcDaysAgo(14), utcDaysAgo(8)] });
const inWindow = (day, [from, to]) => day >= from && day <= to;
const isoDay = (iso) => new Date(iso).toISOString().slice(0, 10);

// 증감 칩. 직전 값이 작으면 비율이 요동치므로(2→4가 +100%) 칩 없이 직전 값만 적는다. 값이 개수가 아니면
// (원화 금액) "작다"를 값으로 잴 수 없어서 호출부가 enough로 표본이 충분한지 알려 준다.
function change(cur, prev, { upIsGood = true, points = false, prevText, prevLabel = "직전 7일", enough } = {}) {
  if (cur == null || prev == null) return "";
  const shown = `<span class="muted">${prevLabel} ${prevText ?? (points ? `${prev}%` : fmtInt(prev))}</span>`;
  const diff = points ? cur - prev : ((enough ?? prev >= 5) && prev > 0 ? 100 * (cur - prev) / prev : null);
  if (diff == null) return shown;
  if (Math.abs(diff) < (points ? 2 : 5)) return `<span class="chg">변화 없음</span> ${shown}`;
  const good = (diff > 0) === upIsGood;
  return `<span class="chg ${good ? "good" : "bad"}">${diff > 0 ? "▲" : "▼"} ${Math.abs(Math.round(diff))}${points ? "%p" : "%"}</span> ${shown}`;
}
const kpiTile = (label, value, delta, lines) =>
  `<div class="tile kpi"><span class="muted">${label}</span><b>${value}</b>` +
  (delta ? `<span class="kpi-delta">${delta}</span>` : "") +
  lines.filter(Boolean).map((l) => `<span class="kpi-ctx">${l}</span>`).join("") + `</div>`;

function renderSummary(data) {
  const W = weekWindows();
  const sumIn = (rows, key, win) => rows.filter((r) => inWindow(r.day, win)).reduce((n, r) => n + Number(r[key]), 0);
  const sd = data.signups_daily ?? [], days = data.actives_daily ?? [];
  const detail = data.couple_detail, unpaired = data.unpaired_accounts;
  const tiles = [];

  if (sd.length) {
    const cur = sumIn(sd, "signups", W.cur), prev = sumIn(sd, "signups", W.prev);
    const byCountry = {};
    for (const r of data.signups_by_country_daily ?? []) {
      if (inWindow(r.day, W.cur)) byCountry[r.country_code] = (byCountry[r.country_code] ?? 0) + Number(r.signups);
    }
    const top = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([cc, n]) => `${cc === "??" ? "국가 미상" : countryName(cc)} ${fmtInt(n)}`).join(" · ");
    tiles.push(kpiTile("신규 가입", `${fmtInt(cur)}명`, change(cur, prev),
      [top, `누적 계정 ${fmtInt(data.usage_totals?.accounts)}`]));
  }

  // 연결의 92%가 가입 24시간 안에 일어난다(2026-10 실측). 그래서 오늘 가입자는 빼고, 어제까지 7일
  // 가입자 중 지금 연결돼 있는 비율을 본다. 온보딩이 잘 되는지를 가장 먼저 말해 주는 숫자다.
  if (detail && unpaired) {
    const rate = (win) => {
      const conn = detail.flatMap((c) => c.members ?? []).filter((m) => m.joined_at && inWindow(isoDay(m.joined_at), win)).length;
      const wait = unpaired.filter((u) => u.created_at && inWindow(isoDay(u.created_at), win)).length;
      return { conn, wait, pct: conn + wait ? Math.round(100 * conn / (conn + wait)) : null };
    };
    const cur = rate(W.cur), prev = rate(W.prev);
    tiles.push(kpiTile("파트너 연결률", cur.pct != null ? `${cur.pct}%` : "—",
      prev.pct != null ? change(cur.pct, prev.pct, { points: true }) : "",
      [`연결 ${fmtInt(cur.conn)}명 · 미연결 ${fmtInt(cur.wait)}명`, "같은 기간 가입자 기준"]));
  }

  // 하루치는 요일 따라 출렁여서 7일 평균을 크게 두고, 어제·오늘은 옆에 작게.
  if (days.length) {
    const avg = (win) => {
      const r = days.filter((d) => inWindow(d.day, win));
      return r.length ? r.reduce((n, d) => n + Number(d.dau), 0) / r.length : null;
    };
    const cur = avg(W.cur), prev = avg(W.prev);
    const yesterday = days.find((d) => d.day === utcDaysAgo(1))?.dau;
    const today = days.find((d) => d.day === utcToday())?.dau ?? 0;
    tiles.push(kpiTile("일간 활성 사용자 <span class=\"muted\">(7일 평균)</span>",
      cur != null ? `${fmtInt(Math.round(cur))}명` : "—",
      change(cur, prev, { prevText: prev != null ? `${fmtInt(Math.round(prev))}명` : "—" }),
      [`어제 ${fmtInt(yesterday ?? 0)} · 오늘 현재 ${fmtInt(today)}`, `주간 활성 사용자 ${fmtInt(data.actives_7d)}명`]));
  }

  // 커플 앱이 살아 있는지는 "두 사람이 같은 주에 들어왔나"다. 활동일은 오늘까지 14일치만 오므로
  // 이 칸만 오늘을 넣은 7일(0~6일 전)과 7~13일 전을 견주고, 분모는 그 주 끝에 연결돼 있던 커플이다.
  if (detail) {
    const curWin = [utcDaysAgo(6), utcToday()], prevWin = [utcDaysAgo(13), utcDaysAgo(7)];
    const seen = (m, win) => (m.active_days_14 ?? []).some((d) => inWindow(d, win));
    const pairsAt = (win) => detail.filter((c) => (c.members ?? []).length === 2 && isoDay(c.connected_at) <= win[1]);
    const both = (pairs, win) => pairs.filter((c) => c.members.every((m) => seen(m, win))).length;
    const curPairs = pairsAt(curWin), prevPairs = pairsAt(prevWin);
    const curBoth = both(curPairs, curWin), prevBoth = both(prevPairs, prevWin);
    const one = curPairs.filter((c) => c.members.filter((m) => seen(m, curWin)).length === 1).length;
    const pct = (n, d) => d ? Math.round(100 * n / d) : null;
    tiles.push(kpiTile("두 사람 모두 접속한 커플 <span class=\"muted\">(7일)</span>",
      `${fmtInt(curBoth)}쌍 <small class="muted">/ ${fmtInt(curPairs.length)} · ${pct(curBoth, curPairs.length)}%</small>`,
      change(pct(curBoth, curPairs.length), pct(prevBoth, prevPairs.length), { points: true }),
      [`한 명만 ${fmtInt(one)}쌍 · 둘 다 미접속 ${fmtInt(curPairs.length - curBoth - one)}쌍`]));
  }

  // 결제 흐름은 매출 탭이 맡고, 여기는 "지금 돈을 내는 커플"과 곧 결정할 커플만.
  const s = data.membership_summary, mrows = data.membership_rows ?? [];
  if (s) {
    const conv = paidConversion(s, mrows);
    const endsSoon = (state) => mrows.filter((m) => {
      const left = m.expires_at ? new Date(m.expires_at).getTime() - Date.now() : -1;
      return m.state === state && left > 0 && left < 7 * DAY_MS;
    }).length;
    const candidates = detail ? detail.map(enrichCouple).filter((r) => r.needs.some((n) => n.key === "convert")).length : 0;
    const paidSoon = endsSoon("subscribed");
    const pay = data.payment_health;
    const rev = revenueModel(data);
    // 곧 결정할 커플 한 줄. 매출 타일과 유료 커플 타일이 같은 줄을 쓴다 — 따로 베꼈다가 '구독 만료'가 빠졌다.
    const promoSoon = endsSoon("promo_trial");
    const decisions = `7일 내 체험 종료 ${fmtInt(endsSoon("trial_active"))}쌍` +
      (promoSoon ? ` · 재체험 종료 ${fmtInt(promoSoon)}쌍` : "") +
      (candidates ? ` · 전환 후보 ${fmtInt(candidates)}쌍` : "") +
      (paidSoon ? ` · 구독 만료 ${fmtInt(paidSoon)}쌍` : "");
    // 금액이 붙은 거래가 있을 때만 매출이 첫 숫자다. 처리방침 시행(11/10) 전에는 금액을 남기지 않아(0151) ₩0이 된다.
    if (rev?.priced) {
      tiles.push(kpiTile("매출 <span class=\"muted\">(최근 30일 결제액)</span>", fmtKRW(rev.last30),
        change(rev.last30, rev.prev30, { prevText: fmtKRW(rev.prev30), prevLabel: "직전 30일", enough: rev.prev30N >= 5 }),
        [`MRR ${fmtKRW(rev.mrr)} · 누적 ${fmtKRW(rev.total)}`,
         `유료 커플 ${fmtInt(conv.paid)}쌍` + (conv.pct != null ? ` · 전환율 ${conv.pct}% (${fmtInt(conv.paid)}/${fmtInt(conv.base)})` : ""),
         decisions]));
    } else tiles.push(kpiTile("유료 커플", `${fmtInt(conv.paid)}쌍`,
      conv.pct != null ? `<span class="muted">유료 전환율 ${conv.pct}% (${fmtInt(conv.paid)}/${fmtInt(conv.base)}쌍)</span>` : "",
      [decisions,
       pay ? `최근 30일 결제 ${fmtInt(pay.purchase_succeeded)}건 · 페이월 조회 ${fmtInt(pay.paywall_viewed)}명` : ""]));
  }

  // 탈퇴는 대부분 가입 직후다 — 서비스 불만보다 온보딩 신호로 읽는다.
  if (sd.length) {
    const cur = sumIn(sd, "deletions", W.cur), prev = sumIn(sd, "deletions", W.prev);
    const signups = sumIn(sd, "signups", W.cur);
    const del = data.deletions_recent ?? [];
    const quick = del.filter((d) => Number(d.hours_alive) <= 1).length;
    tiles.push(kpiTile("탈퇴", `${fmtInt(cur)}명`, change(cur, prev, { upIsGood: false }),
      [`같은 기간 가입 대비 ${signups ? Math.round(100 * cur / signups) : 0}%`,
       del.length ? `30일 탈퇴 중 가입 1시간 이내 ${Math.round(100 * quick / del.length)}%` : ""]));
  }

  $("summary-tiles").innerHTML = tiles.length ? tiles.join("") : `<div class="empty">데이터가 없습니다</div>`;
  renderSummaryVersions(data.app_versions_live);
  renderPromotions(data.promotion_outcomes);
  renderSparkline(days.slice(-30));
}

// 고친 버그가 사람들에게 닿았는지는 시스템 탭 바닥에 있었다. 출시 직후엔 이 줄이 가장 먼저 궁금하다.
function renderSummaryVersions(live) {
  const el = $("summary-versions");
  if (!live?.length) { el.innerHTML = ""; return; }
  const sorted = [...live].sort((a, b) => (b.app_version ?? "").localeCompare(a.app_version ?? "", undefined, { numeric: true }));
  const total = sorted.reduce((n, v) => n + Number(v.users), 0);
  el.innerHTML = `<span class="muted">현재 사용 버전</span> ` + sorted.map((v, i) =>
    `<span class="${i === 0 ? "" : "muted"}">${esc(v.app_version ?? "1.0.6 이하")} <b>${Math.round(100 * v.users / total)}%</b></span>`).join(" · ") +
    ` <span class="muted">(최근 14일 실행 · 알림 허용 ${fmtInt(total)}명 · <a href="#ops">시스템 탭</a>)</span>`;
}

// 재체험 같은 행사를 열면 결과가 개요에 바로 보여야 한다 — 손으로 쿼리하던 것(0147).
// 끝나고 14일이 지나면 접되 지우지는 않는다 — 결제는 체험이 끝난 뒤 늦게 붙고, 결과를 볼 곳이 여기뿐이다.
function renderPromotions(rows) {
  const all = rows ?? [];
  $("promotions-wrap").hidden = !all.length;
  if (!all.length) return;
  const isRecent = (p) => Date.now() - new Date(p.ends_at).getTime() < 14 * DAY_MS;
  const md = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`; };
  const pct = (n, d) => d ? ` <span class="muted">${Math.round(100 * n / d)}%</span>` : "";
  const block = (p) => {
    const left = Math.ceil((new Date(p.ends_at).getTime() - Date.now()) / DAY_MS);
    const n = Number(p.couples);
    return `<div class="promo-row"><b>${esc(PROMO_NAMES[p.promo] ?? p.promo)}</b>
      <span class="muted">${md(p.started_at)} ~ ${md(p.ends_at)} · ${left > 0 ? `D-${left}` : "종료"} · ${fmtInt(n)}쌍 (연결 유지 ${fmtInt(p.still_connected)})</span></div>
      <div class="tiles">
        <div class="tile"><span class="muted">돌아온 커플</span><b>${fmtInt(p.returned_couples)}쌍${pct(p.returned_couples, n)}</b><span class="muted">둘 다 ${fmtInt(p.both_returned)}쌍</span></div>
        <div class="tile"><span class="muted">모먼트 올린 커플</span><b>${fmtInt(p.moment_couples)}쌍${pct(p.moment_couples, n)}</b></div>
        <div class="tile"><span class="muted">결제한 커플</span><b>${fmtInt(p.paid_couples)}쌍${pct(p.paid_couples, n)}</b></div>
      </div>`;
  };
  const past = all.filter((p) => !isRecent(p));
  $("promotions").innerHTML = all.filter(isRecent).map(block).join("") +
    (past.length ? `<details class="unpaired"><summary>끝난 지 14일 넘은 행사 ${fmtInt(past.length)}개</summary>${past.map(block).join("")}</details>` : "") +
    `<div class="muted hint">받은 시각 이후 기준입니다. 돌아온 커플: 한 명 이상 앱을 연 커플. 결제: 앱이 보고한 결제 성공, 애플이 확인한 스토어 거래, 평생 이용권 기록 중 하나.</div>`;
}

// 요약용 축약 차트 — 축·툴팁 없이 모양만. 자세한 건 추세 탭이 담당한다.
function renderSparkline(rows) {
  if (!rows.length) { $("summary-spark").innerHTML = `<div class="empty">데이터가 없습니다</div>`; return; }
  const w = 640, h = 80, max = Math.max(...rows.map((r) => r.dau), 1);
  const x = (i) => i * w / Math.max(rows.length - 1, 1);
  const y = (v) => h - 6 - v * (h - 12) / max;
  const partial = isPartialDay(rows);
  const solid = partial ? rows.slice(0, -1) : rows;
  const path = solid.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.dau).toFixed(1)}`).join(" ");
  const n = rows.length, last = rows[n - 1];
  const tail = partial
    ? `<path d="M${x(n - 2).toFixed(1)},${y(rows[n - 2].dau).toFixed(1)} L${x(n - 1).toFixed(1)},${y(last.dau).toFixed(1)}"
             fill="none" stroke="var(--sunset)" stroke-width="2" stroke-dasharray="3 4" opacity="0.7"/>` : "";
  $("summary-spark").innerHTML =
    `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" role="img"
          aria-label="최근 30일 DAU, 마지막 값 ${last.dau}명${partial ? "(오늘, 진행 중)" : ""}">
       <path d="${path}" fill="none" stroke="var(--sunset)" stroke-width="2" stroke-linejoin="round"/>
       ${tail}
       <circle cx="${x(n - 1).toFixed(1)}" cy="${y(last.dau).toFixed(1)}" r="3.5"
               fill="${partial ? "var(--surface)" : "var(--sunset)"}" stroke="var(--sunset)" stroke-width="1.5"/>
     </svg>`;
}

function renderDau(rows) {
  if (!rows.length) { $("dau").innerHTML = `<div class="empty">데이터가 없습니다</div>`; return; }
  const w = 640, h = 220, padL = 34, padR = 16, padT = 20, padB = 28;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const max = Math.max(...rows.map((r) => r.dau), 1);
  const x = (i) => padL + i * plotW / Math.max(rows.length - 1, 1);
  const y = (v) => padT + plotH - v * plotH / max;
  const partial = isPartialDay(rows);
  const solid = partial ? rows.slice(0, -1) : rows;
  const path = solid.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.dau).toFixed(1)}`).join(" ");
  const areaPath = `${path} L${x(solid.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)}` +
    ` L${x(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
  const last = rows[rows.length - 1];
  const n = rows.length;
  // 진행 중인 오늘은 점선으로 잇고 속 빈 점 — 다 찬 날과 같은 무게로 읽히지 않게.
  const tail = partial
    ? `<path d="M${x(n - 2).toFixed(1)},${y(rows[n - 2].dau).toFixed(1)} L${x(n - 1).toFixed(1)},${y(last.dau).toFixed(1)}"
             fill="none" stroke="var(--sunset)" stroke-width="2" stroke-dasharray="3 4" opacity="0.7"/>` : "";
  // 눈금 3개(0·중간·최대) — 대시 없는 실선 헤어라인, 값은 왼쪽에 작게.
  const gridVals = [0, Math.round(max / 2), max];
  const grid = gridVals.map((v) => `
      <line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${w - padR}" y2="${y(v).toFixed(1)}"
            stroke="var(--line)" stroke-width="1"/>
      <text x="${padL - 8}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle"
            fill="var(--secondary-ink)" font-size="11">${v}</text>`).join("");
  // x축은 시작/중간/끝 날짜만 — 매 점에 라벨을 달면 아무도 못 읽는다.
  const tickIdx = [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
  const fmt = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  const xLabels = [...new Set(tickIdx)].map((i) => `
      <text x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="var(--secondary-ink)"
            font-size="11">${fmt(rows[i].day)}</text>`).join("");
  $("dau").innerHTML = `
    <div class="chart-wrap">
      <svg id="dau-svg" viewBox="0 0 ${w} ${h}" style="width:100%; height:auto; display:block" role="img"
           aria-label="일별 활성 사용자, ${rows[0].day}부터 ${last.day}까지, 최근 값 ${last.dau}명">
        ${grid}
        <path d="${areaPath}" fill="var(--sunset)" opacity="0.1" stroke="none"/>
        <path d="${path}" fill="none" stroke="var(--sunset)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${tail}
        <circle cx="${x(rows.length - 1).toFixed(1)}" cy="${y(last.dau).toFixed(1)}" r="4"
                fill="${partial ? "var(--surface)" : "var(--sunset)"}" stroke="${partial ? "var(--sunset)" : "var(--surface)"}" stroke-width="2"/>
        <text x="${x(rows.length - 1).toFixed(1)}" y="${(y(last.dau) - 10).toFixed(1)}" text-anchor="end"
              fill="var(--ink)" font-size="12" font-weight="600">${last.dau}${partial ? " · 진행 중" : ""}</text>
        ${xLabels}
        <line id="dau-crosshair" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="var(--secondary-ink)"
              stroke-width="1" opacity="0"/>
        <circle id="dau-hover-dot" r="4" fill="var(--sunset)" stroke="var(--surface)" stroke-width="2" opacity="0"/>
        <rect id="dau-hit" x="${padL}" y="0" width="${plotW}" height="${h}" fill="transparent"/>
      </svg>
      <div id="dau-tooltip" class="chart-tooltip"></div>
    </div>`;
  wireDauTooltip(rows, { w, h, padL, plotW, x, y });
}

function wireDauTooltip(rows, geo) {
  const svg = $("dau-svg"), hit = $("dau-hit"), crosshair = $("dau-crosshair");
  const dot = $("dau-hover-dot"), tooltip = $("dau-tooltip");
  const nearestIndex = (localX) => {
    const step = geo.plotW / Math.max(rows.length - 1, 1);
    const i = Math.round((localX - geo.padL) / step);
    return Math.min(Math.max(i, 0), rows.length - 1);
  };
  const onMove = (evt) => {
    const rect = svg.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const localX = (clientX - rect.left) * (geo.w / rect.width);
    const i = nearestIndex(localX);
    const r = rows[i];
    const px = geo.x(i), py = geo.y(r.dau);
    crosshair.setAttribute("x1", px); crosshair.setAttribute("x2", px); crosshair.setAttribute("opacity", "1");
    dot.setAttribute("cx", px); dot.setAttribute("cy", py); dot.setAttribute("opacity", "1");
    tooltip.style.opacity = "1";
    tooltip.textContent = `${fmtDauDate(r.day)} · ${r.dau}명${r.day === utcToday() ? " (진행 중)" : ""}`;
    const scale = rect.width / geo.w;
    tooltip.style.left = (px * scale) + "px";
    tooltip.style.top = (py * scale - 10) + "px";
  };
  const onLeave = () => {
    crosshair.setAttribute("opacity", "0");
    dot.setAttribute("opacity", "0");
    tooltip.style.opacity = "0";
  };
  hit.addEventListener("pointermove", onMove);
  hit.addEventListener("pointerdown", onMove);
  hit.addEventListener("pointerleave", onLeave);
}
function fmtDauDate(d) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

// 이정표는 차례로 밟는 단계가 아니라 각자의 도달이다. SQL 순서(첫 일정 25% → 알림 허용 54%)대로
// 그리면 막대가 줄었다 다시 늘어 퍼널로 읽히지 않는다 — 도달이 많은 쪽부터 놓는다.
const MILESTONE_ORDER = ["signed_up", "profile_created", "partner_connected", "push_enabled", "first_event", "first_note", "first_idea"];
const orderMilestones = (rows) => [...rows].sort((a, b) =>
  (MILESTONE_ORDER.indexOf(a.name) + 1 || 99) - (MILESTONE_ORDER.indexOf(b.name) + 1 || 99));

function renderFunnel(el, rows) {
  if (!rows.length || rows.every((r) => !Number(r.users))) {
    el.innerHTML = `<div class="empty">데이터가 없습니다</div>`; return;
  }
  const max = Math.max(...rows.map((r) => Number(r.users)), 1);
  el.innerHTML = rows.map((r) => {
    const users = Number(r.users);
    const pct = r.pct_of_start != null ? ` · ${r.pct_of_start}%` : "";
    const label = KOREAN_STEP_NAMES[r.name] ?? r.name;
    return `<div class="bar-row" tabindex="0" role="group" aria-label="${label}: ${users}명${pct}">
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(100 * users / max).toFixed(1)}%"></div></div>
      <span class="muted">${users}${pct}</span>
    </div>`;
  }).join("");
}

function renderRetention(rows) {
  if (!rows.length) { $("retention").innerHTML = `<div class="empty">데이터가 없습니다</div>`; return; }
  // 주의 시작일로 칸의 상태를 정한다. 기기 시계가 앞선 하트비트가 하나만 섞여도 격자가 미래
  // 주까지 늘어났다(0140) — 서버에서 막았지만, 아직 오지 않은 주를 0%로 그리지 않는 건
  // 화면도 지킨다. 진행 중인 주는 다 차지 않은 값이라 기울여 구분한다.
  const DAY = 86400000, today = Date.parse(utcToday() + "T00:00:00Z");
  const weekStart = (w, n) => Date.parse(w + "T00:00:00Z") + n * 7 * DAY;
  const started = rows.filter((r) => weekStart(r.cohort_week, r.week_number) <= today);
  const weeks = [...new Set(started.map((r) => r.cohort_week))].sort();
  const maxN = Math.max(0, ...started.map((r) => r.week_number));
  const byKey = Object.fromEntries(started.map((r) => [`${r.cohort_week}|${r.week_number}`, r]));
  const head = Array.from({ length: maxN + 1 }, (_, n) => `<th>W${n}</th>`).join("");
  let anyPartial = false;
  const body = weeks.map((w) => {
    const size = started.find((r) => r.cohort_week === w).cohort_size;
    const cells = Array.from({ length: maxN + 1 }, (_, n) => {
      const r = byKey[`${w}|${n}`];
      if (!r) return `<td class="muted">·</td>`;
      const pct = Math.round(100 * r.active_users / r.cohort_size);
      const inProgress = today < weekStart(w, n + 1);
      if (inProgress) anyPartial = true;
      // 진하기가 곧 잔존율 — 숫자보다 모양으로 먼저 읽힌다. 글자색은 그 진하기에
      // 맞춰 매번 다시 고른다(textColorForFill) — 그래야 옅은 칸도 진한 칸도 읽힌다.
      return `<td style="background:color-mix(in srgb, var(--tide) ${pct}%, transparent); color:${textColorForFill(pct)}${inProgress ? "; font-style:italic" : ""}"
                  ${inProgress ? `title="진행 중인 주 — 아직 다 차지 않은 값"` : ""}>${pct}%${inProgress ? "…" : ""}</td>`;
    }).join("");
    return `<tr><td>${w} (${size}명)</td>${cells}</tr>`;
  }).join("");
  $("retention").innerHTML =
    `<table><thead><tr><th>코호트</th>${head}</tr></thead><tbody>${body}</tbody></table>
     <div class="retention-key"><span class="muted">0%</span><span class="ramp"></span><span class="muted">100%</span></div>` +
    (anyPartial ? `<div class="muted hint">'…' 표시는 진행 중인 주로, 값이 더 오를 수 있습니다.</div>` : "");
}

// 국가별 신규 가입: 날짜(행) × 국가(열). 14일 합계 상위 여섯 국가만 열로 두고 나머지는 '기타'.
// 칸 진하기는 그 국가 열의 최댓값 기준 — 대만 글 다음 날처럼 한 국가만 튄 날이 바로 보인다.
function renderSignupsByCountry(rows) {
  const el = $("signups-country");
  if (!rows) { missingKey(el); return; }
  const DAY = 86400000, today = Date.parse(utcToday() + "T00:00:00Z");
  const days = Array.from({ length: 14 }, (_, i) => new Date(today - i * DAY).toISOString().slice(0, 10));
  const totals = {};
  const by = {};
  for (const r of rows) {
    const n = Number(r.signups);
    totals[r.country_code] = (totals[r.country_code] ?? 0) + n;
    by[`${r.day}|${r.country_code}`] = n;
  }
  if (!Object.keys(totals).length) { el.innerHTML = `<div class="empty">최근 14일 신규 가입 없음</div>`; return; }
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  const label = (c) => c === "??" ? `미정 <span class="muted">(도시 선택 전)</span>` : `${countryName(c)} <span class="muted">${esc(c)}</span>`;
  const colMax = Object.fromEntries(top.map((c) => [c, Math.max(...days.map((d) => by[`${d}|${c}`] ?? 0), 1)]));
  const others = (d) => rows.filter((r) => r.day === d && !top.includes(r.country_code)).reduce((s, r) => s + Number(r.signups), 0);
  const total = (d) => rows.filter((r) => r.day === d).reduce((s, r) => s + Number(r.signups), 0);
  const shade = (n, max) => {
    if (!n) return `<td class="muted">·</td>`;
    const pct = Math.round(100 * n / max);
    return `<td style="background:color-mix(in srgb, var(--tide) ${pct}%, transparent); color:${textColorForFill(pct)}">${fmtInt(n)}</td>`;
  };
  const fmtDay = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC" });
  el.innerHTML = `<table><thead><tr><th>날짜</th>${top.map((c) => `<th>${label(c)}</th>`).join("")}<th>기타</th><th>합계</th></tr></thead>
    <tbody>${days.map((d) => `<tr><td>${fmtDay(d)}${d === utcToday() ? ` <span class="muted">· 진행 중</span>` : ""}</td>
      ${top.map((c) => shade(by[`${d}|${c}`] ?? 0, colMax[c])).join("")}
      <td class="muted">${others(d) || "·"}</td><td><b>${fmtInt(total(d))}</b></td></tr>`).join("")}</tbody></table>
    <div class="muted hint">UTC 날짜 기준이며, 국가는 온보딩에서 선택한 도시로 판정합니다. 탈퇴한 계정은 집계에서 빠집니다.</div>`;
}

// 연결 후 잔존(커플 단위). 판정할 만큼 시간이 지난 커플만 분모로 쓴다 — 진행 중인 주가
// 낮게 보이지 않게(리텐션과 같은 이유). "…"는 분모가 그 주 커플 전체보다 작다는 뜻이다.
function renderSurvival(rows) {
  const el = $("survival");
  if (!rows) { missingKey(el); return; }
  if (!rows.length) { el.innerHTML = `<div class="empty">데이터가 없습니다</div>`; return; }
  const cell = (n, d, all, bad) => {
    n = Number(n); d = Number(d); all = Number(all);
    if (!d) return `<td class="muted">판정 전</td>`;
    const pct = Math.round(100 * n / d);
    const partial = d < all;
    return `<td title="${n}/${d}쌍${partial ? ` · 전체 ${all}쌍 중 ${d}쌍 판정` : ""}"${bad && pct >= 40 ? ` style="color:var(--error)"` : ""}>
      ${pct}% <span class="muted">(${n}/${d}${partial ? "…" : ""})</span></td>`;
  };
  el.innerHTML = `<table><thead><tr><th>연결 주차</th><th>연결 커플</th><th>2일 내 이탈</th><th>체험 기간 이후 사용</th></tr></thead>
    <tbody>${[...rows].sort((a, b) => b.cohort_week.localeCompare(a.cohort_week)).map((r) => `<tr><td>${r.cohort_week}</td><td>${fmtInt(r.couples)}쌍</td>
      ${cell(r.gone_2d, r.judged_2d, r.couples, true)}${cell(r.past_trial, r.judged_8d, r.couples, false)}</tr>`).join("")}</tbody></table>
    <div class="muted hint">2일 내 이탈: 연결 다음 날까지만 접속하고 그 뒤로 두 사람 모두 접속 기록이 없는 커플. 체험 기간 이후 사용: 연결 8일 뒤에도 한 명 이상 접속한 커플(7일 체험 종료 이후).
    출시(9/15) 이후 연결된 커플 중 현재 연결이 유지된 커플만 셉니다.</div>`;
}

function renderActivation(rows) {
  if (!rows.length) { $("activation").innerHTML = `<div class="empty">데이터가 없습니다</div>`; return; }
  // 활성화 두 지표의 계측은 App Store 출시(2026-09-15 KST)와 함께 들어갔다. 그 전 주
  // 코호트(TestFlight)는 기록이 없을 뿐인데 0%로 그리면 "아무도 활성화 안 됨"으로 읽힌다.
  // 줄마다 "계측 없음"을 적어 두니 표 절반이 빈 줄이었다 — 빼고 몇 개 뺐는지만 적는다.
  const LAUNCH_WEEK = "2026-09-14";
  const launched = rows.filter((r) => r.cohort_week >= LAUNCH_WEEK);
  const hidden = rows.length - launched.length;
  const body = launched.map((r) =>
    `<tr><td>${r.cohort_week}</td><td>${r.cohort_size}</td><td>${r.activated}</td><td>${r.pct}%</td></tr>`).join("");
  $("activation").innerHTML =
    `<table><thead><tr><th>코호트</th><th>가입</th><th>활성화</th><th>비율</th></tr></thead><tbody>${body}</tbody></table>` +
    `<div class="muted hint">활성화: 온보딩에서 '${KOREAN_STEP_NAMES.dual_timezone_event_viewed}'과 '${KOREAN_STEP_NAMES.first_notification_configured}'을 모두 거친 사용자입니다.` +
    (hidden ? ` 출시 전(TestFlight) 코호트 ${hidden}개는 계측이 없어 제외했습니다.` : "") + `</div>`;
}

// ── 생태계: 흐름·상태·맥박·기능을 개요 한 화면에 ─────────────────────────────
// 개요의 숫자를 누르면 커플 탭이 그 커플들만 보여 준다("직접 까 보기"). 판정은 커플 탭 표와
// 같은 enrichCouple 결과를 쓴다 — 개요와 표가 다른 숫자를 말하지 않게.
let ecoFilter = null; // { label, ids: Set<couple_id> }
function drillCouples(label, ids) {
  ecoFilter = { label, ids: new Set(ids) };
  needFilter = null;
  openCouple = ids.length === 1 ? ids[0] : null;
  renderCouples(lastData);
  selectTab("couples");
  // 탭 막대가 위에 붙어 있어서 그만큼 덜 내린다 — 안 그러면 '고른 커플' 띠가 막대 밑에 숨는다.
  const bar = document.querySelector(".tabbar")?.getBoundingClientRect().height ?? 0;
  window.scrollTo({ top: $("couple-table").getBoundingClientRect().top + window.scrollY - bar - 12 });
}
const LAUNCH_AT = Date.parse("2026-09-15T00:00:00+09:00"); // 출시 — 그 전 연결은 TestFlight 베타
const fmtKRW = (v) => `₩${Math.round(Number(v ?? 0)).toLocaleString("ko-KR")}`;
const HOUR_MS = 3600000;
function fmtLag(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60000))}분`;
  if (ms < 2 * DAY_MS) return `${Math.round(ms / HOUR_MS)}시간`;
  return `${Math.round(ms / DAY_MS)}일`;
}
const median = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
const ms = (iso) => iso ? new Date(iso).getTime() : null;

// 결제는 앱 이벤트·서버 기록 어느 쪽이든 하나면 된다 — 이벤트는 1.0.x 일부에서 빠졌고,
// 서버 기록은 베타 선물 평생권과 섞인다. 선물은 결제가 아니다.
function paidCoupleIDs(data) {
  const ids = new Set();
  for (const r of data.membership_rows ?? []) {
    if (!r.couple_id) continue;
    if (r.state === "subscribed" || (r.state === "lifetime" && r.lifetime_source === "store")) ids.add(r.couple_id);
  }
  for (const [id, j] of Object.entries(data.couple_journey ?? {})) if (j.purchased) ids.add(id);
  return ids;
}

// 연결한 커플이 어디까지 갔나. 8일이 지나야 '체험 이후에도 접속'을 판정할 수 있으므로
// 출시 이후 연결해 8일 넘은 커플만 센다 — 진행 중인 커플이 뒤 단계를 깎아 먹지 않게.
function journeyStages(data) {
  const paid = paidCoupleIDs(data);
  return [
    ["connected", "연결", () => true, (j) => 0],
    ["content", "첫 기록", (j) => !!(j.first_event || j.first_note || j.first_drawing || j.first_idea),
      (j) => Math.min(...[j.first_event, j.first_note, j.first_drawing, j.first_idea].filter(Boolean).map(ms)) - ms(j.connected)],
    ["both_back", "체험 이후에도 접속", (j) => ms(j.last_active) - ms(j.connected) > 8 * DAY_MS, () => null],
    ["paywall", "페이월 조회", (j) => !!j.first_paywall, (j) => ms(j.first_paywall) - ms(j.connected)],
    ["paid", "결제", (j, id) => paid.has(id), (j) => j.purchased ? ms(j.purchased) - ms(j.connected) : null],
  ];
}

function renderJourneyFunnel(data) {
  const el = $("eco-journey");
  const journey = data.couple_journey;
  if (!journey) { missingKey(el); return; }
  const cohort = Object.entries(journey).filter(([, j]) =>
    j.connected && ms(j.connected) >= LAUNCH_AT && Date.now() - ms(j.connected) > 8 * DAY_MS);
  if (!cohort.length) { el.innerHTML = `<div class="empty">판정할 커플이 아직 없습니다.</div>`; return; }
  const stages = journeyStages(data);
  let prevIDs = cohort.map(([id]) => id);
  const rows = stages.map(([key, label, test, lag], i) => {
    const reached = cohort.filter(([id, j]) => test(j, id));
    const reachedIDs = new Set(reached.map(([id]) => id));
    const stuck = prevIDs.filter((id) => !reachedIDs.has(id));
    const lagMed = median(reached.map(([, j]) => lag(j)));
    const out = { key, label, n: reached.length, ids: [...reachedIDs], stuck, lagMed, first: i === 0 };
    prevIDs = prevIDs.filter((id) => reachedIDs.has(id));
    return out;
  });
  const total = cohort.length;
  // 헤어지면 couples 행이 지워져 여정에서 사라진다(탈퇴로 지워진 쌍은 셀 수도 없다) — 숨기지 않고 따로 적는다.
  const left = data.journey_left_couples == null ? null : Number(data.journey_left_couples);
  el.innerHTML = `<div class="journey-funnel">${rows.map((r) => `
      <div class="jf-stage">
        <button class="jf-bar" data-stage="${r.key}" aria-label="${r.label} ${fmtInt(r.n)}쌍 ${Math.round(100 * r.n / total)}% — 도달한 커플 보기" title="${r.label}에 도달한 커플 보기">
          <span class="jf-fill" style="height:${(100 * r.n / total).toFixed(1)}%"></span>
          <span class="jf-num">${fmtInt(r.n)}<small>${Math.round(100 * r.n / total)}%</small></span>
        </button>
        <div class="jf-label"><b>${r.label}</b>
          ${r.lagMed != null && !r.first ? `<span class="muted">연결 후 중앙값 ${fmtLag(r.lagMed)}</span>` : ""}
          ${!r.first && r.stuck.length ? `<button class="link" data-stuck="${r.key}">여기서 멈춤 ${fmtInt(r.stuck.length)}쌍 →</button>` : ""}</div>
      </div>`).join("")}</div>
    <div class="muted hint">출시(9/15) 이후 연결해 8일 넘게 지난, 지금 연결된 커플 ${fmtInt(total)}쌍 기준${left ? ` — 같은 기간에 연결했다가 헤어진 ${fmtInt(left)}쌍은 빠져 있어 비율이 실제보다 높습니다` : ""}. 막대는 그 단계에 한 번이라도 도달한 커플, '여기서 멈춤'은 바로 앞 단계까지 모두 거쳤지만 이 단계에 못 온 커플입니다. 첫 기록: 직접 만든 일정·쪽지·낙서·버킷 중 하나.</div>`;
  el.querySelectorAll("[data-stage]").forEach((b) => b.onclick = () => {
    const r = rows.find((x) => x.key === b.dataset.stage);
    drillCouples(`여정: ${r.label} 도달`, r.ids);
  });
  el.querySelectorAll("[data-stuck]").forEach((b) => b.onclick = () => {
    const r = rows.find((x) => x.key === b.dataset.stuck);
    drillCouples(`여정: ${r.label} 전에 멈춤`, r.stuck);
  });
}

const MEMBERSHIP_ROWS = [
  ["trial_active", "체험 중"], ["promo_trial", "재체험 중"], ["trial_over", "체험 종료"],
  ["subscribed", "구독 중"], ["lifetime", "평생 이용권"],
];
const ACTIVITY_COLS = [
  ["both", "둘 다 접속", "최근 7일 두 사람 모두 접속"],
  ["one", "한 명만", "최근 7일 한 명만 접속"],
  ["idle", "7~21일 미접속", "두 사람 모두 7~21일째 미접속"],
  ["gone", "이탈", "두 사람 모두 21일 넘게 미접속"],
];
// 커플 탭의 상태(coupleStatus·휴면 규칙)와 같은 시계 — 각자의 last_active_at — 로 가른다. 하트비트의 UTC 날짜
// 창과 섞으면 엿새 전에 들어온 커플이 '7~21일 미접속' 칸에 들어가고, 눌러 보면 커플 탭은 '활성'이라고 했다.
function activityClass(r) {
  const seen = r.members.filter((m) => m.last_active_at && Date.now() - ms(m.last_active_at) <= 7 * DAY_MS).length;
  if (r.members.length === 2 && seen === 2) return "both";
  if (seen >= 1) return "one";
  return r.idleDays > 21 ? "gone" : "idle";
}

// 돈을 내는 커플이 살아 있는가, 체험 중인 커플이 붙고 있는가 — 둘을 한 칸에 겹쳐 본다.
function renderMatrix(rows) {
  const el = $("eco-matrix");
  const cell = {};
  for (const r of rows) {
    const k = `${r.membership_state}|${activityClass(r)}`;
    (cell[k] ??= []).push(r.couple_id);
  }
  const max = Math.max(...Object.values(cell).map((v) => v.length), 1);
  const used = MEMBERSHIP_ROWS.filter(([m]) => ACTIVITY_COLS.some(([a]) => cell[`${m}|${a}`]));
  const colTotal = (a) => used.reduce((n, [m]) => n + (cell[`${m}|${a}`]?.length ?? 0), 0);
  el.innerHTML = `<table class="matrix"><thead><tr><th></th>${ACTIVITY_COLS.map(([, label, why]) =>
      `<th title="${why}">${label}</th>`).join("")}<th>합계</th></tr></thead><tbody>
    ${used.map(([m, mLabel]) => {
      const total = ACTIVITY_COLS.reduce((n, [a]) => n + (cell[`${m}|${a}`]?.length ?? 0), 0);
      return `<tr><th>${mLabel}</th>${ACTIVITY_COLS.map(([a, aLabel]) => {
        const ids = cell[`${m}|${a}`] ?? [];
        const share = ids.length / max;
        return ids.length
          ? `<td><button class="mcell ${a}" style="--share:${share.toFixed(2)}" data-cell="${m}|${a}"
               aria-label="${mLabel} · ${aLabel} ${ids.length}쌍">${fmtInt(ids.length)}</button></td>`
          : `<td class="muted">·</td>`;
      }).join("")}<td class="muted">${fmtInt(total)}</td></tr>`;
    }).join("")}
    <tr class="total"><th>합계</th>${ACTIVITY_COLS.map(([a]) => `<td class="muted">${fmtInt(colTotal(a))}</td>`).join("")}
      <td class="muted">${fmtInt(rows.length)}</td></tr></tbody></table>
    <div class="muted hint">지금 연결된 커플을 멤버십 상태와 최근 접속으로 나눴습니다. 칸을 누르면 그 커플들을 커플 탭에서 봅니다.</div>`;
  el.querySelectorAll("[data-cell]").forEach((b) => b.onclick = () => {
    const [m, a] = b.dataset.cell.split("|");
    drillCouples(`${MEMBERSHIP_ROWS.find((x) => x[0] === m)[1]} · ${ACTIVITY_COLS.find((x) => x[0] === a)[1]}`, cell[b.dataset.cell]);
  });
}

// 커플 한 쌍이 한 줄, 하루가 한 칸. 진한 칸은 둘 다, 옅은 칸은 한 명만 들어온 날이다.
// 줄을 위아래로 훑으면 출시·행사·푸시가 만든 파도와, 둘이 함께 식어 가는 커플이 한눈에 보인다.
const PULSE_DAYS = 42;
function renderPulse(data, rows) {
  const el = $("eco-pulse");
  const pulse = data.couple_pulse;
  if (!pulse) { missingKey(el); return; }
  const days = Array.from({ length: PULSE_DAYS }, (_, i) => utcDaysAgo(PULSE_DAYS - 1 - i));
  const sorted = [...rows].sort((a, b) => new Date(b.connected_at) - new Date(a.connected_at));
  const promoDays = new Set((data.promotion_outcomes ?? []).map((p) => isoDay(p.started_at)));
  const head = days.map((d, i) => {
    const dt = new Date(d + "T00:00:00Z");
    const mark = i % 7 === 0 || i === days.length - 1;
    return `<span class="pd${promoDays.has(d) ? " promo" : ""}">${mark ? `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}` : ""}</span>`;
  }).join("");
  const line = (r) => {
    const p = pulse[r.couple_id] ?? {};
    const since = isoDay(r.connected_at);
    const cells = days.map((d) => {
      if (d < since) return `<i class="pre"></i>`;
      const n = Number(p[d] ?? 0);
      return `<i class="${n >= 2 ? "two" : n === 1 ? "one" : ""}" title="${d} · ${n}명"></i>`;
    }).join("");
    const names = r.members.map((m) => m.nickname).join(" · ");
    return `<button class="pulse-row" data-id="${r.couple_id}" title="${esc(names)} — 연결 ${since} · ${MEMBERSHIP_BADGE[r.membership_state] ?? ""}">
      <span class="pn">${esc(names)}</span><span class="pc">${cells}</span></button>`;
  };
  el.innerHTML = `<div class="pulse-legend muted"><i class="two"></i> 둘 다 <i class="one"></i> 한 명만 <i></i> 미접속 <i class="pre"></i> 연결 전
      ${promoDays.size ? ` · <span class="promo-key"></span> 행사 시작일` : ""} · 최근 연결 순</div>
    <div class="pulse"><div class="pulse-row head"><span class="pn"></span><span class="pc">${head}</span></div>
      ${sorted.map(line).join("")}</div>
    <div class="muted hint">최근 ${PULSE_DAYS}일, UTC 날짜 기준 일간 접속 기록입니다. 줄을 누르면 그 커플의 상세를 엽니다.</div>`;
  el.querySelectorAll(".pulse-row[data-id]").forEach((b) => b.onclick = () => {
    const r = rows.find((x) => x.couple_id === b.dataset.id);
    drillCouples(r.members.map((m) => m.nickname).join(" · "), [b.dataset.id]);
  });
}

// 이 기능을 쓰는 커플이 더 자주, 함께 들어오는가. 원래 열심인 커플이 기능도 많이 쓰므로
// 인과가 아니다 — 어느 기능 주변에 붙어 있는 커플이 모이는지 보는 첫 단서다.
const FEATURE_TESTS = [
  ["일정 직접 입력", (r) => r.events_14d > 0],
  ["캘린더 연동", (r) => r.members.some((m) => m.apple_calendar || m.google_calendar)],
  ["쪽지", (r) => r.notes_14d > 0],
  ["낙서", (r) => r.members.some((m) => Number(m.drawings_14d) > 0)],
  ["답장", (r) => r.members.some((m) => Number(m.replies_14d) > 0)],
  ["버킷", (r) => r.ideas_14d > 0],
  ["모먼트", (r) => r.members.some((m) => m.moment)],
  ["위젯 (한 명 이상)", (r) => r.widgetUsers > 0],
  ["기념일 설정", (r) => !!r.anniversary_date],
  ["둘 다 알림 허용", (r) => r.members.length === 2 && r.members.every((m) => m.push)],
];
// 이보다 적은 커플이 쓰는 기능은 배수가 요동친다 — 뒤로 보내고 표시한다.
const LIFT_MIN_COUPLES = 5;
function renderFeatureLift(rows) {
  const el = $("eco-features");
  // 14일 창을 다 채운 커플만 — 어제 연결한 커플은 접속일이 적을 수밖에 없다.
  const base = rows.filter((r) => r.members.length === 2 && Date.now() - new Date(r.connected_at).getTime() > 14 * DAY_MS);
  if (base.length < 10) { el.innerHTML = `<div class="empty">비교할 커플이 부족합니다.</div>`; return; }
  const avg = (xs) => xs.length ? xs.reduce((n, r) => n + Number(r.both_active_days_14 ?? 0), 0) / xs.length : null;
  const all = avg(base);
  // 안 쓰는 커플이 없으면(b가 null) 비교할 상대가 없으니 차이를 재지 않고 뒤로 보낸다.
  const gap = (x) => x.b == null ? -Infinity : x.a - x.b;
  const lines = FEATURE_TESTS.map(([label, test]) => {
    const yes = base.filter(test), no = base.filter((r) => !test(r));
    return { label, n: yes.length, a: avg(yes), b: avg(no), ids: yes.map((r) => r.couple_id), few: yes.length < LIFT_MIN_COUPLES };
  }).filter((x) => x.n).sort((x, y) => (x.few - y.few) || (gap(y) - gap(x)) || 0);
  const max = Math.max(...lines.flatMap((x) => [x.a ?? 0, x.b ?? 0]), 1);
  el.innerHTML = `<div class="lift-head muted"><span></span><span>쓰는 커플 · 안 쓰는 커플의 '둘 다 접속한 날' (14일 평균)</span><span>차이</span></div>` +
    lines.map((x) => `<button class="lift-row" data-label="${esc(x.label)}">
      <span>${x.label} <span class="muted">${fmtInt(x.n)}쌍${x.few ? " · 표본 적음" : ""}</span></span>
      <span class="lift-bars">
        <span class="lb yes" style="width:${(100 * (x.a ?? 0) / max).toFixed(1)}%"></span><span class="lv">${(x.a ?? 0).toFixed(1)}일</span>
        <span class="lb no" style="width:${(100 * (x.b ?? 0) / max).toFixed(1)}%"></span><span class="lv muted">${x.b != null ? `${x.b.toFixed(1)}일` : "—"}</span>
      </span>
      <span class="${gap(x) >= 1 && !x.few ? "ok-text" : "muted"}">${x.b > 0 ? `${(x.a / Math.max(x.b, 0.1)).toFixed(1)}배` : ""}</span></button>`).join("") +
    `<div class="muted hint">연결 14일이 지난 커플 ${fmtInt(base.length)}쌍 기준(전체 평균 ${all.toFixed(1)}일). 기능별 사용 여부는 최근 14일(캘린더 연동·기념일·알림·모먼트는 현재 상태)입니다. 상관관계이지 인과가 아닙니다 — 줄을 누르면 그 기능을 쓰는 커플을 봅니다.</div>`;
  el.querySelectorAll(".lift-row").forEach((b) => b.onclick = () => {
    const x = lines.find((l) => l.label === b.dataset.label);
    drillCouples(`기능: ${x.label} 사용`, x.ids);
  });
}

function renderEcosystem(data) {
  const detail = data.couple_detail;
  if (!detail) { for (const id of ["eco-journey", "eco-matrix", "eco-pulse", "eco-features"]) missingKey($(id)); return; }
  const rows = detail.map(enrichCouple);
  renderJourneyFunnel(data);
  renderMatrix(rows);
  renderPulse(data, rows);
  renderFeatureLift(rows);
}

// ── 커플의 여정: 상세 맨 위에 시간순으로 ─────────────────────────────────────
const JOURNEY_LABELS = [
  ["first_signup", "가입"], ["second_signup", "상대 가입"], ["connected", "연결"],
  ["push_on", "알림 허용"], ["first_event", "첫 일정"], ["first_synced_event", "캘린더 연동"],
  ["first_note", "첫 쪽지"], ["first_drawing", "첫 낙서"], ["first_reply", "첫 답장"],
  ["first_idea", "첫 버킷"], ["first_widget", "위젯 설치"], ["latest_moment", "최근 모먼트"],
  ["first_paywall", "페이월 조회"], ["trial_ended", "체험 종료"], ["promo_granted", "재체험 받음"],
  ["purchased", "결제"], ["last_active", "마지막 접속"],
];
// 아직 안 일어난 일도 여정이다 — "결제 없음"보다 "어디서 멈췄나"가 먼저 보이게 빠진 단계를 따로 적는다.
const JOURNEY_EXPECTED = ["first_event", "first_note", "first_reply", "first_idea", "first_widget", "push_on", "first_paywall", "purchased"];
function journeyHtml(r) {
  const j = lastData?.couple_journey?.[r.couple_id];
  if (!j) return "";
  const conn = ms(j.connected);
  const rel = (t) => {
    const d = t - conn;
    if (Math.abs(d) < 60000) return "연결 시점";
    return d < 0 ? `연결 ${fmtLag(-d)} 전` : `연결 +${fmtLag(d)}`;
  };
  const steps = JOURNEY_LABELS.filter(([k]) => j[k]).map(([k, label]) => ({ k, label, t: ms(j[k]) }))
    .sort((a, b) => a.t - b.t || (a.k === "last_active") - (b.k === "last_active"));
  const missing = JOURNEY_EXPECTED.filter((k) => !j[k]).map((k) => JOURNEY_LABELS.find((x) => x[0] === k)[1]);
  return `<div class="journey">${steps.map((s) => `<span class="jstep ${s.k}">
      <b>${s.label}</b><span class="muted" title="${new Date(s.t).toLocaleString("ko-KR")}">${s.k === "connected" ? fmtDate(j.connected) : rel(s.t)}</span></span>`).join(`<span class="jarrow">›</span>`)}</div>
    ${missing.length ? `<div class="muted" style="font-size:12px;margin:4px 0 10px">아직 없음: ${missing.join(" · ")}</div>` : ""}`;
}

// ── 매출: 결제액(0148·0149) ─────────────────────────────────────────────────
const STOREFRONT_A2 = {
  KOR: "KR", TWN: "TW", USA: "US", JPN: "JP", HKG: "HK", BRA: "BR", MEX: "MX", GBR: "GB", CAN: "CA",
  MYS: "MY", SGP: "SG", AUS: "AU", NZL: "NZ", THA: "TH", VNM: "VN", PHL: "PH", IDN: "ID", CHN: "CN",
  MAC: "MO", DEU: "DE", FRA: "FR", ESP: "ES", ITA: "IT", NLD: "NL", CHE: "CH", IND: "IN",
};
const storefrontName = (s) => s ? (STOREFRONT_A2[s] ? countryName(STOREFRONT_A2[s]) : s) : "미상";
const PRODUCT_LABEL = (id, kind) => kind === "lifetime" ? "평생 이용권" : /yearly|annual/.test(id ?? "") ? "연간 구독" : /monthly/.test(id ?? "") ? "월간 구독" : (id ?? "");

function revenueModel(data) {
  const tx = data.revenue_transactions;
  if (!tx) return null;
  const live = tx.filter((t) => !t.revoked_at);
  const sum = (xs) => xs.reduce((n, t) => n + Number(t.krw ?? 0), 0);
  const within = (t, from, to) => { const x = ms(t.purchased_at); return x >= from && x < to; };
  const now = Date.now();
  const last30 = live.filter((t) => within(t, now - 30 * DAY_MS, now));
  const prev30 = live.filter((t) => within(t, now - 60 * DAY_MS, now - 30 * DAY_MS));
  // 지금 살아 있는 구독마다 가장 최근 거래의 가격을 월 단위로 편다. 연간은 12로 나눈다.
  const latestByOriginal = {};
  for (const t of tx) {
    if (t.kind !== "subscription") continue;
    const cur = latestByOriginal[t.original_transaction_id];
    if (!cur || ms(t.purchased_at) > ms(cur.purchased_at)) latestByOriginal[t.original_transaction_id] = t;
  }
  // 서버 게이트와 같은 조건(0112·0130, membership_overview 0152): active는 만료 전, grace_period는 만료 후
  // 16일까지. billing_retry는 잠긴다 — 여기서만 다르게 세면 같은 타일에 '유료 커플'과 'MRR'이 엇갈린다.
  const subs = (data.subscriptions ?? []).filter((s) =>
    (s.status === "active" && ms(s.expires_at) > now) ||
    (s.status === "grace_period" && ms(s.expires_at) > now - 16 * DAY_MS));
  const monthly = (t) => /yearly|annual/.test(t.product_id ?? "") ? Number(t.krw) / 12 : Number(t.krw);
  const mrr = subs.reduce((n, s) => n + (latestByOriginal[s.original_transaction_id] ? monthly(latestByOriginal[s.original_transaction_id]) : 0), 0);
  const renewSoon = subs.filter((s) => s.will_renew && ms(s.expires_at) - now < 30 * DAY_MS)
    .reduce((n, s) => n + Number(latestByOriginal[s.original_transaction_id]?.krw ?? 0), 0);
  const payers = new Set(live.map((t) => t.kind === "lifetime" ? t.transaction_id : t.original_transaction_id)).size;
  return {
    tx, live, total: sum(live), refunded: sum(tx.filter((t) => t.revoked_at)), refundedN: tx.filter((t) => t.revoked_at).length,
    last30: sum(last30), last30N: last30.length, prev30: sum(prev30), prev30N: prev30.length, mrr, renewSoon, payers,
    lifetime: sum(live.filter((t) => t.kind === "lifetime")), lifetimeN: live.filter((t) => t.kind === "lifetime").length,
    activeSubs: subs.length, priced: live.filter((t) => t.krw != null).length,
    // 합계에서 0으로 빠지는 거래를 숨기지 않고 센다. 이유가 둘이라 따로 센다 — 금액이 없거나(처리방침 시행 전,
    // 0151), 금액은 있는데 환율표(0149 fx_krw)에 그 통화가 없거나.
    unpriced: live.filter((t) => t.price == null),
    unconverted: live.filter((t) => t.price != null && t.krw == null),
  };
}

function renderRevenueAmounts(data) {
  const ids = ["revenue-summary", "revenue-weekly", "revenue-breakdown", "revenue-list"];
  const m = revenueModel(data);
  if (!m) { ids.forEach((id) => missingKey($(id))); return; }
  if (!m.tx.length) {
    ids.forEach((id) => $(id).innerHTML = `<div class="empty">결제액 기록이 아직 없습니다.</div>`);
    return;
  }
  const tile = (label, value, sub) => `<div class="tile"><span class="muted">${label}</span><b>${value}</b>${sub ? `<span class="muted" style="font-size:12px">${sub}</span>` : ""}</div>`;
  $("revenue-summary").innerHTML = `<div class="tiles">
      ${tile("누적 결제액", fmtKRW(m.total), `${fmtInt(m.live.length)}건 · 결제자 ${fmtInt(m.payers)}`)}
      ${tile("최근 30일", fmtKRW(m.last30), `${fmtInt(m.last30N)}건 · 직전 30일 ${fmtKRW(m.prev30)}`)}
      ${tile("월 반복 매출 (MRR)", fmtKRW(m.mrr), `활성 구독 ${fmtInt(m.activeSubs)}건`)}
      ${tile("평생 이용권", fmtKRW(m.lifetime), `${fmtInt(m.lifetimeN)}건`)}
      ${tile("30일 내 갱신 예정", fmtKRW(m.renewSoon), "자동 갱신 켜진 구독")}
      ${tile("환불", fmtKRW(m.refunded), `${fmtInt(m.refundedN)}건`)}
    </div>
    <div class="muted hint">고객 결제액(세금 포함, 애플 수수료 전)을 고정 대략 환율로 원화 환산했습니다. 정산 금액은 App Store Connect가 원본입니다. 결제자는 구독(원 거래)·평생권 거래 단위입니다.</div>
    ${m.unpriced.length ? `<div class="muted hint">금액이 없는 결제 ${fmtInt(m.unpriced.length)}건은 위 합계에 들어 있지 않습니다 — 개인정보처리방침 개정이 시행되는 11/10 전까지는 금액·통화·스토어 국가를 남기지 않고, 시행 뒤 백필로 채웁니다.</div>` : ""}
    ${m.unconverted.length ? `<div class="muted hint">환율표에 없는 통화라 환산하지 못한 결제 ${fmtInt(m.unconverted.length)}건(${[...new Set(m.unconverted.map((t) => t.currency ?? "미상"))].join(", ")})은 위 합계에 들어 있지 않습니다.</div>` : ""}`;

  const recent = [...m.tx].sort((a, b) => ms(b.purchased_at) - ms(a.purchased_at)).slice(0, 50);
  $("revenue-list").innerHTML = `<table><thead><tr><th>시각</th><th>상품</th><th>스토어</th><th>결제액</th><th>원화 환산</th><th>구분</th></tr></thead><tbody>
    ${recent.map((t) => `<tr${t.revoked_at ? ` class="revoked"` : ""}>
      <td title="${t.purchased_at}">${fmtWhen(t.purchased_at)}</td>
      <td>${PRODUCT_LABEL(t.product_id, t.kind)}</td>
      <td>${storefrontName(t.storefront)}</td>
      <td class="mono">${t.price != null ? `${Number(t.price).toLocaleString("ko-KR")} ${esc(t.currency ?? "")}` : "—"}</td>
      <td>${t.krw != null ? fmtKRW(t.krw) : "—"}</td>
      <td class="muted">${t.revoked_at ? `<span class="bad-text">환불</span>` : t.kind === "lifetime" ? "1회" : t.reason === "RENEWAL" ? "갱신" : `첫 결제${Number(t.offer_type) === 1 ? " (체험가)" : ""}`}</td></tr>`).join("")}
    </tbody></table>`;

  // 금액이 남은 결제가 없으면(처리방침 시행 전) 막대·분포는 ₩0짜리 빈 그림이라 그리지 않는다.
  if (!m.priced) {
    for (const id of ["revenue-weekly", "revenue-breakdown"]) $(id).innerHTML = `<div class="empty">금액이 남은 결제가 없어 그릴 것이 없습니다 — 위 안내를 보세요.</div>`;
    return;
  }

  // 주별 막대: 평생권 · 첫 구독 · 갱신을 쌓는다. 12주.
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = Date.now() - (11 - i) * 7 * DAY_MS;
    return { from: end - 7 * DAY_MS, to: end };
  });
  const KINDS = [["lifetime", "평생 이용권", "var(--sunset)"], ["new", "첫 구독", "var(--tide)"], ["renew", "갱신", "var(--deep-water)"]];
  const kindOf = (t) => t.kind === "lifetime" ? "lifetime" : t.reason === "RENEWAL" ? "renew" : "new";
  const stacks = weeks.map((w) => {
    const s = { lifetime: 0, new: 0, renew: 0 };
    for (const t of m.live) { const x = ms(t.purchased_at); if (x >= w.from && x < w.to) s[kindOf(t)] += Number(t.krw); }
    return s;
  });
  const maxW = Math.max(...stacks.map((s) => s.lifetime + s.new + s.renew), 1);
  const W = 640, H = 200, padL = 56, padB = 28, bw = (W - padL) / weeks.length;
  const bars = stacks.map((s, i) => {
    let y = H - padB;
    return KINDS.map(([k, , color]) => {
      const h = (H - padB - 10) * s[k] / maxW;
      y -= h;
      return h ? `<rect x="${(padL + i * bw + 4).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 8).toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="2"><title>${KINDS.find((x) => x[0] === k)[1]} ${fmtKRW(s[k])}</title></rect>` : "";
    }).join("");
  }).join("");
  const fmtD = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const xl = [0, 6, 11].map((i) => `<text x="${(padL + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--secondary-ink)">${fmtD(weeks[i].from)}~</text>`).join("");
  const yl = [0, maxW].map((v) => `<text x="${padL - 8}" y="${(H - padB - (H - padB - 10) * v / maxW).toFixed(1)}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="var(--secondary-ink)">${fmtKRW(v)}</text>`).join("");
  $("revenue-weekly").innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="주별 결제액, 최근 12주">
      <line x1="${padL}" y1="${H - padB}" x2="${W}" y2="${H - padB}" stroke="var(--line)"/>${bars}${xl}${yl}</svg>
    <div style="margin-top:6px">${KINDS.map(([, label, color]) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px">
      <span style="width:10px;height:10px;background:${color};border-radius:2px"></span><span class="muted" style="font-size:12px">${label}</span></span>`).join("")}</div>`;

  const group = (keyFn) => {
    const g = {};
    for (const t of m.live) { const k = keyFn(t); (g[k] ??= { krw: 0, n: 0 }); g[k].krw += Number(t.krw); g[k].n += 1; }
    return Object.entries(g).sort((a, b) => b[1].krw - a[1].krw);
  };
  const barList = (entries) => {
    const max = Math.max(...entries.map(([, v]) => v.krw), 1);
    return entries.map(([k, v]) => `<div class="bar-row"><span>${k}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(100 * v.krw / max).toFixed(1)}%"></div></div>
      <span class="muted">${fmtKRW(v.krw)} · ${fmtInt(v.n)}건</span></div>`).join("");
  };
  $("revenue-breakdown").innerHTML = `<div class="two-col">
      <div><div class="muted" style="margin-bottom:4px">스토어 국가</div>${barList(group((t) => storefrontName(t.storefront)))}</div>
      <div><div class="muted" style="margin-bottom:4px">상품</div>${barList(group((t) => PRODUCT_LABEL(t.product_id, t.kind) + (t.kind === "subscription" ? (t.reason === "RENEWAL" ? " · 갱신" : " · 첫 결제") : "")))}</div>
    </div>`;

}

init();
