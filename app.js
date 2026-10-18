/* ── Pricepad · the app (Solana) ──────────────────────────────
   Pick a thing, a leverage and a side. If nobody has launched that
   leverage yet, the same transaction launches it and makes your buy.
   Quotes use the program's arithmetic on the pots and mint supplies
   read a moment ago; a trade that would first settle a waiting figure
   says so instead of quoting a stale number.
   ──────────────────────────────────────────────────────── */

import { sprite, objectFor } from "/objects.js";
import { MESSAGE_PREFIX, quoteSell as simQuoteSell, leaderboard as _lb } from "/sim.js";
import {
  P, conn, loadSeries, readAll, sendTx, wallets, connectWallet, explorer, lastOf, typicalMove,
  periodLabel, fmtValue, fmtPct, pct, fmtSol, short, blsUrl,
} from "/sol.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const LEVS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50];
const RELEASES = [Date.UTC(2026, 9, 14, 12, 30), Date.UTC(2026, 10, 10, 13, 30), Date.UTC(2026, 11, 10, 13, 30)];
const MIN_BUY = 100_000n;

const S = {
  series: [], sel: null, lev: 5, side: "up", filter: "all", query: "",
  chain: null, mk: null, supplies: { up: 0n, down: 0n }, wallet: null, lamports: 0n, bal: { up: 0n, down: 0n }, sellPct: 100,
};

/* ── boot and refresh ─────────────────────────────────── */

async function start() {
  S.series = await loadSeries();
  S.sel = S.series.find((s) => s.t === (params.get("s") || "EGG").toUpperCase()) || S.series[0];
  const x = parseInt(params.get("x"), 10);
  S.lev = x >= 1 && x <= 50 ? x : suggestLev(S.sel);
  $("#count").textContent = S.series.length;
  paintList(); paintAll();
  await refresh();
  setInterval(refresh, 30000);
  setInterval(paintClock, 20000);
}

/** Play-SOL markets: the same shapes as the chain reader, filled from /api/paper. */
async function readPaper() {
  const q = S.wallet ? "?wallet=" + S.wallet.publicKey.toBase58() : "";
  const d = await (await fetch("/api/paper" + q)).json();
  const series = new Map();
  for (const [id, ps] of Object.entries(d.prints)) {
    const prints = ps.map(([period, v, postedAt]) => ({ period, value: v / 1000, postedAt }));
    series.set(id, { count: prints.length, prints, latest: prints.at(-1) });
  }
  const markets = d.markets.map((m) => ({
    id: m.id, leverage: m.lev, upPot: BigInt(m.upPot), downPot: BigInt(m.downPot), upS: BigInt(m.upS), downS: BigInt(m.downS),
    cursor: m.cursor, holders: m.holders_n, mine: m.mine, address: null, paper: true,
  }));
  return { deployed: true, paper: true, config: { nextRelease: d.nextRelease }, series, markets, me: d.me, players: d.players, leaderboard: d.leaderboard };
}

async function refresh() {
  try {
    const real = await readAll(S.series.map((s) => s.id)).catch(() => ({ deployed: false }));
    S.chain = real.deployed ? real : await readPaper();
    $("#state").hidden = !!S.chain.paper;
    $("#stateDot").className = "dot on";
    $("#stateText").textContent = `live · ${S.chain.markets.length} market${S.chain.markets.length === 1 ? "" : "s"}`;
    paintBoardLb();
    paintList();
    await refreshMarket();
  } catch (e) {
    $("#stateDot").className = "dot warn";
    $("#stateText").textContent = "Solana unreachable";
    console.error(e);
  }
  paintClock();
}

const u64At = (d, o) => { let x = 0n; for (let i = 7; i >= 0; i--) x = (x << 8n) | BigInt(d[o + i]); return x; };

async function refreshMarket() {
  S.mk = S.chain?.markets.find((m) => m.id === S.sel.id && m.leverage === S.lev) || null;
  S.supplies = { up: 0n, down: 0n };
  S.bal = { up: 0n, down: 0n };
  if (S.chain?.paper) {
    if (S.mk) { S.supplies = { up: S.mk.upS, down: S.mk.downS }; if (S.mk.mine) S.bal = { up: BigInt(S.mk.mine.up), down: BigInt(S.mk.mine.down) }; }
    S.lamports = BigInt(S.chain.me?.bal || 0);
    return paintAll();
  }
  if (S.mk) {
    const keys = [S.mk.upMint, S.mk.downMint];
    if (S.wallet) keys.push(P.ata(S.wallet.publicKey, S.mk.upMint), P.ata(S.wallet.publicKey, S.mk.downMint));
    const infos = await conn.getMultipleAccountsInfo(keys);
    S.supplies = { up: infos[0] ? u64At(infos[0].data, 36) : 0n, down: infos[1] ? u64At(infos[1].data, 36) : 0n };
    if (S.wallet) S.bal = { up: infos[2] ? u64At(infos[2].data, 64) : 0n, down: infos[3] ? u64At(infos[3].data, 64) : 0n };
  }
  if (S.wallet) S.lamports = BigInt(await conn.getBalance(S.wallet.publicKey));
  paintAll();
}

/* ── the list ─────────────────────────────────────────── */

function paintList() {
  const q = S.query.toLowerCase();
  const live = new Set((S.chain?.markets || []).map((m) => m.id));
  const list = S.series
    .filter((s) => !q || [s.n, s.t, s.id, s.title].some((x) => x.toLowerCase().includes(q)))
    .filter((s) => S.filter === "all" || (S.filter === "live" ? live.has(s.id) : (S.filter === "d") === s.d))
    .sort((a, b) => a.n.localeCompare(b.n));
  $("#list").innerHTML = list.length ? list.map((s) => {
    const l = lastOf(s, S.chain), ch = pct(l.prev, l.value);
    return `<button class="li ${s === S.sel ? "on" : ""}" data-t="${s.t}">
      <img alt="" src="${sprite(objectFor(s.t), 96)}">
      <span class="n">${s.n}${live.has(s.id) ? '<i class="livedot"></i>' : ""}<small>${s.t}</small></span>
      <span class="v">${fmtValue(s, l.value)}<small class="${ch > 0 ? "up" : ch < 0 ? "dn" : ""}">${fmtPct(ch)}</small></span>
    </button>`;
  }).join("") : `<p class="note" style="padding:8px">${S.filter === "live" ? "No markets launched yet. Pick a thing and launch the first." : "Nothing matches."}</p>`;
}
$("#list").addEventListener("click", (e) => {
  const b = e.target.closest(".li"); if (!b) return;
  S.sel = S.series.find((s) => s.t === b.dataset.t);
  const mine = (S.chain?.markets || []).filter((m) => m.id === S.sel.id).sort((a, b) => Number(b.upPot + b.downPot - a.upPot - a.downPot));
  S.lev = mine[0]?.leverage || suggestLev(S.sel);
  paintList(); paintAll();
  refreshMarket().catch(console.error);
  if (innerWidth < 780) $(".ticket-col").scrollIntoView({ behavior: "smooth" });
});
$("#search").addEventListener("input", (e) => { S.query = e.target.value; paintList(); });
$("#filter").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.filter = b.dataset.f;
  $$("#filter button").forEach((x) => x.classList.toggle("on", x === b));
  paintList();
});

function suggestLev(s) {
  const raw = 10 / typicalMove(s);
  return LEVS.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a), 1);
}

/* ── the ticket ───────────────────────────────────────── */

function paintAll() {
  S.mk = S.chain?.markets.find((m) => m.id === S.sel.id && m.leverage === S.lev) || null;
  const s = S.sel, l = lastOf(s, S.chain);
  history.replaceState(null, "", `/app?s=${s.t}&x=${S.lev}${params.get("rpc") ? "&rpc=" + encodeURIComponent(params.get("rpc")) : ""}`);
  document.title = `${s.n} · Pricepad`;
  $("#tkObj").src = sprite(objectFor(s.t));
  $("#tkName").textContent = s.n;
  $("#tkTitle").textContent = `${s.title} · ${s.id}`;
  $("#tkPeriod").textContent = `${periodLabel(l.period)}${S.chain?.paper ? " · BLS" : l.chain ? " · on chain" : ""}`;
  $("#tkValue").textContent = fmtValue(s, l.value);
  const ch = pct(l.prev, l.value);
  $("#tkChg").textContent = fmtPct(ch) + " on the month";
  $("#tkChg").className = "mono " + (ch > 0 ? "up" : ch < 0 ? "dn" : "");
  $("#tkSource").href = blsUrl(s.id);
  $("#tkSource").textContent = `${s.id} on bls.gov ↗`;
  drawChart(); paintLev(); paintTicket(); paintMarket(); paintClock();
}

function paintLev() {
  const mine = (S.chain?.markets || []).filter((m) => m.id === S.sel.id);
  const set = new Set([1, 2, 5, 10, 20, ...mine.map((m) => m.leverage), S.lev]);
  $("#levChips").innerHTML = [...set].sort((a, b) => a - b).map((x) => {
    const m = mine.find((y) => y.leverage === x);
    return `<button class="${x === S.lev ? "on" : ""} ${m ? "has" : ""}" data-lev="${x}">${x}x${m ? ` · ${fmtSol(m.upPot + m.downPot, 2)} SOL` : ""}</button>`;
  }).join("");
  $("#lev").value = S.lev;
  $("#levVal").textContent = S.lev + "x";
  const t = typicalMove(S.sel);
  $("#levNote").textContent = `A typical month moves this ${t.toFixed(1)}%. At ${S.lev}x that print carries ${Math.min(99, t * S.lev).toFixed(0)}% of the losing pot across.${S.mk ? "" : " Nobody has launched this leverage yet."}`;
}
$("#levChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setLev(+b.dataset.lev); });
$("#lev").addEventListener("input", (e) => setLev(+e.target.value));
function setLev(x) {
  S.lev = x; paintAll();
  clearTimeout(setLev.t); setLev.t = setTimeout(() => refreshMarket().catch(console.error), 250);
}
for (const b of $$(".sidebtn")) b.addEventListener("click", () => {
  S.side = b.dataset.side;
  $$(".sidebtn").forEach((x) => x.classList.toggle("on", x === b));
  paintTicket();
});
$("#amount").addEventListener("input", paintTicket);

function lamportsIn() {
  const v = $("#amount").value.trim();
  if (!/^\d*\.?\d*$/.test(v) || v === "" || v === ".") return null;
  const [i, f = ""] = v.split(".");
  return BigInt(i || "0") * 1_000_000_000n + BigInt((f + "000000000").slice(0, 9));
}

function potsNow() {
  const m = S.mk;
  return m ? { up: m.upPot, down: m.downPot, upS: S.supplies.up, downS: S.supplies.down } : { up: 0n, down: 0n, upS: 0n, downS: 0n };
}
function onChainSeries() { return S.chain?.series.get(S.sel.id) || null; }
function pending() { const s = onChainSeries(); return S.mk && s && !S.mk.paper ? Math.max(0, s.count - 1 - S.mk.cursor) : 0; }
function tradeable() {
  const c = S.chain?.config, s = onChainSeries();
  if (!c || !c.nextRelease || !s) return true;
  const now = Date.now() / 1000;
  const inWindow = now + P.LEAD >= c.nextRelease && now < c.nextRelease + 3 * 86400;
  return !inWindow || s.latest.postedAt >= c.nextRelease - P.LEAD;
}

function paintTicket() {
  const p = potsNow(), up = S.side === "up";
  $("#upWhat").textContent = S.mk ? `${fmtSol(p.up)} SOL in the pot` : "it prints higher";
  $("#dnWhat").textContent = S.mk ? `${fmtSol(p.down)} SOL in the pot` : "it prints lower";
  const amt = lamportsIn();
  const pot = up ? p.up : p.down, sup = up ? p.upS : p.downS;
  const other = up ? p.down : p.up, otherS = up ? p.downS : p.upS;
  const shares = amt == null ? null : sup === 0n ? amt : (amt * sup) / pot;
  $("#oTokens").textContent = shares == null ? "—" : `${fmtSol(shares)} ${S.sel.t}${S.lev}${up ? "UP" : "DN"}`;
  const share = !shares ? 0 : Number((shares * 10000n) / (sup + shares)) / 100;
  $("#oShare").textContent = shares == null ? "—" : `${share.toFixed(share === 100 ? 0 : 2)}% of ${fmtSol(pot + amt)} SOL`;
  $("#balNote").textContent = S.wallet ? (S.chain?.paper ? (S.chain.me ? `play balance ${fmtSol(S.lamports, 3)} SOL` : "") : `wallet ${fmtSol(S.lamports, 3)} SOL`) : "";

  const t = typicalMove(S.sel);
  const moves = [-2 * t, -t, 0, t, 2 * t].map((x) => Math.round(x * 10) / 10);
  const mine = amt ?? 0n, myPot = pot + mine, sh = shares ?? 0n;
  $("#scen").innerHTML = moves.map((mv) => {
    const { upWon, bps } = P.moveBps(100, 100 * (1 + mv / 100), S.lev);
    let after = myPot;
    if (bps && otherS > 0n) after = upWon === up ? myPot + (other * BigInt(bps)) / 10000n : myPot - (myPot * BigInt(bps)) / 10000n;
    const hold = sup + sh === 0n ? 0n : (after * sh) / (sup + sh);
    const d = hold - mine;
    return `<tr><td>${mv === 0 ? "flat" : fmtPct(mv)}</td><td class="r mono">${fmtSol(hold)} SOL</td><td class="r mono ${d > 0n ? "up" : d < 0n ? "dn" : ""}" style="width:90px">${d === 0n ? "±0" : (d > 0n ? "+" : "−") + fmtSol(d < 0n ? -d : d)}</td></tr>`;
  }).join("");
  $("#scenNote").textContent = otherS > 0n
    ? `One and two typical months either way, at ${S.lev}x, for your share of the side after you buy.`
    : `Nobody is on ${up ? "down" : "up"} yet, so a print moves nothing. The rows change once someone takes the other side.`;
  paintAction(amt);
}

function notice(t, x, btn) {
  $("#notice").hidden = !t;
  $("#noticeT").textContent = t || ""; $("#noticeX").textContent = x || "";
  $("#noticeB").hidden = !btn;
  if (btn) { $("#noticeB").textContent = btn.label; $("#noticeB").onclick = btn.run; }
}

function paintAction(amt) {
  const b = $("#place"), up = S.side === "up", pend = pending();
  if (!tradeable()) notice("Frozen for the release.", "Buys and sells stop an hour before the BLS release and reopen when the figure is on chain, three days at the most.");
  else if (pend) notice(`${pend} new figure${pend > 1 ? "s are" : " is"} waiting to settle.`, "Any buy or sell settles it first, so the pots move before your trade. Settle now to see the numbers after.", { label: "Settle", run: doSettle });
  else notice();

  b.disabled = false;
  if (!S.chain) { b.textContent = "Reading Solana…"; b.disabled = true; return; }
  if (!S.chain.deployed) { b.textContent = "Program not deployed yet"; b.disabled = true; return; }
  if (!tradeable()) { b.textContent = "Frozen until the figure lands"; b.disabled = true; return; }
  if (!S.wallet) { b.textContent = S.chain.paper ? "Connect to play" : "Connect a wallet"; b.onclick = doConnect; return; }
  if (S.chain.paper && !S.chain.me) { b.textContent = "Claim 10 play SOL"; b.onclick = doJoin; return; }
  if (amt == null) { b.textContent = "Enter an amount"; b.disabled = true; return; }
  if (amt < MIN_BUY && !(amt === 0n && !S.mk)) { b.textContent = "At least 0.0001 SOL"; b.disabled = true; return; }
  if (amt > S.lamports) { b.textContent = S.chain.paper ? "More than your play balance" : "More than the wallet holds"; b.disabled = true; return; }
  if (S.chain.paper && amt === 0n) { b.textContent = "Enter an amount"; b.disabled = true; return; }
  if (S.mk) { b.textContent = `Buy ${up ? "up" : "down"} with ${fmtSol(amt)} SOL`; b.onclick = doBuy; }
  else { b.textContent = amt > 0n ? `Launch ${S.lev}x and buy ${up ? "up" : "down"}` : `Launch the ${S.lev}x market`; b.onclick = doBuy; }
}

/* ── the right column ─────────────────────────────────── */

function paintMarket() {
  const m = S.mk;
  $("#mkLev").textContent = `${S.sel.t} · ${S.lev}x`;
  $("#mkNone").hidden = !!m; $("#mkLive").hidden = !m;
  if (!m) {
    $("#mkNoneObj").src = sprite(objectFor(S.sel.t), 160);
    $("#mkNoneText").textContent = `Nobody has launched ${S.sel.n} at ${S.lev}x yet. Your first buy launches it.`;
  } else {
    const tot = m.upPot + m.downPot;
    $("#mUp").textContent = fmtSol(m.upPot) + " SOL";
    $("#mDn").textContent = fmtSol(m.downPot) + " SOL";
    $("#mUpBar").style.width = (tot ? Number((m.upPot * 1000n) / tot) / 10 : 0) + "%";
    $("#mDnBar").style.width = (tot ? Number((m.downPot * 1000n) / tot) / 10 : 0) + "%";
    const pend = pending();
    $("#mCursor").textContent = pend ? `${pend} print${pend > 1 ? "s" : ""} behind` : periodLabel(onChainSeries()?.latest?.period || S.sel.h.at(-1)[0]);
    if (m.paper) { $("#mAddr").textContent = `${m.holders} holder${m.holders === 1 ? "" : "s"}`; $("#mAddr").removeAttribute("href"); }
    else { $("#mAddr").textContent = short(m.address); $("#mAddr").href = explorer("account", m.address.toBase58()); }
  }
  const has = S.wallet && (S.bal.up > 0n || S.bal.down > 0n);
  $("#posNone").hidden = !!has; $("#posLive").hidden = !has;
  $("#posNone").textContent = !S.wallet ? "Connect a wallet to see what you hold here." : m ? "You hold nothing in this market." : "No market here yet.";
  if (has) {
    const worth = (b, pot, sup) => (sup ? (pot * b) / sup : 0n);
    $("#pUp").textContent = S.bal.up ? `${fmtSol(worth(S.bal.up, m.upPot, S.supplies.up))} SOL` : "—";
    $("#pDn").textContent = S.bal.down ? `${fmtSol(worth(S.bal.down, m.downPot, S.supplies.down))} SOL` : "—";
    $("#sellUp").disabled = !S.bal.up || !tradeable();
    $("#sellDn").disabled = !S.bal.down || !tradeable();
  }
}
$("#sellPct").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  S.sellPct = +b.dataset.p;
  $$("#sellPct button").forEach((x) => x.classList.toggle("on", x === b));
});
$("#sellUp").addEventListener("click", () => doSell(true));
$("#sellDn").addEventListener("click", () => doSell(false));

function paintBoardLb() {
  const box = $("#lb");
  if (!S.chain?.paper) { box.hidden = true; return; }
  box.hidden = false;
  const me = S.wallet?.publicKey.toBase58();
  const rows = S.chain.leaderboard;
  $("#lbList").innerHTML = rows.length ? rows.slice(0, 10).map((r, i) => `
    <div class="krow"><span class="k">${i + 1}. ${r.wallet === me ? "<b>you</b>" : short(r.wallet)}</span><span class="v ${r.worth > 10e9 ? "up" : r.worth < 10e9 ? "dn" : ""}">${fmtSol(r.worth, 3)} SOL</span></div>`).join("")
    : `<p class="note">Nobody has played yet. Connect and claim 10 play SOL to be first.</p>`;
}

function paintClock() {
  const now = Date.now();
  const on = S.chain?.config?.nextRelease ? S.chain.config.nextRelease * 1000 : 0;
  const at = on > now ? on : RELEASES.find((r) => r > now);
  if (!at) return;
  const d = at - now;
  $("#cdD").textContent = String(Math.floor(d / 864e5)).padStart(2, "0");
  $("#cdH").textContent = String(Math.floor(d / 36e5) % 24).padStart(2, "0");
  $("#cdM").textContent = String(Math.floor(d / 6e4) % 60).padStart(2, "0");
  const when = new Date(at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  $("#releaseNote").textContent = `The next consumer price report is due ${when} ET. Every market freezes an hour before it and reopens once its figure is on chain.`;
}

/* ── the chart ────────────────────────────────────────── */

function drawChart() {
  const svg = $("#chart"), W = Math.max(300, Math.round(svg.clientWidth || 640)), H = 220, L = 6, R = 54, T = 12, B = 24;
  const h = S.sel.h.slice();
  const on = onChainSeries();
  if (on) for (const p of on.prints) if (p.period > h.at(-1)[0]) h.push([p.period, p.value]);
  const vals = h.map((x) => x[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const x = (i) => L + (i / (h.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const last = h.length - 1;
  const line = h.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => lo + pad + f * (hi - lo - 2 * pad));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <defs><linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10151C" stop-opacity=".08"/><stop offset="1" stop-color="#10151C" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="yl" x="${W - R + 8}" y="${y(v) + 3}">${fmtValue(S.sel, v)}</text>`).join("")}
    ${h.map((p, i) => [p[0], i]).filter(([p]) => p % 100 === 1).map(([p, i]) => `<text class="xl" x="${x(i)}" y="${H - 4}">${Math.floor(p / 100)}</text>`).join("")}
    <path class="area" d="${line} L${x(last)} ${H - B} L${x(0)} ${H - B} Z"/>
    <path class="line" d="${line}"/>
    <circle class="endpt" cx="${x(last)}" cy="${y(h[last][1])}" r="5"/>
    <line class="xh" id="xh" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <circle class="xd" id="xd" r="4" visibility="hidden"/>
    <rect class="hit" width="${W}" height="${H}"/>`;
  $("#chartRange").textContent = `${periodLabel(h[0][0])} to ${periodLabel(h[last][0])} · ${h.length} monthly prints`;
  const tip = $("#tip"), hit = $("rect.hit", svg), xh = $("#xh", svg), xd = $("#xd", svg);
  hit.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(last, Math.round((((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * last)));
    const [p, v] = h[i], prev = h[i - 1];
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
    xd.setAttribute("cx", x(i)); xd.setAttribute("cy", y(v)); xd.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.innerHTML = `<b>${fmtValue(S.sel, v)}</b><span>${periodLabel(p)}${prev ? " · " + fmtPct(pct(prev[1], v)) : ""}</span>`;
    tip.style.left = Math.min(r.width - 120, Math.max(0, (x(i) / W) * r.width - 60)) + "px";
    tip.style.top = Math.max(0, (y(v) / H) * r.height - 56) + "px";
  });
  hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); xd.setAttribute("visibility", "hidden"); });
}
let rsz; addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(drawChart, 150); });

/* ── wallet and writes ────────────────────────────────── */

function say(m, c = "") { $("#status").textContent = m; $("#status").className = "status " + c; }
function explain(e) {
  const m = e?.message || String(e);
  if (e?.code === 4001 || /reject|denied|cancel/i.test(m)) return "You cancelled it in the wallet.";
  if (/0x1779|Frozen/.test(m)) return "The market is frozen for the release.";
  if (/0x177b|Slippage/.test(m)) return "The pots moved before your trade landed. Try again.";
  return m.length > 180 ? m.slice(0, 180) + "…" : m;
}

async function doConnect() {
  try {
    const list = wallets();
    if (!list.length) return say("No Solana wallet found. Install Phantom, Solflare or Backpack, then reload.", "bad");
    const pick = list.length === 1 ? list[0] : await choose(list);
    if (!pick) return;
    say(`Check ${pick.name}…`);
    S.wallet = await connectWallet(pick);
    $("#connect").textContent = short(S.wallet.publicKey.toBase58());
    say("Connected with " + pick.name, "good");
    S.wallet.provider.on?.("accountChanged", () => location.reload());
    await refreshMarket();
  } catch (e) { say(explain(e), "bad"); console.error(e); }
}
$("#connect").addEventListener("click", () => { if (!S.wallet) doConnect(); });

function choose(list) {
  const sheet = $("#sheet"), box = $("#walletList");
  return new Promise((resolve) => {
    const done = (v) => { sheet.hidden = true; resolve(v); };
    box.innerHTML = list.map((w, i) => `<button class="wopt" data-i="${i}">${w.icon ? `<img src="${w.icon}" alt="">` : ""}<b>${w.name}</b><small>detected</small></button>`).join("");
    $$(".wopt", box).forEach((b) => b.addEventListener("click", () => done(list[+b.dataset.i])));
    $$("[data-close]", sheet).forEach((el) => el.addEventListener("click", () => done(null), { once: true }));
    sheet.hidden = false;
  });
}

async function run(label, ixs) {
  const b = $("#place");
  b.classList.add("busy");
  try {
    say(label + ": confirm in your wallet…");
    const sig = await sendTx(S.wallet, ixs);
    say(`${label}: done. ${sig.slice(0, 10)}…`, "good");
    await refresh();
  } catch (e) { say(explain(e), "bad"); console.error(e); }
  finally { b.classList.remove("busy"); }
}

/* play SOL: every action is a signed message, never a transaction */
async function signed(label, action) {
  const b = $("#place");
  b.classList.add("busy");
  try {
    say(label + ": sign the message in your wallet (no transaction, nothing spent)…");
    const nonce = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("");
    const message = MESSAGE_PREFIX + JSON.stringify({ ...action, t: Date.now(), nonce });
    const out = await S.wallet.provider.signMessage(new TextEncoder().encode(message), "utf8");
    const sig = out?.signature || out;
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
    const r = await fetch("/api/paper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: S.wallet.publicKey.toBase58(), message, signature }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "refused");
    say(label + ": done.", "good");
    await refresh();
  } catch (e) { say(explain(e), "bad"); console.error(e); }
  finally { b.classList.remove("busy"); }
}
function doJoin() { return signed("Claiming 10 play SOL", { op: "join" }); }

function doBuy() {
  const amt = lamportsIn(), up = S.side === "up", p = potsNow();
  if (S.chain.paper) {
    const pot = up ? p.up : p.down, sup = up ? p.upS : p.downS;
    const quote = sup === 0n ? amt : (amt * sup) / pot;
    return signed(S.mk ? `Buying ${up ? "up" : "down"}` : `Launching ${S.sel.t} ${S.lev}x`, { op: "buy", id: S.sel.id, lev: S.lev, up, lamports: Number(amt), minShares: Number((quote * 995n) / 1000n) });
  }
  const me = S.wallet.publicKey, ixs = [];
  if (!S.mk) ixs.push(P.launch(me, S.sel.id, S.lev));
  if (amt > 0n) {
    const pot = up ? p.up : p.down, sup = up ? p.upS : p.downS;
    const quote = sup === 0n ? amt : (amt * sup) / pot;
    ixs.push(...P.buy(me, S.sel.id, S.lev, up, amt, pending() ? 0n : (quote * 995n) / 1000n));
  }
  return run(S.mk ? `Buying ${up ? "up" : "down"}` : `Launching ${S.sel.t} ${S.lev}x`, ixs);
}

function doSell(up) {
  const bal = up ? S.bal.up : S.bal.down, m = S.mk;
  const shares = S.sellPct === 100 ? bal : (bal * BigInt(S.sellPct)) / 100n;
  const pot = up ? m.upPot : m.downPot, sup = up ? S.supplies.up : S.supplies.down;
  const quote = shares === sup ? pot : (pot * shares) / sup;
  if (S.chain.paper) return signed(`Selling ${up ? "up" : "down"}`, { op: "sell", id: S.sel.id, lev: S.lev, up, shares: Number(shares), minOut: Number((quote * 995n) / 1000n) });
  return run(`Selling ${up ? "up" : "down"}`, [P.sell(S.wallet.publicKey, S.sel.id, S.lev, up, shares, pending() ? 0n : (quote * 995n) / 1000n)]);
}

function doSettle() {
  if (!S.wallet) return doConnect();
  return run("Settling", [P.settle(S.sel.id, S.lev)]);
}

addEventListener("click", async (e) => {
  const b = e.target.closest("[data-addr]"); if (!b) return;
  const l = b.querySelector(".do");
  try { await navigator.clipboard.writeText(b.dataset.addr); l.textContent = "copied"; } catch { l.textContent = "select it"; }
  setTimeout(() => (l.textContent = "copy"), 1600);
});

start().catch((e) => { console.error(e); say("Could not load: " + e.message, "bad"); });
