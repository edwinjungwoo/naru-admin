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
  partner_setup_started: "파트너 설정 시작", partner_invite_sent: "초대 보냄",
  dual_timezone_event_viewed: "두 시간대 일정 봄 ①", notification_value_screen_viewed: "알림 가치 화면",
  notification_permission_requested: "알림 권한 요청", notification_permission_granted: "알림 허용",
  notification_permission_denied: "알림 거부", notification_ask_deferred: "알림 나중에",
  first_notification_configured: "첫 알림 설정 ②",
  calendar_permission_requested: "캘린더 권한 요청", calendar_permission_granted: "캘린더 허용",
  calendar_permission_denied: "캘린더 거부", onboarding_completed: "커플 연결",
  home_viewed_after_onboarding: "홈 도달", first_note_created: "첫 쪽지", first_idea_saved: "첫 버킷",
  paywall_viewed: "페이월 봄", trial_ended_paywall_viewed: "체험 종료 페이월",
  paywall_tier_selected: "티어 선택", purchase_started: "결제 시작",
  purchase_succeeded: "결제 성공", purchase_cancelled: "결제 취소", purchase_failed: "결제 실패",
  // funnel_steps 밖의 이벤트(event_counts_14d로만 온다)
  partner_invite_share_completed: "초대 공유 완료", partner_invite_share_cancelled: "초대 공유 취소",
  accept_invite_sheet_opened: "받은 코드 입력 열기",
  widget_nudge_viewed: "위젯 권유 봄", widget_nudge_opened: "위젯 안내 열기", widget_nudge_dismissed: "위젯 권유 닫기",
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

const SECTION_IDS = ["attention", "summary-tiles", "summary-spark", "summary-membership",
  "couple-needs", "couple-widgets", "couple-table", "unpaired", "countries",
  "usage-home", "usage-calendar", "usage-notes", "usage-bucket", "usage-widgets", "usage-hours", "signups", "deletions", "dau", "feature-usage",
  "retention", "activation", "milestones", "funnel", "nudges",
  "payment-detail", "membership-dist", "membership-table", "paywall",
  "pipeline-detail", "cron", "http", "gcal", "push", "holidays", "storage", "versions", "feedback"];

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
  el.innerHTML = `<div class="empty">서버 업데이트가 필요해요 — migration이 아직 배포되지 않았습니다.</div>`;
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
        el.innerHTML = `<div class="empty">불러오지 못했어요 — 새로고침을 눌러 다시 시도하세요.</div>`;
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
    return fail("서버에 닿지 못했어요. 잠시 뒤 다시 시도하세요.");
  }

  if (response.status === 401) {
    if (fromLogin) return fail("비밀번호가 맞지 않아요.");
    // 저장해 둔 비밀번호가 그새 바뀐 경우다. 들고 있어봐야 계속 튕기니 버린다.
    password = "";
    sessionStorage.removeItem(PASSWORD_KEY);
    show("login");
    $("login-error").textContent = "비밀번호가 바뀌었어요. 다시 입력해 주세요.";
    return false;
  }
  if (!response.ok) {
    return fail("불러오기 실패 (" + response.status + ") · 새로고침을 눌러 다시 시도하세요.");
  }

  const data = await response.json();
  lastData = data;
  $("generated-at").textContent = "기준 " + new Date(data.generated_at).toLocaleString("ko-KR");
  renderSummary(data);
  renderAttention(data);
  renderPipeline(data.pipeline_health);
  renderPayment(data.payment_health, data.ops_health);
  renderOps(data);
  renderSignups(data.signups_daily);
  renderDeletions(data.deletions_recent);
  renderCountries(data.users_by_country);
  renderNudges(data.event_counts_14d);
  renderCouples(data);
  renderUsage(data);
  renderRevenue(data);
  renderDau(data.actives_daily);
  renderFeatureUsage(data.feature_usage_weekly);
  renderFunnel($("milestones"), data.milestone_funnel);
  renderFunnel($("funnel"), data.funnel_overall);
  renderRetention(data.retention_weekly);
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
  if (!rows.length) { $("feature-usage").innerHTML = `<div class="empty">아직 데이터 없음</div>`; return; }
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
  user_active_days: "하트비트", onboarding_events: "온보딩 퍼널",
  widget_installs: "위젯 설치", widget_taps: "위젯 탭",
};
const PAYMENT_SOURCE_NAMES = {
  subscriber_memberships: "구독 기록", lifetime_grants_purchased: "평생권 실구매",
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
    statusRow(PIPELINE_NAMES[r.source], `<span title="${r.last_arrival ?? ""}">마지막 ${relTime(r.last_arrival)}</span> · 14일 ${fmtInt(r.recent_rows)}행`,
      pipelineStale(r) ? "stale" : "ok")).join("");
}

// 결제가 새는지. 두 달간 0건이던 걸 아무도 못 알아챈 이유가 "뷰는 있는데 화면이
// 없어서"였다 — 새면 요약의 "확인할 것" 맨 위에 뜬다.
const PAYMENT_LABELS = [
  ["paywall_viewed", "페이월 봄"],
  ["purchase_started", "결제 시작"],
  ["purchase_succeeded", "애플이 성공이라 함"],
  ["purchase_failed", "결제 실패"],
  ["subscriptions_recorded", "구독 기록됨"],
  ["lifetime_recorded", "평생권 기록됨"],
  // 심사·TestFlight 구매다. 위 기록 수에 포함돼 있으니 실매출을 볼 땐 이만큼 뺀다.
  ["sandbox_recorded", "그중 샌드박스"],
];

function renderPayment(h, ops) {
  // 뷰가 한 행을 내므로 객체다. 키가 없으면 migration이 아직이다.
  if (!h || h.status === undefined) { missingKey($("payment-detail")); return; }
  const dot = h.status === "LEAKING" ? "stale" : "ok";
  const headline = h.status === "LEAKING" ? "결제가 새고 있어요"
    : h.status === "no_purchases" ? "30일간 앱이 보고한 결제 성공 없음"
    : "결제 정상 — 성공한 결제가 모두 서버에 남았어요";
  // 샌드박스 기록이 성공 이벤트보다 많으면 음수가 된다 — "미기록"은 0 밑으로 내려가지 않는다.
  const unrecorded = Math.max(Number(h.unrecorded ?? 0), 0);
  const sources = (ops?.payment_sources ?? []).map((r) =>
    statusRow(PAYMENT_SOURCE_NAMES[r.source] ?? r.source,
      `<span title="${r.last_arrival ?? ""}">마지막 ${relTime(r.last_arrival)}</span> · 14일 ${fmtInt(r.recent_rows)}행`)).join("");
  $("payment-detail").innerHTML =
    statusRow(`<b>${headline}</b>`, `미기록 ${fmtInt(unrecorded)}건`, dot) +
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
  if (!job.last_run) return true;
  return Date.now() - new Date(job.last_run).getTime() > (every * 2 + 10) * 60000;
}
const CRON_NAMES = {
  "send-upcoming-event-push": "상대 일정 30분 전 푸시",
  "send-invite-reminder-push": "초대 코드 만료 알림",
  "renew-naru-google-calendar-watches": "Google 캘린더 구독 갱신",
  "sync-naru-holidays": "공휴일 동기화",
  "account-migration-ticket-cleanup": "계정 이전 티켓 정리",
  "purge-stale-testflight-applications": "TestFlight 신청 정리",
  "cron-run-log-cleanup": "cron 기록 정리",
  "hme-auto-recovery": "HME 계정 자동 복구",
};

// 결정은 여기 한 곳에서 한다 — 카드마다 경고를 따로 띄우면 어디가 급한지 순서가 사라진다.
// bad: 지금 사용자·돈이 새는 중. warn: 며칠 안에 봐야 함. info: 알아두면 좋음.
function buildAttention(data) {
  const items = [];
  const add = (level, title, detail, tab) => items.push({ level, title, detail, tab });
  const ops = data.ops_health;

  const pay = data.payment_health;
  if (pay?.status === "LEAKING") {
    add("bad", `결제 ${fmtInt(pay.unrecorded)}건이 서버에 안 남았어요`,
      `애플은 성공이라는데(${fmtInt(pay.purchase_succeeded)}건) 권한 행은 ` +
      `${fmtInt(Number(pay.subscriptions_recorded) + Number(pay.lifetime_recorded))}건 — verify-plus-purchase 로그를 보세요.`, "revenue");
  }
  const stale = instrumentationRows(data.pipeline_health).filter(pipelineStale);
  if (stale.length) {
    add("bad", `계측 ${stale.length}개가 멈춰 있어요`,
      stale.map((r) => `${PIPELINE_NAMES[r.source]}: ${r.last_arrival ? `${relTime(r.last_arrival)}이 마지막` : "도착한 적 없음"}`).join(" · ") +
      " — 최근 빌드에서 수집 호출이 깨졌는지(RLS·upsert) 보세요.", "ops");
  }
  if (ops) {
    const failing = ops.cron.filter((j) => j.active && Number(j.failures_24h) > 0);
    const late = ops.cron.filter(cronLate);
    if (failing.length) {
      add("bad", `예약 작업 ${failing.length}개가 24시간 안에 실패했어요`,
        failing.map((j) => `${CRON_NAMES[j.jobname] ?? j.jobname} ${fmtInt(j.failures_24h)}회`).join(" · "), "ops");
    }
    if (late.length) {
      add("bad", `예약 작업 ${late.length}개가 제때 안 돌았어요`,
        late.map((j) => `${CRON_NAMES[j.jobname] ?? j.jobname}: 마지막 ${relTimeFine(j.last_run)}`).join(" · "), "ops");
    }
    if (Number(ops.http?.failed) > 0) {
      add("warn", `엣지 함수 호출 ${fmtInt(ops.http.failed)}건이 오류로 답했어요 (최근 6시간)`,
        "시크릿 불일치(401)나 함수 에러일 수 있어요 — net._http_response에서 본문을 보세요.", "ops");
    }
    const g = ops.google_calendar;
    if (g && (Number(g.reauth_failing) > 0 || Number(g.with_error) > 0)) {
      add("warn", "Google 캘린더 동기화 오류가 있어요",
        `재인증 실패 ${fmtInt(g.reauth_failing)}명 · 마지막 오류 남은 연결 ${fmtInt(g.with_error)}개`, "ops");
    }
    const DB_LIMIT = 500e6;
    if (Number(ops.db_size_bytes) > DB_LIMIT * 0.7) {
      add("warn", `DB가 ${fmtBytes(ops.db_size_bytes)}예요 — Free 한도 500MB의 70% 넘음`,
        "cron.job_run_details·net._http_response처럼 스스로 안 비는 테이블부터 보세요.", "ops");
    }
  }
  const uncovered = data.uncovered_holiday_countries ?? [];
  if (uncovered.length) {
    const users = uncovered.reduce((s, r) => s + Number(r.users), 0);
    add("warn", `공휴일이 비어 보이는 사용자 ${fmtInt(users)}명`,
      uncovered.map((r) => `${countryName(r.country_code)}(${r.country_code}) ${r.users}명`).join(" · ") +
      " — sync-holidays의 CALENDAR_SLUGS에 나라를 더하세요.", "ops");
  }
  const days = data.signups_daily ?? [];
  if (days.length) {
    const total = (k, from, to) => days.slice(from, to).reduce((s, r) => s + Number(r[k]), 0);
    const signups = total("signups", -7), deletions = total("deletions", -7);
    const before = total("deletions", -14, -7);
    // 소수일 땐 비율이 요동친다 — 절대 수도 같이 넘어야 신호로 본다. 가입 대비 비율과
    // 직전 주 대비 급증, 둘 중 하나면 본다(가입이 같이 몰리면 비율만으론 묻힌다).
    if (deletions >= 5 && (deletions >= signups * 0.1 || deletions >= before * 3)) {
      add("warn", `최근 7일 탈퇴 ${fmtInt(deletions)}명 — 직전 7일 ${fmtInt(before)}명, 같은 기간 가입의 ${Math.round(100 * deletions / Math.max(signups, 1))}%`,
        "추세 탭의 최근 탈퇴에서 얼마나 머물렀고 어디서 멈췄는지 보세요.", "trends");
    }
  }
  const fresh = (data.feedback_recent ?? []).filter((f) =>
    Date.now() - new Date(f.created_at).getTime() < 7 * 86400000);
  if (fresh.length) add("info", `새 피드백 ${fresh.length}건 (7일)`, esc(String(fresh[0].message).slice(0, 80)), "ops");

  const trialsEnding = (data.membership_rows ?? []).filter((m) => {
    const left = m.expires_at ? new Date(m.expires_at).getTime() - Date.now() : -1;
    return m.state === "trial_active" && left > 0 && left < 7 * 86400000;
  }).length;
  if (trialsEnding) {
    add("info", `7일 안에 체험이 끝나는 커플 ${fmtInt(trialsEnding)}쌍`,
      "끝나는 순간 체험 종료 페이월이 뜹니다 — 수익 탭 결제 퍼널에서 전환을 보세요.", "revenue");
  }
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
    : statusRow("<b>모두 정상</b> — 결제·계측·예약 작업·동기화에 볼 것이 없어요", "", "ok");
}

function renderOps(data) {
  const ops = data.ops_health;
  const opsIds = ["cron", "http", "gcal", "push", "storage"];
  if (!ops) { opsIds.forEach((id) => missingKey($(id))); }
  else {
    $("cron").innerHTML = ops.cron.map((j) => {
      const level = !j.active ? "" : (Number(j.failures_24h) > 0 || cronLate(j)) ? "stale" : "ok";
      const state = !j.active ? "꺼져 있음"
        : `마지막 <span title="${j.last_run ?? ""}">${relTimeFine(j.last_run)}</span> · 24시간 ${fmtInt(j.runs_24h)}회` +
          (Number(j.failures_24h) ? ` · <b class="bad-text">실패 ${fmtInt(j.failures_24h)}</b>` : "");
      return statusRow(`${CRON_NAMES[j.jobname] ?? esc(j.jobname)} <span class="muted mono">${esc(j.schedule)}</span>`, state, level);
    }).join("");

    const h = ops.http ?? {};
    $("http").innerHTML =
      statusRow("2xx 응답", fmtInt(h.ok), "ok") +
      statusRow("오류 응답(3xx 이상)", fmtInt(h.failed), Number(h.failed) ? "stale" : "ok") +
      statusRow("응답 못 받음(타임아웃)", fmtInt(h.timeouts), Number(h.timeouts) ? "warn" : "ok") +
      (h.last_failure ? statusRow("마지막 이상", `<span title="${h.last_failure}">${relTimeFine(h.last_failure)}</span>`) : "") +
      `<div class="muted hint">타임아웃은 pg_net이 기다림을 끊은 것이라 함수는 끝까지 돌았을 수 있어요. 대신 결과(401 등)가 안 보입니다 — 0109가 공휴일 cron에서 겪은 일.</div>`;

    const g = ops.google_calendar ?? {};
    $("gcal").innerHTML =
      statusRow("연결한 사람", fmtInt(g.connections)) +
      statusRow("마지막 동기화", `<span title="${g.last_sync ?? ""}">${relTimeFine(g.last_sync)}</span>`) +
      statusRow("재인증 실패 중", fmtInt(g.reauth_failing), Number(g.reauth_failing) ? "warn" : "ok") +
      statusRow("마지막 오류가 남은 연결", fmtInt(g.with_error), Number(g.with_error) ? "warn" : "ok") +
      statusRow("2일 넘게 동기화 없음", fmtInt(g.stale_2d)) +
      statusRow("변경 구독(watch)", `${fmtInt(g.watches)}개 · 만료된 것 ${fmtInt(g.watches_expired)}개`,
        Number(g.watches_expired) ? "warn" : "ok");

    const p = ops.push ?? {};
    $("push").innerHTML =
      statusRow("운영 토큰", `${fmtInt(p.production_tokens)}개 · ${fmtInt(p.production_users)}명`) +
      statusRow("샌드박스 토큰(개발·TestFlight 빌드)", fmtInt(p.sandbox_tokens)) +
      statusRow("마지막 등록", `<span title="${p.last_registered ?? ""}">${relTimeFine(p.last_registered)}</span>`) +
      statusRow("열려 있는 초대 코드", fmtInt(ops.open_invites));

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
      ? statusRow("<b>공휴일이 하나도 없는 나라</b>", "sync-holidays의 CALENDAR_SLUGS에 추가", "warn") +
        uncovered.map((r) => statusRow(`${countryName(r.country_code)} <span class="muted">${esc(r.country_code)}</span>`,
          `${fmtInt(r.users)}명 · 연결 ${fmtInt(r.paired_users)}명`)).join("")
      : statusRow("모든 사용자 나라에 공휴일이 채워져 있어요", "", "ok");
  }

  const versions = data.app_versions;
  if (!versions) missingKey($("versions"));
  else if (!versions.length) $("versions").innerHTML = `<div class="empty">최근 14일 온보딩 없음</div>`;
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
    $("versions").innerHTML += `<div class="muted" style="margin-top:12px">지금 쓰는 버전 (14일 안에 연 사람, 알림 켠 사람만 · ${fmtInt(total)}명)</div>` +
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
      : `<div class="empty">받은 피드백이 없어요.</div>`;
  }
}

// 가입은 위로, 탈퇴는 아래로 — 같은 날 둘을 나란히 두면 "가입이 몰려서 탈퇴도 는 것"이 모양으로 보인다.
function renderSignups(rows) {
  const el = $("signups");
  if (!rows) { missingKey(el); return; }
  if (!rows.length) { el.innerHTML = `<div class="empty">아직 데이터 없음</div>`; return; }
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
  if (!rows.length) { el.innerHTML = `<div class="empty">30일간 탈퇴 없음</div>`; return; }
  // 머문 시간 구간 — "가입하자마자 지움"과 "써보고 지움"은 고칠 곳이 다르다.
  const buckets = [["1시간 안", 1], ["하루 안", 24], ["일주일 안", 168], ["그 이상", Infinity]];
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
    `<div class="muted" style="margin-bottom:4px">머문 시간 · 파트너와 연결됐던 사람 ${fmtInt(partnered)}/${fmtInt(rows.length)}</div>` +
    counts.map(([label, v]) => `<div class="bar-row" tabindex="0" aria-label="${label}: ${v}명">
      <span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${(100 * v / max).toFixed(1)}%"></div></div>
      <span class="muted">${fmtInt(v)}</span></div>`).join("") +
    `<div class="muted" style="margin:12px 0 4px">마지막으로 남긴 온보딩 단계</div>` +
    Object.entries(steps).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      statusRow(KOREAN_STEP_NAMES[k] ?? esc(k), `${fmtInt(v)}명`)).join("");
}

function renderCountries(rows) {
  const el = $("countries");
  if (!rows) { missingKey(el); return; }
  if (!rows.length) { el.innerHTML = `<div class="empty">아직 데이터 없음</div>`; return; }
  const max = Math.max(...rows.map((r) => Number(r.users)), 1);
  // 연결된 사람을 진하게, 혼자인 사람을 옅게 한 막대에 쌓는다 — 나라별 "연결률"이 길이 비로 보인다.
  const row = (r) => `<div class="bar-row" tabindex="0" aria-label="${countryName(r.country_code)}: ${r.users}명, 연결 ${r.paired_users}명">
      <span>${countryName(r.country_code)} <span class="muted">${esc(r.country_code)}</span></span>
      <div class="bar-track stacked"><div class="bar-fill" style="width:${(100 * r.paired_users / max).toFixed(1)}%"></div><div class="bar-fill light" style="width:${(100 * r.solo_users / max).toFixed(1)}%"></div></div>
      <span class="muted">${fmtInt(r.users)} · 연결 ${Math.round(100 * r.paired_users / Math.max(r.users, 1))}%</span></div>`;
  const top = rows.slice(0, 10), rest = rows.slice(10);
  el.innerHTML = top.map(row).join("") +
    (rest.length ? `<details class="unpaired"><summary>나머지 ${rest.length}개 나라</summary>${rest.map(row).join("")}</details>` : "") +
    `<div class="legend"><span><i style="background:var(--tide)"></i>연결</span><span><i style="background:color-mix(in srgb, var(--tide) 35%, transparent)"></i>혼자</span></div>`;
}

const NUDGE_GROUPS = [
  ["초대", ["partner_invite_sent", "partner_invite_share_completed", "partner_invite_share_cancelled", "accept_invite_sheet_opened"]],
  ["위젯 권유", ["widget_nudge_viewed", "widget_nudge_opened", "widget_nudge_dismissed"]],
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
  lifetime: "평생권", trial_active: "체험 중", trial_over: "체험 끝", subscribed: "구독",
};
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
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return `${d.getMonth() + 1}/${d.getDate()} <span class="muted">(${days <= 0 ? "오늘" : `${days}일 전`})</span>`;
}
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
  if (lastActive && (new Date(lastActive).getTime() - seen) / 86400000 > WIDGET_REMOVED_AFTER_DAYS) return ["removed", "뺀 듯"];
  if ((Date.now() - seen) / 86400000 <= 14) return ["on", "있음"];
  return ["stale", "오래 확인 안 됨"];
}

const SUBSCRIPTION_PLAN = (productID) =>
  /yearly|annual/.test(productID ?? "") ? "연" : /monthly/.test(productID ?? "") ? "월" : "";

// 커플 한 쌍이 지금 무엇이 필요한지. 판정은 이 표 하나에서만 한다 — 요약 칩·표 태그·상세가 같은 결과를 본다.
// level: bad(놓치는 중) · warn(막혀 있음) · opp(기회) · info(참고)
const NEED_RULES = [
  ["churned", "bad", "이탈", "21일 넘게 둘 다 안 들어옴",
    (c) => c.idleDays > 21],
  ["dormant", "warn", "휴면", "7~21일째 둘 다 안 들어옴",
    (c) => c.idleDays > 7 && c.idleDays <= 21],
  ["one_side", "warn", "한쪽만 씀", "한 명은 14일 안에 들어왔는데 상대는 0일 — 상대를 다시 부를 계기가 필요",
    (c) => c.members.length === 2 && c.members.some((m) => m.active_days_14.length >= 2) &&
      c.members.some((m) => m.active_days_14.length === 0)],
  ["no_push", "warn", "알림 못 받음", "푸시 토큰이 없는 사람이 있음 — 쪽지·일정 알림이 안 간다",
    (c) => c.members.some((m) => !m.push)],
  // 연결 당일은 아직 둘러보는 중이다 — 하루는 기다려 본다.
  ["empty", "warn", "아직 빈 방", "연결하고 하루가 지났는데 일정·쪽지·버킷을 하나도 안 만듦 — 첫 행동이 필요",
    (c) => !c.calendar.events_total && !c.notes.notes_total && !c.bucket.ideas_total &&
      Date.now() - new Date(c.connected_at).getTime() > 86400000],
  ["convert", "opp", "전환 후보", "체험이 3일 안에 끝나는데 14일간 5번 넘게 만들었음",
    (c) => c.membership_state === "trial_active" && c.expiresInDays != null && c.expiresInDays <= 3 && c.made14 >= 5],
  ["paywall", "opp", "체험 끝·계속 씀", "권한이 없는데 7일 안에 들어옴 — 결제 페이월을 보고 있는 사람들",
    (c) => c.membership_state === "trial_over" && c.idleDays <= 7],
  ["calendar_sync", "info", "캘린더 연동 후보", "14일간 일정 8개 이상을 손으로 넣고 캘린더 연동은 없음",
    (c) => c.calendar.events_14d >= 8 && !c.members.some((m) => m.apple_calendar || m.google_calendar)],
  ["sync_only", "info", "연동 일정만 봄", "연동한 일정은 있는데 앱에서 직접 만든 일정은 0",
    (c) => (Number(c.synced.apple_events) + Number(c.synced.google_events)) > 0 && !c.calendar.events_total],
  ["unanswered", "info", "쪽지 답이 없음", "14일간 쪽지를 썼는데 답장이 달린 쪽지가 없음",
    (c) => c.notes.notes_14d > 0 && !c.notes.replied],
  ["renew_off", "warn", "해지 예정", "구독 중인데 자동 갱신을 껐음 — 만료일에 떠난다",
    (c) => c.membership_state === "subscribed" && c.subscription?.will_renew === false],
  ["widget", "info", "위젯 권유 대상", "둘 다 14일 중 5일 넘게 들어오는데 위젯이 없음",
    (c) => c.members.length === 2 && c.members.every((m) => m.active_days_14.length >= 5) &&
      c.members.every((m) => !m.widgetsOn.length)],
  ["widget_removed", "info", "위젯 뺌", `위젯을 올렸다가 지금은 하나도 없음 — 마지막 확인 뒤로 ${WIDGET_REMOVED_AFTER_DAYS}일 넘게 앱을 열었다`,
    (c) => c.members.some((m) => !m.widgetsOn.length && m.widgetRows.some((w) => w.state === "removed"))],
  ["no_anniversary", "info", "기념일 없음", "기념일을 안 넣어서 디데이가 비어 있음",
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
  row.needs = NEED_RULES.filter(([, , , , test]) => test(row)).map(([key, level, label, why]) => ({ key, level, label, why }))
    .sort((a, b) => NEED_ORDER[a.level] - NEED_ORDER[b.level]);
  return row;
}

function renderCouples(data) {
  const detail = data.couple_detail;
  if (!detail) { renderCouplesLegacy(data); return; }
  const rows = detail.map(enrichCouple);

  // 니즈 요약: 몇 쌍이 어떤 상태인지. 누르면 표를 그 커플만으로 거른다.
  const counts = NEED_RULES.map(([key, level, label, why]) =>
    ({ key, level, label, why, n: rows.filter((r) => r.needs.some((x) => x.key === key)).length }))
    .filter((x) => x.n);
  $("couple-needs").innerHTML = `<div class="chips">${counts.map((x) =>
    `<button class="chip ${x.level}${needFilter === x.key ? " on" : ""}" data-need="${x.key}" title="${x.why}">
       ${x.label} <b>${x.n}</b></button>`).join("")}
     ${needFilter ? `<button class="chip clear" data-need="">전체 보기</button>` : ""}</div>
    <div class="muted hint">${needFilter ? esc(NEED_RULES.find((r) => r[0] === needFilter)[3]) : "누르면 해당 커플만 봅니다. 한 커플이 여러 칩에 들 수 있어요."}</div>`;
  $("couple-needs").querySelectorAll(".chip").forEach((b) => b.onclick = () => {
    needFilter = b.dataset.need || null;
    renderCouples(lastData);
  });

  const shown = needFilter ? rows.filter((r) => r.needs.some((x) => x.key === needFilter)) : rows;
  const sorted = [...shown].sort((a, b) => {
    const va = a[coupleSort.key], vb = b[coupleSort.key];
    const cmp = coupleSort.key === "last_active_at" || coupleSort.key === "connected_at"
      ? new Date(va ?? 0) - new Date(vb ?? 0)
      : Number(va ?? 0) - Number(vb ?? 0);
    return cmp * coupleSort.dir;
  });
  const sortableHead = (key, label) =>
    `<th class="sortable" data-key="${key}" tabindex="0" role="button" aria-sort="${coupleSort.key === key ? (coupleSort.dir === -1 ? "descending" : "ascending") : "none"}">${label}</th>`;
  const names = (r) => r.members.map((m) => esc(m.nickname)).join(" · ") + (r.members.length < 2 ? ` <span class="muted">(혼자)</span>` : "");
  const dday = (r) => r.expiresInDays == null ? "" : r.expiresInDays < 0 ? " 만료" : ` D-${Math.ceil(r.expiresInDays)}`;
  // 두 사람 값을 "가 · 나" 한 칸에 — 커플 앱에서 한쪽만 쓰는지가 숫자 하나보다 먼저 보여야 한다.
  const activeCell = (r) => {
    const both = r.both_active_days_14;
    return `<span title="14일 중 각자 들어온 날${both != null ? ` · 같은 날 둘 다 들어온 날 ${both}일` : ""}">${r.members.map((m) => m.active_days_14.length).join(" · ")}` +
      (both != null ? ` <span class="muted">함께 ${both}</span>` : "") + `</span>`;
  };
  const widgetCell = (r) => {
    if (!r.widgetUsers) return `<span class="muted">—</span>`;
    const title = r.members.map((m) => `${m.nickname}: ${m.widgetsOn.map((k) => WIDGET_NAMES[k] ?? k).join(", ") || "없음"}`).join(" / ");
    return `<span class="widget-cell" title="${esc(title)}">${r.members.map((m) => m.widgetsOn.length
      ? `<span class="wchip">${m.widgetsOn.map(widgetName).join("·")}</span>` : `<span class="muted">없음</span>`).join(" ")}</span>`;
  };
  $("couple-table").innerHTML = shown.length ? `<table class="couples">
    <thead><tr><th>커플</th><th>상태</th><th>멤버십</th>
      ${sortableHead("last_active_at", "마지막 접속")}${sortableHead("connected_at", "연결")}
      ${sortableHead("gapHours", "시차")}${sortableHead("activeSort", "접속일")}${sortableHead("widgetSort", "위젯")}
      ${sortableHead("events_14d", "일정")}${sortableHead("notes_14d", "쪽지")}${sortableHead("ideas_14d", "버킷")}<th>필요한 것</th></tr></thead>
    <tbody>${sorted.map((r) => {
      const [cls, label] = coupleStatus(r.lastActive);
      const needs = r.needs.filter((n) => n.level !== "info").slice(0, 2);
      const more = r.needs.length - needs.length;
      return `<tr class="couple-row${openCouple === r.couple_id ? " open" : ""}" data-id="${r.couple_id}" tabindex="0">
        <td>${names(r)}</td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td>${r.membership_state ? `<span class="badge plus">${MEMBERSHIP_BADGE[r.membership_state] ?? r.membership_state}${r.membership_state === "subscribed" && SUBSCRIPTION_PLAN(r.subscription?.product_id) ? ` ${SUBSCRIPTION_PLAN(r.subscription.product_id)}` : ""}${dday(r)}</span>` : ""}</td>
        <td title="${r.lastActive ?? ""}">${fmtWhen(r.lastActive)}</td>
        <td title="${r.connected_at}">${fmtDate(r.connected_at)}</td>
        <td>${r.gapHours ? `${+r.gapHours.toFixed(1)}h` : "—"}</td>
        <td>${activeCell(r)}</td><td>${widgetCell(r)}</td>
        <td>${fmtInt(r.events_14d)}</td><td>${fmtInt(r.notes_14d)}</td><td>${fmtInt(r.ideas_14d)}</td>
        <td class="needs">${needs.map((n) => `<span class="need ${n.level}">${n.label}</span>`).join("")}${more > 0 ? `<span class="muted">+${more}</span>` : ""}</td></tr>
        ${openCouple === r.couple_id ? `<tr class="couple-detail"><td colspan="12">${coupleDetailHtml(r)}</td></tr>` : ""}`;
    }).join("")}</tbody></table>` : `<div class="empty">해당하는 커플이 없어요.</div>`;

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
function renderCoupleWidgets(rows) {
  const el = $("couple-widgets");
  if (!rows.length) { el.innerHTML = `<div class="empty">연결된 커플이 아직 없어요.</div>`; return; }
  const pairs = rows.filter((r) => r.members.length === 2);
  const both = pairs.filter((r) => r.widgetUsers === 2).length;
  const one = pairs.filter((r) => r.widgetUsers === 1).length;
  const none = pairs.length - both - one;
  const seg = (n, cls, label) => n ? `<div class="bar-fill${cls}" style="width:${(100 * n / pairs.length).toFixed(1)}%" title="${label} ${n}쌍"></div>` : "";
  const members = rows.flatMap((r) => r.members);
  const avg = (list, f) => list.length ? (list.reduce((n, x) => n + f(x), 0) / list.length).toFixed(1) : "—";
  const withW = members.filter((m) => m.widgetsOn.length), withoutW = members.filter((m) => !m.widgetsOn.length);
  const hasBoth = rows.some((r) => r.both_active_days_14 != null);
  const byKind = {};
  for (const m of members) for (const w of m.widgetRows) {
    const k = (byKind[w.kind] ??= { on: 0, removed: 0, taps: 0 });
    if (w.state === "on") k.on += 1;
    if (w.state === "removed") k.removed += 1;
    k.taps += Number(w.taps ?? 0);
  }
  const kinds = Object.entries(byKind).sort((a, b) => b[1].on - a[1].on);
  el.innerHTML = `
    <div class="bar-row reach" tabindex="0" aria-label="위젯: 둘 다 ${both}쌍, 한 명만 ${one}쌍, 없음 ${none}쌍">
      <span>위젯 올린 커플</span>
      <div class="bar-track stacked">${seg(both, "", "둘 다")}${seg(one, " light", "한 명만")}</div>
      <span class="muted">${fmtInt(both + one)}/${fmtInt(pairs.length)}쌍</span></div>
    <div class="legend"><span><i style="background:var(--tide)"></i>둘 다 ${fmtInt(both)}쌍</span>
      <span><i style="background:color-mix(in srgb, var(--tide) 35%, transparent)"></i>한 명만 ${fmtInt(one)}쌍</span>
      <span><i style="background:var(--subtle)"></i>없음 ${fmtInt(none)}쌍</span></div>
    ${statusRow("14일 중 평균 접속일 — 위젯 있는 사람 · 없는 사람",
      `${avg(withW, (m) => m.active_days_14.length)}일 (${fmtInt(withW.length)}명) · ${avg(withoutW, (m) => m.active_days_14.length)}일 (${fmtInt(withoutW.length)}명)`)}
    ${hasBoth ? statusRow("같은 날 둘 다 들어온 날 (14일 평균) — 위젯 있는 커플 · 없는 커플",
      `${avg(pairs.filter((r) => r.widgetUsers), (r) => Number(r.both_active_days_14 ?? 0))}일 · ${avg(pairs.filter((r) => !r.widgetUsers), (r) => Number(r.both_active_days_14 ?? 0))}일`) : ""}
    ${kinds.length ? statusRow("종류별 — 지금 있는 사람 · 뺀 사람 · 누적 탭",
      kinds.map(([k, v]) => `${widgetName(k)} ${fmtInt(v.on)}명${v.removed ? ` <span class="bad-text">뺌 ${fmtInt(v.removed)}</span>` : ""} <span class="muted">(탭 ${fmtInt(v.taps)})</span>`).join(" · ")) : ""}`;
}

// 위젯 하나에 한 줄: 종류·크기가 왼쪽, 지금 있는지·누르는지가 오른쪽.
// "깔아두고 안 누르는 위젯"도 보는 위젯이다(모먼트·낙서는 누르지 않고 보는 게 목적) — 탭 0을 실패로 칠하지 않는다.
function widgetRowsHtml(m) {
  if (!m.widgetRows.length) return statusRow("위젯", `<span class="muted">올린 적 없음</span>`);
  const stateHtml = (w) => w.state === "on" ? `<span class="ok-text">${w.stateLabel}</span>`
    : w.state === "removed" ? `<span class="bad-text" title="마지막 확인 ${w.last_seen_at}">${w.stateLabel}</span>`
    : `<span class="muted">${w.stateLabel}</span>`;
  return statusRow("위젯", m.widgetsOn.length ? `${fmtInt(m.widgetsOn.length)}종 있음` : `<span class="muted">지금 없음</span>`) +
    m.widgetRows.map((w) => `<div class="status-row widget-line"><span>${widgetName(w.kind)}
        <span class="muted">${(w.families ?? []).map((f) => WIDGET_FAMILIES[f] ?? esc(f)).join(" · ")}</span></span>
      <span class="muted">${stateHtml(w)}${w.first_seen_at ? ` · ${fmtDate(w.first_seen_at)}부터` : ""} · 탭 ${fmtInt(w.taps)}${w.last_tap_at ? ` <span title="${w.last_tap_at}">(${relTime(w.last_tap_at)})</span>` : ""}</span></div>`).join("");
}

// 온보딩 버전은 그 뒤 업데이트를 모른다. 푸시 토큰이 실행마다 싣는 버전(1.0.7+)이 있으면 그게 지금 앱이다.
function appVersionHtml(m) {
  if (m.app_version_live) return `<span title="${m.app_version_seen_at ?? ""}">${esc(m.app_version_live)}</span>`;
  if (m.app_version_seen_at) return `<span title="토큰은 있는데 버전이 비어 있음 — 1.0.7 전 앱">1.0.6 이하</span>`;
  if (!("app_version_live" in m)) return esc(m.app_version ?? "—");
  return `${esc(m.app_version ?? "—")} <span class="muted">(가입 때)</span>`;
}

const SUBSCRIPTION_STATUS = {
  active: "결제 중", grace_period: "결제 유예", billing_retry: "결제 재시도", expired: "만료", revoked: "환불",
};
function subscriptionRow(r) {
  const s = r.subscription;
  if (!s) return "";
  const plan = SUBSCRIPTION_PLAN(s.product_id);
  const renew = ["active", "grace_period", "billing_retry"].includes(s.status)
    ? (s.will_renew ? ` · <span class="ok-text">자동 갱신</span>` : ` · <span class="bad-text">갱신 꺼짐</span>`) : "";
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
    ${statusRow("마지막으로 뭔가 만든 때", `<span title="${m.last_action_at ?? ""}">${fmtWhen(m.last_action_at)}</span>`)}
    ${statusRow("14일 접속", strip(m.active_days_14) + (m.active_days_30 != null ? ` <span class="muted">· 30일 ${fmtInt(m.active_days_30)}일</span>` : ""))}
    ${statusRow("14일 만든 것", `일정 ${fmtInt(m.events_14d)} · 쪽지 ${fmtInt(m.notes_14d)}${m.drawings_14d != null ? ` <span class="muted">(낙서 ${fmtInt(m.drawings_14d)})</span>` : ""} · 답장 ${fmtInt(m.replies_14d)} · 버킷 ${fmtInt(m.ideas_14d)}`)}
    ${m.moment ? statusRow("모먼트", `${fmtInt(m.moment.uploads)}번 올림 · 마지막 <span title="${m.moment.captured_at}">${fmtWhen(m.moment.captured_at)}</span>`) : ""}
    ${statusRow("알림", yes(m.push, "받음", "토큰 없음"))}
    ${statusRow("캘린더 연동", [m.apple_calendar && "Apple", m.google_calendar && "Google"].filter(Boolean).join(" · ") || `<span class="muted">없음</span>`)}
    ${m.widget_detail ? widgetRowsHtml(m) : statusRow("위젯", m.widgets.length ? m.widgets.map(widgetName).join(" · ") : `<span class="muted">없음</span>`)}
    ${statusRow("가입 · 앱 버전", `${fmtDate(m.joined_at)} · ${appVersionHtml(m)}`)}
  </div>`;
  const cal = r.calendar, notes = r.notes, bucket = r.bucket;
  const pct = (a, b) => Number(b) ? `${Math.round(100 * Number(a) / Number(b))}%` : "—";
  return `<div class="detail">
    ${r.needs.length ? `<div class="need-list">${r.needs.map((n) =>
      `<div><span class="need ${n.level}">${n.label}</span> <span class="muted">${n.why}</span></div>`).join("")}</div>` : ""}
    <div class="members">${r.members.map(member).join("")}</div>
    <div class="tab-cards">
      <div><b>캘린더</b>
        ${statusRow("직접 만든 일정", `${fmtInt(cal.events_total)} <span class="muted">(14일 ${fmtInt(cal.events_14d)})</span>`)}
        ${statusRow("같이 보는 일정 · 반복 · 이모지", `${pct(cal.shared, cal.events_total)} · ${pct(cal.series, cal.events_total)} · ${pct(cal.categorized, cal.events_total)}`)}
        ${statusRow("연동해 온 일정", `Apple ${fmtInt(r.synced.apple_events)} · Google ${fmtInt(r.synced.google_events)}`)}
        ${statusRow("마지막", fmtWhen(cal.last_at))}</div>
      <div><b>쪽지</b>
        ${statusRow("쪽지", `${fmtInt(notes.notes_total)} <span class="muted">(14일 ${fmtInt(notes.notes_14d)})</span>`)}
        ${statusRow("손그림 · 답장 달린 비율", `${pct(notes.drawings, notes.notes_total)} · ${pct(notes.replied, notes.notes_total)}`)}
        ${statusRow("마지막", fmtWhen(notes.last_at))}</div>
      <div><b>버킷</b>
        ${statusRow("버킷", `${fmtInt(bucket.ideas_total)} <span class="muted">(14일 ${fmtInt(bucket.ideas_14d)})</span>`)}
        ${statusRow("링크 · 사진 · 장소 · 태그", `${pct(bucket.with_link, bucket.ideas_total)} · ${pct(bucket.with_image, bucket.ideas_total)} · ${pct(bucket.with_place, bucket.ideas_total)} · ${pct(bucket.tagged, bucket.ideas_total)}`)}
        ${statusRow("마지막", fmtWhen(bucket.last_at))}</div>
      <div><b>관계</b>
        ${statusRow("연결", fmtDate(r.connected_at))}
        ${statusRow("기념일", r.anniversary_date ? esc(r.anniversary_date) : `<span class="muted">없음</span>`)}
        ${statusRow("시차", r.gapHours ? `${+r.gapHours.toFixed(1)}시간` : "같은 시간대")}
        ${r.both_active_days_14 != null ? statusRow("같은 날 둘 다 들어옴 (14일)", `${fmtInt(r.both_active_days_14)}일`) : ""}
        ${subscriptionRow(r)}
        ${Number(r.moments) ? statusRow("모먼트", `${fmtInt(r.moments)}명이 올려 둠`) : ""}</div>
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
    }).join("")}</tbody></table>` : `<div class="empty">연결된 커플이 아직 없어요.</div>`;
  renderUnpaired(data);
}

function renderUnpaired(data) {
  const un = data.unpaired_accounts ?? [];
  $("unpaired").innerHTML = un.length
    ? `<details class="unpaired"><summary>미연결 계정 ${un.length}명</summary><table><tbody>
        ${un.map((u) => `<tr><td>${esc(u.nickname)}</td>
          <td title="${u.created_at}">가입 ${fmtWhen(u.created_at)}</td>
          <td title="${u.last_active_at ?? ""}">접속 ${fmtWhen(u.last_active_at)}</td></tr>`).join("")}
      </tbody></table></details>`
    : `<div class="empty">모든 계정이 연결돼 있어요.</div>`;
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
    statusRow("7일 안에 들어온 사람", `${fmtInt(h.active_users_7d)}명`) +
    statusRow("둘 다 들어온 커플 (7일)", `${fmtInt(h.both_active_couples_7d)}쌍`) +
    statusRow("한 명만 들어온 커플 (7일)", `${fmtInt(h.one_side_couples_7d)}쌍`, Number(h.one_side_couples_7d) ? "warn" : "") +
    statusRow("14일 중 평균 접속일", `${h.avg_active_days_14d ?? "—"}일`) +
    statusRow("매일 쓰는 사람 (14일 중 10일 이상)", `${fmtInt(h.daily_habit_users)}명`);

  const c = u.calendar;
  const cats = (c.top_categories ?? []).map((x) => `${esc(x.category)} ${fmtInt(x.cnt)}`).join(" · ");
  $("usage-calendar").innerHTML = reach(c.couples_14d, "14일 안에 일정 만든 커플") +
    statusRow("만든 사람 · 일정 수 (14일)", `${fmtInt(c.users_14d)}명 · ${fmtInt(c.events_14d)}개`) +
    statusRow("같이 보는 일정 비율", `${c.shared_pct ?? "—"}%`) +
    statusRow("반복 일정 비율", `${c.series_pct ?? "—"}%`) +
    statusRow("이모지(분류) 단 비율", `${c.categorized_pct ?? "—"}%`) +
    statusRow("캘린더 연동한 사람", `Apple ${fmtInt(c.apple_users)} · Google ${fmtInt(c.google_users)}`) +
    (cats ? statusRow("많이 쓰는 이모지 (30일)", cats) : "") +
    `<div class="muted hint">가입 때 자동으로 생기는 첫 일정과 연동해 온 일정은 빼고, 사람이 앱에서 직접 만든 일정만 셉니다. 비율은 30일 기준.</div>`;

  const n = u.notes;
  $("usage-notes").innerHTML = reach(n.couples_14d, "14일 안에 쪽지 쓴 커플") +
    statusRow("쪽지 · 답장 (14일)", `${fmtInt(n.notes_14d)} · ${fmtInt(n.replies_14d)}`) +
    statusRow("손그림 비율", `${n.drawing_pct ?? "—"}%`) +
    statusRow("상대가 답한 쪽지", `${n.replied_pct ?? "—"}%`) +
    statusRow("첫 답장까지 걸린 시간 (중앙값)", n.median_reply_minutes != null ? fmtMinutes(n.median_reply_minutes) : "—");

  const b = u.bucket;
  $("usage-bucket").innerHTML = reach(b.couples_14d, "14일 안에 버킷 담은 커플") +
    statusRow("담은 버킷 (14일)", fmtInt(b.ideas_14d)) +
    statusRow("링크로 담은 비율", `${b.link_pct ?? "—"}%`) +
    statusRow("사진 있는 비율", `${b.image_pct ?? "—"}%`) +
    statusRow("장소(내 도시·상대 도시)를 정한 비율", `${b.place_pct ?? "—"}%`) +
    statusRow("태그 단 비율", `${b.tagged_pct ?? "—"}%`);

  const widgets = u.widgets ?? [];
  const maxW = Math.max(...widgets.map((w) => Number(w.installed_users)), 1);
  // 0133: 사람 수만으로는 커플 앱에서 위젯이 얼마나 퍼졌는지 모른다 — 커플 단위 도달을 위에 둔다.
  const wr = u.widget_reach;
  const reachHtml = wr ? reach(wr.couples_any, "위젯 올린 커플 (한 명 이상)") + reach(wr.couples_both, "둘 다 올린 커플") : "";
  $("usage-widgets").innerHTML = reachHtml + (widgets.length ? widgets.map((w) =>
    `<div class="bar-row" tabindex="0" aria-label="${WIDGET_NAMES[w.kind] ?? w.kind}: ${w.installed_users}명">
      <span>${WIDGET_NAMES[w.kind] ?? esc(w.kind)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(100 * w.installed_users / maxW).toFixed(1)}%"></div></div>
      <span class="muted">${fmtInt(w.installed_users)}명 · 탭 ${fmtInt(w.taps_14d)}</span></div>`).join("") +
    `<div class="muted hint">14일 안에 홈 화면에 올라가 있던 사람 수와, 14일 안에 그 위젯을 누른 사람들의 누적 탭 수.</div>`
    : `<div class="empty">14일간 위젯 기록 없음</div>`);
  const mo = u.moments;
  if (Number(mo?.total)) {
    // 모먼트는 사람마다 한 장을 갈아 끼운다 — 장 수는 "올려 둔 사람", uploads가 실제로 찍어 올린 횟수다.
    $("usage-widgets").innerHTML += statusRow("모먼트", `${fmtInt(mo.total)}명이 올려 둠 · ${fmtInt(mo.couples)}쌍` +
      (mo.uploads != null ? ` · 누적 ${fmtInt(mo.uploads)}번 · 7일 안에 바꾼 사람 ${fmtInt(mo.updated_7d)}명` : ""));
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
const HOUR_ROWS = [["open", "앱 열기(하루 첫)"], ["events", "일정"], ["notes", "쪽지"], ["replies", "답장"], ["ideas", "버킷"]];
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
  el.innerHTML = `<table class="hours"><thead><tr><th></th>${head}<th>최다</th></tr></thead><tbody>${body}</tbody></table>
    <div class="muted hint">최근 30일, 행동한 사람의 현지 시각 기준. 줄마다 가장 많은 시간을 가장 진하게 칠했습니다.</div>`;
}


function renderRevenue(data) {
  const s = data.membership_summary, rows = data.membership_rows;
  if (!s || !rows) { missingKey($("membership-dist")); missingKey($("membership-table")); return; }
  const dist = [
    ["평생권", Number(s.lifetime)], ["체험 중", Number(s.trial_active)],
    ["구독", Number(s.subscribed)], ["체험 끝(무권한)", Number(s.trial_over)],
  ];
  const max = Math.max(...dist.map(([, v]) => v), 1);
  $("membership-dist").innerHTML = dist.map(([label, v]) =>
    `<div class="bar-row" tabindex="0" aria-label="${label}: ${v}쌍">
       <span>${label}</span>
       <div class="bar-track"><div class="bar-fill" style="width:${(100 * v / max).toFixed(1)}%"></div></div>
       <span class="muted">${fmtInt(v)}</span></div>`).join("");

  const dday = (iso) => {
    const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
    return d < 0 ? "만료" : `D-${d}`;
  };
  $("membership-table").innerHTML = `<table>
    <thead><tr><th>관계</th><th>상태</th><th>만료</th><th>출처</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc(r.member_one)} · ${esc(r.member_two)}${r.connected ? "" : ` <span class="muted">(연결 끊김)</span>`}</td>
      <td><span class="badge plus">${MEMBERSHIP_BADGE[r.state] ?? r.state}</span></td>
      <td title="${r.expires_at ?? ""}">${r.expires_at ? dday(r.expires_at) : "—"}</td>
      <td class="muted">${r.lifetime_source ? (LIFETIME_SOURCE[r.lifetime_source] ?? r.lifetime_source) : ""}</td>
    </tr>`).join("")}</tbody></table>`;
}

function renderSummary(data) {
  const days = data.actives_daily ?? [];
  const todayUtc = new Date().toISOString().slice(0, 10);
  const todayDau = days.find((r) => r.day === todayUtc)?.dau ?? 0;
  const couples = data.couple_activity;
  const activeCouples = couples?.filter((c) =>
    c.last_active_at && (Date.now() - new Date(c.last_active_at).getTime()) / 86400000 <= 14).length;
  // 가입·탈퇴는 직전 7일과 나란히 — 숫자 하나로는 많은지 적은지 모른다.
  const sd = data.signups_daily ?? [];
  const sum = (k, from, to) => sd.slice(from, to).reduce((s, r) => s + Number(r[k]), 0);
  const weekDelta = (k) => {
    if (sd.length < 14) return "";
    const before = sum(k, -14, -7);
    return `<span class="muted delta">직전 7일 ${fmtInt(before)}</span>`;
  };
  const tiles = [
    ["오늘 DAU <span class=\"muted\">(UTC)</span>", fmtInt(todayDau)],
    ["7일 활성 사용자", data.actives_7d != null ? fmtInt(data.actives_7d) : "—"],
    ["활성 커플(14일)", couples ? `${fmtInt(activeCouples)} / ${fmtInt(couples.length)}` : "—"],
    ["7일 가입", sd.length ? fmtInt(sum("signups", -7)) + weekDelta("signups") : "—"],
    ["7일 탈퇴", sd.length ? fmtInt(sum("deletions", -7)) + weekDelta("deletions") : "—"],
    ["전체 계정", fmtInt(data.usage_totals?.accounts)],
  ];
  $("summary-tiles").innerHTML = tiles.map(([label, v]) =>
    `<div class="tile"><span class="muted">${label}</span><b>${v}</b></div>`).join("");

  renderSparkline(days.slice(-30));

  const s = data.membership_summary;
  if (!s) { missingKey($("summary-membership")); return; }
  // expiring_soon은 체험과 유료를 섞어 센다 — 둘은 할 일이 달라서 여기서 가른다.
  const soon = (m) => m.expires_at && new Date(m.expires_at).getTime() - Date.now() < 7 * 86400000
    && new Date(m.expires_at).getTime() > Date.now();
  const rows = data.membership_rows ?? [];
  const trialsSoon = rows.filter((m) => m.state === "trial_active" && soon(m)).length;
  const paidSoon = rows.filter((m) => m.state === "subscribed" && soon(m)).length;
  $("summary-membership").innerHTML =
    `<div style="font-size:15px">평생권 <b>${fmtInt(s.lifetime)}</b> · 체험 중 <b>${fmtInt(s.trial_active)}</b> · ` +
    `구독 <b>${fmtInt(s.subscribed)}</b> · 체험 끝(무권한) <b>${fmtInt(s.trial_over)}</b></div>` +
    `<div class="muted" style="margin-top:4px">7일 안에 끝남: 체험 ${fmtInt(trialsSoon)}쌍 · 구독 ${fmtInt(paidSoon)}쌍</div>`;
}

// 요약용 축약 차트 — 축·툴팁 없이 모양만. 자세한 건 추세 탭이 담당한다.
function renderSparkline(rows) {
  if (!rows.length) { $("summary-spark").innerHTML = `<div class="empty">아직 데이터 없음</div>`; return; }
  const w = 640, h = 80, max = Math.max(...rows.map((r) => r.dau), 1);
  const x = (i) => i * w / Math.max(rows.length - 1, 1);
  const y = (v) => h - 6 - v * (h - 12) / max;
  const path = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.dau).toFixed(1)}`).join(" ");
  const last = rows[rows.length - 1];
  $("summary-spark").innerHTML =
    `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" role="img"
          aria-label="최근 30일 DAU, 마지막 값 ${last.dau}명">
       <path d="${path}" fill="none" stroke="var(--sunset)" stroke-width="2" stroke-linejoin="round"/>
       <circle cx="${x(rows.length - 1).toFixed(1)}" cy="${y(last.dau).toFixed(1)}" r="3.5" fill="var(--sunset)"/>
     </svg>`;
}

function renderDau(rows) {
  if (!rows.length) { $("dau").innerHTML = `<div class="empty">아직 데이터 없음</div>`; return; }
  const w = 640, h = 220, padL = 34, padR = 16, padT = 20, padB = 28;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const max = Math.max(...rows.map((r) => r.dau), 1);
  const x = (i) => padL + i * plotW / Math.max(rows.length - 1, 1);
  const y = (v) => padT + plotH - v * plotH / max;
  const path = rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.dau).toFixed(1)}`).join(" ");
  const areaPath = `${path} L${x(rows.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)}` +
    ` L${x(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;
  const last = rows[rows.length - 1];
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
        <circle cx="${x(rows.length - 1).toFixed(1)}" cy="${y(last.dau).toFixed(1)}" r="4"
                fill="var(--sunset)" stroke="var(--surface)" stroke-width="2"/>
        <text x="${x(rows.length - 1).toFixed(1)}" y="${(y(last.dau) - 10).toFixed(1)}" text-anchor="end"
              fill="var(--ink)" font-size="12" font-weight="600">${last.dau}</text>
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
    tooltip.textContent = `${fmtDauDate(r.day)} · ${r.dau}명`;
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

function renderFunnel(el, rows) {
  if (!rows.length || rows.every((r) => !Number(r.users))) {
    el.innerHTML = `<div class="empty">아직 데이터 없음</div>`; return;
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
  if (!rows.length) { $("retention").innerHTML = `<div class="empty">아직 데이터 없음</div>`; return; }
  const weeks = [...new Set(rows.map((r) => r.cohort_week))].sort();
  const maxN = Math.max(...rows.map((r) => r.week_number));
  const byKey = Object.fromEntries(rows.map((r) => [`${r.cohort_week}|${r.week_number}`, r]));
  const head = Array.from({ length: maxN + 1 }, (_, n) => `<th>W${n}</th>`).join("");
  const body = weeks.map((w) => {
    const size = rows.find((r) => r.cohort_week === w).cohort_size;
    const cells = Array.from({ length: maxN + 1 }, (_, n) => {
      const r = byKey[`${w}|${n}`];
      if (!r) return `<td class="muted">·</td>`;
      const pct = Math.round(100 * r.active_users / r.cohort_size);
      // 진하기가 곧 잔존율 — 숫자보다 모양으로 먼저 읽힌다. 글자색은 그 진하기에
      // 맞춰 매번 다시 고른다(textColorForFill) — 그래야 옅은 칸도 진한 칸도 읽힌다.
      return `<td style="background:color-mix(in srgb, var(--tide) ${pct}%, transparent); color:${textColorForFill(pct)}">${pct}%</td>`;
    }).join("");
    return `<tr><td>${w} (${size}명)</td>${cells}</tr>`;
  }).join("");
  $("retention").innerHTML =
    `<table><thead><tr><th>코호트</th>${head}</tr></thead><tbody>${body}</tbody></table>
     <div class="retention-key"><span class="muted">0%</span><span class="ramp"></span><span class="muted">100%</span></div>`;
}

function renderActivation(rows) {
  if (!rows.length) { $("activation").innerHTML = `<div class="empty">아직 데이터 없음</div>`; return; }
  const body = rows.map((r) =>
    `<tr><td>${r.cohort_week}</td><td>${r.cohort_size}</td><td>${r.activated}</td><td>${r.pct}%</td></tr>`
  ).join("");
  $("activation").innerHTML =
    `<table><thead><tr><th>코호트</th><th>가입</th><th>활성화</th><th>비율</th></tr></thead><tbody>${body}</tbody></table>`;
}

init();
