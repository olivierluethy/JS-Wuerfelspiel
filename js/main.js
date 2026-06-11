/* ============================================================
   SWISS LOTTO — 6 / 49 + Bonus
   A polished, single-file game module. Sections:
     1. Config & state
     2. Sound (Web Audio synth — no asset files)
     3. Ticket: number grid, selection, quick pick
     4. Prize table & jackpot ticker
     5. The drum: bouncing-ball physics
     6. The draw sequence (eject balls one by one)
     7. Reconciliation: matches, prize, celebration
   ============================================================ */
(() => {
    "use strict";

    /* ---------- 1. Config & state ---------- */
    const TOTAL = 49;          // numbers 1..49
    const PICKS = 6;           // main numbers to pick / draw
    const STAKE = 2.5;         // CHF per row (informational)
    const JACKPOT = 18_400_000;

    // Prize tiers, evaluated from the top. `bonus` means "also matched the bonus ball".
    const TIERS = [
        { match: 6, bonus: false, label: "6 Numbers", prize: JACKPOT, jackpot: true },
        { match: 5, bonus: true,  label: "5 + Bonus", prize: 1_000_000 },
        { match: 5, bonus: false, label: "5 Numbers", prize: 10_000 },
        { match: 4, bonus: false, label: "4 Numbers", prize: 250 },
        { match: 3, bonus: false, label: "3 Numbers", prize: 25 },
    ];

    const state = {
        selected: new Set(),   // numbers the player picked
        drawn: [],             // 6 winning numbers
        bonus: null,           // bonus number
        phase: "select",       // select | drawing | done
        muted: false,
    };

    const $ = (sel) => document.querySelector(sel);
    const fmtCHF = (n) => "CHF " + n.toLocaleString("de-CH");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Ball colour by decade, real-lotto style
    const ballColor = (n) =>
        n <= 9 ? "#f8fafc" :
        n <= 19 ? "#fca5a5" :
        n <= 29 ? "#93c5fd" :
        n <= 39 ? "#86efac" :
        "#fcd34d";

    /* ---------- 2. Sound (Web Audio synth) ---------- */
    const Sound = (() => {
        let ctx = null;
        let blowerNode = null;
        const ensure = () => {
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) ctx = new AC();
            }
            if (ctx && ctx.state === "suspended") ctx.resume();
            return ctx;
        };
        const tone = (freq, dur, type = "sine", gain = 0.15) => {
            if (state.muted) return;
            const c = ensure(); if (!c) return;
            const o = c.createOscillator(), g = c.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(0, c.currentTime);
            g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
            o.connect(g).connect(c.destination);
            o.start(); o.stop(c.currentTime + dur);
        };
        return {
            unlock: ensure,
            pop() { tone(160 + Math.random() * 80, 0.18, "triangle", 0.22); },
            tick() { tone(880, 0.05, "square", 0.05); },
            startBlower() {
                if (state.muted) return;
                const c = ensure(); if (!c || blowerNode) return;
                // filtered white noise = airy blower hum
                const buf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
                const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
                const filter = c.createBiquadFilter(); filter.type = "bandpass";
                filter.frequency.value = 420; filter.Q.value = 0.7;
                const g = c.createGain(); g.gain.value = 0.04;
                src.connect(filter).connect(g).connect(c.destination);
                src.start();
                blowerNode = { src, g };
            },
            stopBlower() {
                if (!blowerNode) return;
                const c = ctx;
                try {
                    blowerNode.g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3);
                    blowerNode.src.stop(c.currentTime + 0.35);
                } catch (_) {}
                blowerNode = null;
            },
            win() {
                [523, 659, 784, 1047].forEach((f, i) =>
                    setTimeout(() => tone(f, 0.4, "triangle", 0.2), i * 120));
            },
            lose() { tone(220, 0.5, "sine", 0.12); setTimeout(() => tone(165, 0.6, "sine", 0.12), 160); },
        };
    })();

    /* ---------- 3. Ticket: number grid ---------- */
    const grid = $("#numberGrid");
    const buttons = [];

    for (let n = 1; n <= TOTAL; n++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "num-btn";
        b.textContent = n;
        b.dataset.n = n;
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", () => toggle(n));
        grid.appendChild(b);
        buttons[n] = b;
    }

    function toggle(n) {
        if (state.phase !== "select") return;
        Sound.unlock();
        const btn = buttons[n];
        if (state.selected.has(n)) {
            state.selected.delete(n);
            btn.classList.remove("is-selected");
            btn.setAttribute("aria-pressed", "false");
        } else {
            if (state.selected.size >= PICKS) return;
            state.selected.add(n);
            btn.classList.add("is-selected");
            btn.setAttribute("aria-pressed", "true");
            Sound.pop();
        }
        syncTicket();
    }

    function syncTicket() {
        const count = state.selected.size;
        const remaining = PICKS - count;
        $("#remaining").textContent = remaining;
        $("#progress").style.width = (count / PICKS) * 100 + "%";

        // Disable the rest once 6 are chosen (selected ones stay clickable to deselect)
        const full = count >= PICKS;
        buttons.forEach((b, n) => {
            if (!n) return;
            b.disabled = full && !state.selected.has(n);
        });

        $("#clearBtn").disabled = count === 0;
        $("#playBtn").disabled = !full;
        $("#hint").textContent = full
            ? "Ready! Hit play to start the draw."
            : `Select ${remaining} more number${remaining === 1 ? "" : "s"} to enable the draw.`;
    }

    $("#quickPick").addEventListener("click", () => {
        if (state.phase !== "select") return;
        Sound.unlock();
        clearSelection();
        const pool = shuffle([...Array(TOTAL)].map((_, i) => i + 1));
        pool.slice(0, PICKS).forEach((n) => toggle(n));
    });

    $("#clearBtn").addEventListener("click", () => {
        if (state.phase !== "select") return;
        clearSelection();
        syncTicket();
    });

    function clearSelection() {
        state.selected.forEach((n) => {
            buttons[n].classList.remove("is-selected");
            buttons[n].setAttribute("aria-pressed", "false");
        });
        state.selected.clear();
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    /* ---------- 4. Prize table & jackpot ticker ---------- */
    function renderPrizeTable() {
        const rows = TIERS.map((t) => `
            <div class="flex items-center justify-between rounded-lg px-3 py-2 ${t.jackpot ? "bg-gold/10 ring-1 ring-gold/30" : "bg-white/[0.03]"}" data-tier="${t.label}">
                <span class="flex items-center gap-2 font-medium">
                    ${t.jackpot ? "👑" : "🎯"} ${t.label}
                </span>
                <span class="font-display font-bold tabular-nums ${t.jackpot ? "text-gold" : "text-slate-200"}">
                    ${t.jackpot ? "JACKPOT" : fmtCHF(t.prize)}
                </span>
            </div>`).join("");
        $("#prizeTable").innerHTML = rows;
    }

    function tickJackpot() {
        const el = $("#jackpot");
        const target = JACKPOT;
        const start = performance.now();
        const dur = 1400;
        const step = (now) => {
            const p = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = fmtCHF(Math.floor(target * eased));
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /* ---------- 5. The drum: bouncing-ball physics ---------- */
    const Drum = (() => {
        const drumEl = $("#drum");
        const layer = $("#drumBalls");
        const balls = [];
        let raf = null;
        let blowing = false;

        const metrics = () => {
            const r = drumEl.getBoundingClientRect();
            const ballSize = parseFloat(getComputedStyle(document.documentElement)
                .getPropertyValue("--ball-size")) * 16 || 36;
            return { R: r.width / 2, rad: ballSize / 2, size: ballSize };
        };

        function build(count = 22) {
            layer.innerHTML = "";
            balls.length = 0;
            const { R, rad } = metrics();
            for (let i = 0; i < count; i++) {
                const el = document.createElement("div");
                el.className = "ball";
                const num = 1 + Math.floor(Math.random() * TOTAL);
                el.textContent = num;
                el.style.setProperty("--ball-color", ballColor(num));
                layer.appendChild(el);
                // random position inside the circle
                const a = Math.random() * Math.PI * 2;
                const d = Math.random() * (R - rad - 4);
                balls.push({
                    el,
                    x: R + Math.cos(a) * d - rad,
                    y: R + Math.sin(a) * d - rad,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                });
            }
            draw();
        }

        function draw() {
            for (const b of balls) b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
        }

        function frame() {
            const { R, rad, size } = metrics();
            const gravity = 0.12;
            const damp = 0.86;
            for (const b of balls) {
                b.vy += gravity;
                if (blowing) {
                    b.vy -= 0.55 + Math.random() * 0.35;       // blower pushes balls up
                    b.vx += (Math.random() - 0.5) * 0.9;       // turbulence
                }
                b.x += b.vx;
                b.y += b.vy;

                // collide with circular wall
                const cx = b.x + rad, cy = b.y + rad;
                const dx = cx - R, dy = cy - R;
                const dist = Math.hypot(dx, dy);
                const max = R - rad - 2;
                if (dist > max) {
                    const nx = dx / dist, ny = dy / dist;
                    b.x = R + nx * max - rad;
                    b.y = R + ny * max - rad;
                    const dot = b.vx * nx + b.vy * ny;
                    b.vx = (b.vx - 2 * dot * nx) * damp;
                    b.vy = (b.vy - 2 * dot * ny) * damp;
                }
                // gentle friction so idle balls settle
                if (!blowing) { b.vx *= 0.99; b.vy *= 0.995; }
            }

            // cheap ball-ball separation
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    const a = balls[i], c = balls[j];
                    let dx = (c.x - a.x), dy = (c.y - a.y);
                    const d = Math.hypot(dx, dy) || 0.01;
                    if (d < size) {
                        const overlap = (size - d) / 2;
                        const nx = dx / d, ny = dy / d;
                        a.x -= nx * overlap; a.y -= ny * overlap;
                        c.x += nx * overlap; c.y += ny * overlap;
                        const tmpx = a.vx, tmpy = a.vy;
                        a.vx = c.vx * 0.9; a.vy = c.vy * 0.9;
                        c.vx = tmpx * 0.9; c.vy = tmpy * 0.9;
                    }
                }
            }
            draw();
            raf = requestAnimationFrame(frame);
        }

        return {
            build,
            start() {
                blowing = true;
                drumEl.classList.add("is-spinning");
                if (!raf && !reduceMotion) raf = requestAnimationFrame(frame);
            },
            calm() { blowing = false; },
            stop() {
                blowing = false;
                drumEl.classList.remove("is-spinning");
                if (raf) { cancelAnimationFrame(raf); raf = null; }
            },
            center() {
                const r = drumEl.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            },
        };
    })();

    /* ---------- result slots ---------- */
    const slotsEl = $("#resultSlots");
    function buildSlots() {
        slotsEl.innerHTML = "";
        for (let i = 0; i < PICKS; i++) {
            const s = document.createElement("div");
            s.className = "result-slot";
            slotsEl.appendChild(s);
        }
        // separator + bonus slot
        const plus = document.createElement("span");
        plus.className = "px-1 font-display text-xl font-bold text-gold";
        plus.textContent = "+";
        slotsEl.appendChild(plus);
        const bonus = document.createElement("div");
        bonus.className = "result-slot";
        bonus.dataset.bonus = "1";
        bonus.title = "Bonus number";
        slotsEl.appendChild(bonus);
    }

    function slotEls() {
        return [...slotsEl.querySelectorAll(".result-slot:not([data-bonus])")];
    }
    const bonusSlot = () => slotsEl.querySelector('.result-slot[data-bonus]');

    /* ---------- 6. The draw sequence ---------- */
    $("#playBtn").addEventListener("click", startDraw);

    async function startDraw() {
        if (state.phase !== "select" || state.selected.size !== PICKS) return;
        state.phase = "drawing";
        Sound.unlock();

        // lock the ticket
        buttons.forEach((b) => b && (b.disabled = true));
        $("#playBtn").disabled = true;
        $("#quickPick").disabled = true;
        $("#clearBtn").disabled = true;
        $("#hint").textContent = "Drawing… good luck!";
        setStatus("Mixing…", "amber");

        // generate the result up front (unique)
        const pool = shuffle([...Array(TOTAL)].map((_, i) => i + 1));
        state.drawn = pool.slice(0, PICKS);
        state.bonus = pool[PICKS];

        Drum.start();
        Sound.startBlower();
        await sleep(reduceMotion ? 200 : 1600);   // build suspense

        // draw the 6 main numbers
        for (let i = 0; i < PICKS; i++) {
            setStatus(`Drawing ${i + 1} of ${PICKS}…`, "amber");
            await drawOne(state.drawn[i], slotEls()[i], false);
            await sleep(reduceMotion ? 100 : 650);
        }
        // draw the bonus
        setStatus("Bonus number…", "amber");
        await drawOne(state.bonus, bonusSlot(), true);

        Drum.stop();
        Sound.stopBlower();
        finishDraw();
    }

    // Eject one ball: a flying ball travels from the drum centre to the slot.
    function drawOne(num, slot, isBonus) {
        return new Promise((resolve) => {
            const stage = $("#machineStage");
            const stageRect = stage.getBoundingClientRect();
            const ballSize = parseFloat(getComputedStyle(document.documentElement)
                .getPropertyValue("--ball-size")) * 16 || 36;

            const place = () => {
                const ball = document.createElement("div");
                ball.className = "ball" + (isBonus ? " ball--bonus" : "");
                ball.textContent = num;
                if (!isBonus) ball.style.setProperty("--ball-color", ballColor(num));
                ball.dataset.n = num;
                slot.appendChild(ball);
                slot.classList.add("animate-pop-in");
                Sound.pop();
                resolve();
            };

            if (reduceMotion) { place(); return; }

            const flyer = document.createElement("div");
            flyer.className = "ball ball--flying" + (isBonus ? " ball--bonus" : "");
            flyer.textContent = num;
            if (!isBonus) flyer.style.setProperty("--ball-color", ballColor(num));

            const c = Drum.center();
            const startX = c.x - stageRect.left - ballSize / 2;
            const startY = c.y - stageRect.top - ballSize / 2;
            flyer.style.transform = `translate(${startX}px, ${startY}px) scale(.9)`;
            stage.appendChild(flyer);

            const sr = slot.getBoundingClientRect();
            const endX = sr.left - stageRect.left + (sr.width - ballSize) / 2;
            const endY = sr.top - stageRect.top + (sr.height - ballSize) / 2;

            requestAnimationFrame(() => {
                flyer.style.transform = `translate(${endX}px, ${endY}px) scale(1.05)`;
            });
            flyer.addEventListener("transitionend", () => {
                flyer.remove();
                place();
            }, { once: true });
        });
    }

    function setStatus(text, tone) {
        const el = $("#drawStatus");
        el.textContent = text;
        el.className = "rounded-full border px-3 py-1 text-xs font-semibold " + ({
            amber: "border-gold/40 bg-gold/10 text-gold",
            green: "border-green-500/40 bg-green-500/10 text-green-300",
            slate: "border-white/10 bg-white/5 text-slate-300",
        }[tone] || "border-white/10 bg-white/5 text-slate-300");
    }

    /* ---------- 7. Reconciliation ---------- */
    function finishDraw() {
        state.phase = "done";
        const drawnSet = new Set(state.drawn);
        const hits = [...state.selected].filter((n) => drawnSet.has(n));
        const bonusHit = state.selected.has(state.bonus);

        // highlight matches on the ticket
        hits.forEach((n) => buttons[n].classList.add("is-hit"));
        // highlight matched result balls
        slotEls().forEach((s) => {
            const ball = s.querySelector(".ball");
            if (ball && state.selected.has(+ball.dataset.n)) ball.classList.add("is-hit");
        });
        if (bonusHit) {
            const bb = bonusSlot().querySelector(".ball");
            if (bb) bb.classList.add("is-hit");
        }

        // Evaluate tiers top-down; a bonus-requiring tier only counts if the bonus was hit.
        const tier = TIERS.find((t) => hits.length === t.match && (!t.bonus || bonusHit));

        setStatus(tier ? "Winner!" : "No win", tier ? "green" : "slate");
        showResult(tier, hits, bonusHit);
    }

    function showResult(tier, hits, bonusHit) {
        const modal = $("#resultModal");
        const won = !!tier;

        $("#resultEmoji").textContent = tier?.jackpot ? "👑" : won ? "🎉" : "🍀";
        $("#resultTitle").textContent = tier?.jackpot ? "JACKPOT!" : won ? "You Won!" : "So Close!";
        $("#resultTier").textContent = won
            ? tier.label + (bonusHit && !tier.bonus ? " (+ bonus)" : "")
            : `You matched ${hits.length} number${hits.length === 1 ? "" : "s"}`;
        $("#resultAmount").textContent = won ? fmtCHF(tier.prize) : fmtCHF(0);
        $("#resultAmount").classList.toggle("text-gold", won);
        $("#resultAmount").classList.toggle("text-slate-400", !won);

        $("#resultAccent").className = "absolute inset-x-0 top-0 h-1.5 " +
            (won ? "bg-gradient-to-r from-swiss-red via-gold to-swiss-red"
                 : "bg-gradient-to-r from-slate-600 to-slate-700");

        // mini summary of matched balls
        const matchHtml = state.drawn.map((n) => {
            const hit = state.selected.has(n);
            return `<div class="ball" style="position:static;--ball-color:${ballColor(n)};${hit ? "outline:3px solid #22c55e;outline-offset:2px;" : "opacity:.5;"}">${n}</div>`;
        }).join("") +
        `<span class="px-1 font-display font-bold text-gold">+</span>` +
        `<div class="ball ball--bonus" style="position:static;${bonusHit ? "outline:3px solid #22c55e;outline-offset:2px;" : "opacity:.5;"}">${state.bonus}</div>`;
        $("#resultMatches").innerHTML = matchHtml;

        modal.classList.remove("hidden");
        modal.classList.add("flex");
        $("#resultCard").classList.add("animate-pop-in");

        // highlight the winning row in the prize table
        if (won) {
            const row = $(`#prizeTable [data-tier="${tier.label}"]`);
            if (row) row.classList.add("ring-2", "ring-green-400");
        }

        if (won) {
            Sound.win();
            celebrate(tier.jackpot);
        } else {
            Sound.lose();
        }
    }

    function celebrate(big) {
        if (typeof confetti !== "function" || reduceMotion) return;
        const burst = (opts) => confetti(Object.assign({
            particleCount: big ? 160 : 90, spread: 75, origin: { y: 0.6 },
            colors: ["#e30613", "#f5c518", "#ffffff"],
        }, opts));
        burst({});
        if (big) {
            let n = 0;
            const t = setInterval(() => {
                burst({ angle: 60, spread: 90, origin: { x: 0 } });
                burst({ angle: 120, spread: 90, origin: { x: 1 } });
                if (++n > 6) clearInterval(t);
            }, 350);
        }
    }

    /* ---------- mute toggle & play again ---------- */
    $("#muteBtn").addEventListener("click", () => {
        state.muted = !state.muted;
        if (state.muted) Sound.stopBlower();
        $("#muteBtn").textContent = state.muted ? "🔇" : "🔊";
    });

    $("#playAgain").addEventListener("click", reset);

    function reset() {
        $("#resultModal").classList.add("hidden");
        $("#resultModal").classList.remove("flex");
        $("#resultCard").classList.remove("animate-pop-in");

        clearSelection();
        buttons.forEach((b) => b && b.classList.remove("is-hit"));
        document.querySelectorAll('#prizeTable [data-tier]')
            .forEach((r) => r.classList.remove("ring-2", "ring-green-400"));

        state.drawn = []; state.bonus = null; state.phase = "select";
        $("#quickPick").disabled = false;
        buildSlots();
        Drum.build();
        Drum.start(); requestAnimationFrame(() => Drum.calm()); // idle jiggle then settle
        setTimeout(() => Drum.stop(), 1200);
        setStatus("Idle", "slate");
        syncTicket();
    }

    /* ---------- boot ---------- */
    function init() {
        renderPrizeTable();
        tickJackpot();
        buildSlots();
        Drum.build();
        // a brief idle shuffle so the drum looks alive on load
        Drum.start();
        setTimeout(() => Drum.stop(), 1400);
        syncTicket();
        window.addEventListener("resize", () => { if (state.phase === "select") Drum.build(); });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
