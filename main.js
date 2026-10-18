/* ── Pricepad · the landing page ──────────────────────────────
   The objects float in one three.js scene behind the hero; every
   other object on the page is a sprite of the same model. Numbers
   come from the chain when the program is live and from the bundled
   BLS history when it is not, and the page says which.
   ──────────────────────────────────────────────────────── */

import { floatScene, sprite, objectFor, paintSprites } from "/objects.js";
import { loadSeries, readAll, lastOf, fmtValue, fmtPct, pct, spark, blsUrl, periodLabel, P } from "/sol.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const shot = new URLSearchParams(location.search).has("static");
const RELEASES = [Date.UTC(2026, 9, 14, 12, 30), Date.UTC(2026, 10, 10, 13, 30), Date.UTC(2026, 11, 10, 13, 30)];

let SERIES = [], chain = null;

/* ── hero scene ───────────────────────────────────────── */

const narrow = innerWidth < 760;
const LAYOUT = [
  { name: "egg", x: -0.8, y: 0.52, z: 0, s: 1.1 },
  { name: "carton", x: -0.86, y: -0.05, z: -1.5, s: 1.15 },
  { name: "banana", x: -0.72, y: -0.62, z: 0.8, s: 1.3 },
  { name: "tp", x: 0.8, y: 0.54, z: -1, s: 1.3 },
  { name: "house", x: 0.88, y: -0.02, z: -2, s: 1.2 },
  { name: "cup", x: 0.74, y: -0.6, z: 0.6, s: 1.1 },
  { name: "tomato", x: -0.4, y: 0.72, z: -3, s: 0.8 },
  { name: "pill", x: 0.42, y: 0.72, z: -3.5, s: 0.7 },
  { name: "burger", x: -0.38, y: -0.78, z: -1.5, s: 1.05 },
  { name: "icecream", x: 0.4, y: -0.78, z: -2, s: 1.0 },
  { name: "car", x: 0.62, y: -0.9, z: -6, s: 1.0 },
].filter((o) => !narrow || ["egg", "tp", "banana", "cup", "burger", "icecream"].includes(o.name))
  .map((o) => (narrow ? { ...o, s: o.s * 0.62, y: o.y * 1.08 } : o));

try { floatScene($("#scene"), LAYOUT, { reduced: reduced || shot }); } catch (e) { console.warn("no WebGL", e); }

{
  const words = ["eggs.", "rent.", "funerals.", "toilet paper.", "coffee.", "the vet.", "gas.", "haircuts.", "beer."];
  const el = $("#word");
  let i = 0;
  if (!reduced && !shot) setInterval(() => {
    el.classList.add("out");
    setTimeout(() => { i = (i + 1) % words.length; el.textContent = words[i]; el.classList.remove("out"); }, 350);
  }, 2400);
}

/* ── the paragraph that reads itself ──────────────────── */

{
  const p = $("#readout");
  p.innerHTML = p.innerHTML.replace(/<k>(.*?)<\/k>/g, (_, w) => w.split(" ").map((x) => `\u0001${x}`).join(" "))
    .split(/(\s+)/).map((w) => (/^\s+$/.test(w) || !w ? w : w.startsWith("\u0001") ? `<span class="w key">${w.slice(1)}</span>` : `<span class="w">${w}</span>`)).join("");
  const words = $$(".w", p);
  const light = () => {
    const r = p.getBoundingClientRect();
    const t = shot || reduced ? 1 : Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35)));
    const n = Math.round(t * words.length);
    words.forEach((w, i) => w.classList.toggle("lit", i < n));
  };
  addEventListener("scroll", light, { passive: true });
  light();
}

/* ── data ─────────────────────────────────────────────── */

function rows() {
  return SERIES.map((s) => {
    const l = lastOf(s, chain), h = s.h;
    const yr = h.find((x) => x[0] === l.period - 100) || h.find((x) => x[0] === h.at(-1)[0] - 100);
    return { s, l, mom: pct(l.prev, l.value), yoy: yr ? pct(yr[1], l.value) : null, markets: chain?.markets.filter((m) => m.id === s.id).length || 0 };
  });
}
const cls = (x) => (x > 0 ? "up" : x < 0 ? "dn" : "");
const go = (t) => { location.href = "/app?s=" + t; };

function paintFour() {
  const top = rows().sort((a, b) => Math.abs(b.mom) - Math.abs(a.mom)).slice(0, 4);
  $("#four").innerHTML = top.map((r, i) => `
    <div class="thing" data-go="${r.s.t}" data-reveal style="--d:${i * 70}ms">
      <div class="obj"><img alt="" src="${sprite(objectFor(r.s.t))}"></div>
      <div class="top"><span class="name">${r.s.n}</span><span class="tk">${r.s.t}</span></div>
      <div class="val"><span class="v">${fmtValue(r.s, r.l.value)}</span><span class="ch ${cls(r.mom)}">${fmtPct(r.mom)}</span></div>
      <div class="desc" title="${r.s.title}">${r.s.title}</div>
    </div>`).join("");
  observe($("#four"));
}

function paintRail() {
  const list = rows().sort((a, b) => Math.abs(b.yoy ?? 0) - Math.abs(a.yoy ?? 0));
  $("#rail").innerHTML = list.map((r) => `
    <div class="tile" data-go="${r.s.t}">
      <div class="th"><img alt="" src="${sprite(objectFor(r.s.t), 128)}"><b>${r.s.n}</b></div>
      <div class="tv"><span class="mono">${fmtValue(r.s, r.l.value)}</span><span class="mono ${cls(r.yoy)}">${r.yoy == null ? "" : fmtPct(r.yoy)}</span></div>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none"><path d="${spark(r.s.h, 30)}" stroke="${(r.yoy ?? 0) >= 0 ? "var(--up)" : "var(--down)"}"/></svg>
      <div class="per">${periodLabel(r.l.period)}${r.markets ? ` · ${r.markets} live` : ""}</div>
    </div>`).join("");
}

let sortBy = "move", showAll = false;
function paintBoard() {
  let list = rows();
  list = sortBy === "az" ? list.sort((a, b) => a.s.n.localeCompare(b.s.n)) : list.sort((a, b) => Math.abs(b.yoy ?? 0) - Math.abs(a.yoy ?? 0));
  const shown = showAll ? list : list.slice(0, 12);
  $("#boardBody").innerHTML = shown.map((r) => `
    <tr data-go="${r.s.t}">
      <td><div class="nm"><img alt="" src="${sprite(objectFor(r.s.t), 128)}"><div><b>${r.s.n}</b><small>${r.s.t} · ${r.s.d ? r.s.u : "index"}</small></div></div></td>
      <td class="r mono">${fmtValue(r.s, r.l.value)}</td>
      <td class="r mono ${cls(r.mom)}">${fmtPct(r.mom, 2)}</td>
      <td class="r mono ${cls(r.yoy)}">${r.yoy == null ? "—" : fmtPct(r.yoy)}</td>
      <td class="hide-sm"><svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="${spark(r.s.h)}" stroke="${(r.yoy ?? 0) >= 0 ? "var(--up)" : "var(--down)"}"/></svg></td>
      <td class="r hide-md"><a class="src" href="${blsUrl(r.s.id)}" target="_blank" rel="noopener">${r.s.id} ↗</a></td>
    </tr>`).join("");
  $("#boardMore").textContent = showAll ? "Show fewer" : `Show all ${list.length}`;
}

$("#boardSort").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  sortBy = b.dataset.s;
  $$("#boardSort button").forEach((x) => x.classList.toggle("on", x === b));
  paintBoard();
});
$("#boardMore").addEventListener("click", () => { showAll = !showAll; paintBoard(); });
addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const g = e.target.closest("[data-go]");
  if (g && !railDragged) go(g.dataset.go);
});

/* ── the rail: drag to scroll, a bar that follows ─────── */

let railDragged = false;
{
  const rail = $("#rail"), bar = $("#railBar");
  const paint = () => {
    const max = rail.scrollWidth - rail.clientWidth;
    const w = rail.clientWidth / rail.scrollWidth;
    bar.style.width = (w * 100) + "%";
    bar.style.transform = `translateX(${max > 0 ? (rail.scrollLeft / max) * (1 / w - 1) * 100 : 0}%)`;
  };
  rail.addEventListener("scroll", paint, { passive: true });
  addEventListener("resize", paint);
  let x0 = 0, s0 = 0, down = false;
  rail.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; down = true; railDragged = false; x0 = e.clientX; s0 = rail.scrollLeft; });
  addEventListener("pointermove", (e) => { if (!down) return; const dx = e.clientX - x0; if (Math.abs(dx) > 4) { railDragged = true; rail.classList.add("drag"); } rail.scrollLeft = s0 - dx; });
  addEventListener("pointerup", () => { if (!down) return; down = false; rail.classList.remove("drag"); setTimeout(() => (railDragged = false), 50); });
  new ResizeObserver(paint).observe(rail);
}

/* ── the pot: the contract's arithmetic, drawn ────────── */

{
  let lev = 5, touched = false;
  const r = $("#potRange");
  const paint = () => {
    const move = +r.value / 10;
    const eggs = SERIES.find((s) => s.t === "EGG");
    const base = eggs ? lastOf(eggs, chain).value : 2.27;
    const { upWon, bps } = P.moveBps(base, base * (1 + move / 100), lev);
    let up = 1, dn = 1, moved = 0;
    if (bps) { if (upWon) { moved = dn * bps / 1e4; dn -= moved; up += moved; } else { moved = up * bps / 1e4; up -= moved; dn += moved; } }
    const upPct = (up / 2) * 100;
    $("#barU").style.flexBasis = upPct + "%";
    $("#barD").style.flexBasis = (100 - upPct) + "%";
    $("#knob").style.left = upPct + "%";
    $("#barUv").textContent = up.toFixed(3) + " SOL";
    $("#barDv").textContent = dn.toFixed(3) + " SOL";
    $("#barUp").textContent = upPct.toFixed(1) + "%";
    $("#barDp").textContent = (100 - upPct).toFixed(1) + "%";
    $("#potWhat").textContent = `Eggs · ${lev}x · 1 SOL each side`;
    $("#potPrint").textContent = "$" + (base * (1 + move / 100)).toFixed(3) + (move ? ` (${fmtPct(move)})` : "");
    $("#potCap").textContent = !bps ? "A flat month pays nobody. The line stays where it is."
      : upWon ? `Eggs got ${fmtPct(move)} dearer. ${(bps / 100).toFixed(1)}% of the down pot crosses to up${bps === 9900 ? ", the cap" : ""}.`
      : `Eggs got ${fmtPct(-move).replace("+", "")} cheaper. ${(bps / 100).toFixed(1)}% of the up pot crosses to down${bps === 9900 ? ", the cap" : ""}.`;
  };
  r.addEventListener("input", () => { touched = true; paint(); });
  $("#potLev").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    touched = true; lev = +b.dataset.lev;
    $$("#potLev button").forEach((x) => x.classList.toggle("on", x === b));
    paint();
  });
  paint();
  // until someone touches it, the bar runs through a few months by itself: flat, a good month, a bad one
  const tour = [0, 20, 20, -30, -30, 0];
  let k = 0;
  if (!reduced && !shot) setInterval(() => {
    if (touched) return;
    const rect = $("#bar").getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    k = (k + 1) % tour.length; r.value = tour[k]; paint();
  }, 1800);
  window.__paintPot = paint;
}

/* ── the clock ────────────────────────────────────────── */

function tick() {
  const now = Date.now();
  const on = chain?.config?.nextRelease ? chain.config.nextRelease * 1000 : 0;
  const at = on > now ? on : RELEASES.find((t) => t > now);
  if (!at) return;
  const d = at - now;
  $("#cdD").textContent = String(Math.floor(d / 864e5)).padStart(2, "0");
  $("#cdH").textContent = String(Math.floor(d / 36e5) % 24).padStart(2, "0");
  $("#cdM").textContent = String(Math.floor(d / 6e4) % 60).padStart(2, "0");
  $("#chipNext").textContent = new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}
setInterval(tick, 20000);

/* ── boot ─────────────────────────────────────────────── */

const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in-view"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
function observe(root = document) {
  $$("[data-reveal]", root).forEach((el) => (shot ? el.classList.add("in-view") : io.observe(el)));
}

async function start() {
  SERIES = await loadSeries();
  paintSprites();
  paintFour(); paintRail(); paintBoard(); tick(); window.__paintPot?.();
  observe();
  try {
    chain = await readAll(SERIES.map((s) => s.id));
    const chip = $("#chipProgram");
    if (chain.deployed) {
      chip.innerHTML = `<i class="dot on"></i><span>Live on Solana · <b>${chain.markets.length}</b> market${chain.markets.length === 1 ? "" : "s"}</span>`;
      $("#chipSeries").textContent = chain.series.size;
      $("#faqLive").textContent = `Yes. The program is deployed on Solana with ${chain.series.size} series listed and ${chain.markets.length} market${chain.markets.length === 1 ? "" : "s"} launched. It is unaudited.`;
      paintFour(); paintRail(); paintBoard(); tick(); window.__paintPot?.();
    } else {
      const d = await (await fetch("/api/paper")).json().catch(() => null);
      chip.remove();
      $("#faqLive").textContent = "Not yet. Connect any Solana wallet, claim 10 play SOL, and trade the same markets under the same rules as the Solana program, settled by real BLS prints. Balances are play SOL until the program is deployed to mainnet.";
      $("#footState").textContent = "Play SOL · unaudited";
    }
  } catch (e) {
    $("#chipProgram")?.remove();
    console.warn(e);
  }
}

addEventListener("click", async (e) => {
  const b = e.target.closest("[data-addr]"); if (!b) return;
  const l = b.querySelector(".do");
  try { await navigator.clipboard.writeText(b.dataset.addr); l.textContent = "copied"; } catch { l.textContent = "select it"; }
  setTimeout(() => (l.textContent = "copy"), 1600);
});

for (const a of $$('a[href^="#"]')) a.addEventListener("click", (e) => {
  const t = document.getElementById(a.getAttribute("href").slice(1));
  if (!t) return;
  e.preventDefault();
  t.scrollIntoView({ behavior: reduced ? "instant" : "smooth" });
});

setTimeout(() => $$("[data-reveal]").forEach((el) => el.classList.add("in-view")), 2500); // never leave the page blank
start().catch((e) => { console.error(e); observe(); });
