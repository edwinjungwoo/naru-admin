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
  first_notification_configured: "첫 알림 설정 ②", calendar_value_screen_viewed: "캘린더 가치 화면",
  calendar_permission_requested: "캘린더 권한 요청", calendar_permission_granted: "캘린더 허용",
  calendar_permission_denied: "캘린더 거부", onboarding_completed: "온보딩 완료",
  home_viewed_after_onboarding: "홈 도달", first_note_created: "첫 쪽지", first_idea_saved: "첫 버킷",
  paywall_viewed: "페이월 봄", trial_ended_paywall_viewed: "체험 종료 페이월",
  paywall_tier_selected: "티어 선택", purchase_started: "결제 시작",
  purchase_succeeded: "결제 성공", purchase_cancelled: "결제 취소", purchase_failed: "결제 실패",
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
const TABS = ["summary", "couples", "trends", "revenue"];
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

const SECTION_IDS = ["summary-tiles", "summary-spark", "summary-membership", "pipeline-detail",
  "couple-table", "unpaired", "dau", "feature-usage", "retention", "activation",
  "milestones", "funnel", "membership-dist", "membership-table", "paywall"];

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
  renderPipeline(data.pipeline_health);
  renderCouples(data);
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

const PIPELINE_NAMES = {
  user_active_days: "하트비트", onboarding_events: "온보딩 퍼널",
  widget_installs: "위젯 설치", widget_taps: "위젯 탭",
};
const STALE_DAYS = 3;

function renderPipeline(rows) {
  if (!rows) { missingKey($("pipeline-detail")); $("pipeline-banner").innerHTML = ""; return; }
  // 표시용 일수(relTime)는 내림이라 3.x일이 "3일 전"으로 보인다 — 그 값으로 임계를
  // 판정하면 실제 4일째까지 조용하다. 판정은 ms로, 표시만 날짜로 따로 한다.
  const staleness = (r) => r.last_arrival
    ? (Date.now() - new Date(r.last_arrival).getTime()) : Infinity;
  const stale = rows.filter((r) => staleness(r) > STALE_DAYS * 86400000);
  // 죽은 수집은 조용히 넘어가지 않는다 — 이 배너가 이 개편의 존재 이유다.
  $("pipeline-banner").innerHTML = stale.length
    ? `<div class="banner"><b>수집 ${stale.length}개가 멈춰 있어요.</b> ` +
      stale.map((r) => {
        const name = PIPELINE_NAMES[r.source] ?? r.source;
        return r.last_arrival ? `${name}: ${relTime(r.last_arrival)}이 마지막` : `${name}: 도착한 적 없음`;
      }).join(" · ") + " — 새 빌드가 배포돼야 다시 쌓입니다.</div>"
    : `<div class="status-row"><span><span class="dot ok"></span>수집 정상 — 모든 원천이 3일 안에 도착</span></div>`;
  $("pipeline-detail").innerHTML = rows.map((r) => {
    const isStale = staleness(r) > STALE_DAYS * 86400000;
    return `<div class="status-row"><span><span class="dot ${isStale ? "stale" : "ok"}"></span>${PIPELINE_NAMES[r.source] ?? r.source}</span>
      <span class="muted" title="${r.last_arrival ?? ""}">마지막 ${relTime(r.last_arrival)} · 14일 ${fmtInt(r.recent_rows)}행</span></div>`;
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

function renderCouples(data) {
  const rows = data.couple_activity;
  if (!rows) { missingKey($("couple-table")); missingKey($("unpaired")); return; }
  if (!rows.length) {
    $("couple-table").innerHTML = `<div class="empty">연결된 커플이 아직 없어요.</div>`;
  } else {
    // 멤버십은 관계 뷰에서 닉네임 쌍으로 잇는다 — 커플 뷰에 relationship_id를
    // 실어 나르는 것보다 못하지만, 표시용 매칭엔 충분하고 스냅샷이 한 번에 온다.
    const stateOf = (r) => (data.membership_rows ?? []).find((m) =>
      (m.member_one === r.member_one && m.member_two === r.member_two) ||
      (m.member_one === r.member_two && m.member_two === r.member_one))?.state;
    const sorted = [...rows].sort((a, b) => {
      const va = a[coupleSort.key], vb = b[coupleSort.key];
      const cmp = coupleSort.key === "last_active_at" || coupleSort.key === "connected_at"
        ? new Date(va ?? 0) - new Date(vb ?? 0)
        : Number(va ?? 0) - Number(vb ?? 0);
      return cmp * coupleSort.dir;
    });
    const sortableHead = (key, label) =>
      `<th class="sortable" data-key="${key}" tabindex="0" role="button" aria-sort="${coupleSort.key === key ? (coupleSort.dir === -1 ? "descending" : "ascending") : "none"}">${label}</th>`;
    $("couple-table").innerHTML = `<table>
      <thead><tr><th>커플</th><th>상태</th><th>멤버십</th>
        ${sortableHead("last_active_at", "마지막 활동")}${sortableHead("connected_at", "연결")}
        ${sortableHead("events_14d", "일정")}${sortableHead("notes_14d", "쪽지")}${sortableHead("ideas_14d", "버킷")}<th>위젯</th></tr></thead>
      <tbody>${sorted.map((r) => {
        const [cls, label] = coupleStatus(r.last_active_at);
        const m = stateOf(r);
        return `<tr><td>${esc(r.member_one)} · ${esc(r.member_two)}</td>
          <td><span class="badge ${cls}">${label}</span></td>
          <td>${m ? `<span class="badge plus">${MEMBERSHIP_BADGE[m] ?? m}</span>` : ""}</td>
          <td title="${r.last_active_at ?? ""}">${relTime(r.last_active_at)}</td>
          <td title="${r.connected_at}">${relTime(r.connected_at)}</td>
          <td>${fmtInt(r.events_14d)}</td><td>${fmtInt(r.notes_14d)}</td><td>${fmtInt(r.ideas_14d)}</td>
          <td>${r.widget_active ? "●" : ""}</td></tr>`;
      }).join("")}</tbody></table>`;
    const triggerSort = (th) => {
      coupleSort = th.dataset.key === coupleSort.key
        ? { key: coupleSort.key, dir: -coupleSort.dir } : { key: th.dataset.key, dir: -1 };
      renderCouples(lastData);
    };
    $("couple-table").querySelectorAll("th.sortable").forEach((th) => {
      th.onclick = () => triggerSort(th);
      th.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          if (event.key === " ") event.preventDefault();
          triggerSort(th);
        }
      };
    });
  }
  const un = data.unpaired_accounts ?? [];
  $("unpaired").innerHTML = un.length
    ? `<details class="unpaired"><summary>미연결 계정 ${un.length}명</summary><table><tbody>
        ${un.map((u) => `<tr><td>${esc(u.nickname)}</td>
          <td title="${u.created_at}">가입 ${relTime(u.created_at)}</td>
          <td title="${u.last_active_at ?? ""}">${relTime(u.last_active_at)}</td></tr>`).join("")}
      </tbody></table></details>`
    : `<div class="empty">모든 계정이 연결돼 있어요.</div>`;
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
  const tiles = [
    ["오늘 DAU", fmtInt(todayDau)],
    ["7일 활성 사용자", data.actives_7d != null ? fmtInt(data.actives_7d) : "—"],
    ["연결 커플", fmtInt(data.usage_totals?.connected_couples)],
    ["활성 커플(14일)", couples ? `${fmtInt(activeCouples)} / ${fmtInt(couples.length)}` : "—"],
  ];
  $("summary-tiles").innerHTML = tiles.map(([label, v]) =>
    `<div class="tile"><span class="muted">${label}</span><b>${v}</b></div>`).join("");

  renderSparkline(days.slice(-30));

  const s = data.membership_summary;
  if (!s) { missingKey($("summary-membership")); return; }
  $("summary-membership").innerHTML =
    `<div style="font-size:15px">평생권 <b>${fmtInt(s.lifetime)}</b> · 트라이얼 <b>${fmtInt(s.trial_active)}</b> · ` +
    `구독 <b>${fmtInt(s.subscribed)}</b> · 만료 임박(7일) <b>${fmtInt(s.expiring_soon)}</b></div>` +
    (Number(s.trial_over) ? `<div class="muted" style="margin-top:4px">체험만 끝난 쌍 ${fmtInt(s.trial_over)}</div>` : "");
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
