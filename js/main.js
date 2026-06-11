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

    /* ---------- 5. The drum: weighted bouncing-ball physics ----------
       requestAnimationFrame loop (no CSS transitions / spring libs).
       Balls have real weight: strong gravity, low restitution, motion
       squash/stretch, and momentum-redirecting ball-ball collisions. */
    const getBallSize = () =>
        parseFloat(getComputedStyle(document.documentElement)
            .getPropertyValue("--ball-size")) * 16 || 36;

    const Drum = (() => {
        const drumEl = $("#drum");
        const layer = $("#drumBalls");
        const balls = [];
        let raf = null;
        let blowPower = 0;          // 0 = off, 0.5 = idle, 1 = full mix

        const metrics = () => {
            const r = drumEl.getBoundingClientRect();
            const size = getBallSize();
            return { R: r.width / 2, rad: size / 2, size };
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
                const a = Math.random() * Math.PI * 2;
                const d = Math.random() * (R - rad - 4);
                balls.push({
                    el,
                    x: R + Math.cos(a) * d - rad,
                    y: R + Math.sin(a) * d - rad,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                    squash: 0,            // transient deform on impact (decays)
                });
            }
            draw();
        }

        function draw() {
            for (const b of balls) {
                const speed = Math.hypot(b.vx, b.vy);
                // motion stretch + impact squash, oriented along velocity
                const stretch = Math.min(0.34, speed * 0.022 + b.squash * 0.26);
                const ang = Math.atan2(b.vy, b.vx);
                b.el.style.transform =
                    `translate(${b.x}px, ${b.y}px) rotate(${ang}rad) ` +
                    `scale(${1 + stretch}, ${1 - stretch * 0.65}) rotate(${-ang}rad)`;
                b.squash *= 0.84;
            }
        }

        const MAXV = 15;            // velocity clamp — keeps the sim stable & weighty

        function frame() {
            const { R, rad, size } = metrics();
            const gravity = 0.55;   // heavy 50mm-ball feel — they do NOT float
            const wallDamp = 0.62;  // plastic-on-glass: low bounce

            for (const b of balls) {
                b.vy += gravity;
                if (blowPower) {
                    // air blower: upward gusts + lateral turbulence (chaotic)
                    b.vy -= Math.random() * 1.7 * blowPower;
                    b.vx += (Math.random() - 0.5) * 2.0 * blowPower;
                    if (Math.random() < 0.04 * blowPower) b.vy -= 4 * blowPower; // strong gust
                }
                // clamp speed
                const sp = Math.hypot(b.vx, b.vy);
                if (sp > MAXV) { b.vx *= MAXV / sp; b.vy *= MAXV / sp; }

                b.x += b.vx;
                b.y += b.vy;

                // collide with circular wall (squash on impact)
                const cx = b.x + rad, cy = b.y + rad;
                const dx = cx - R, dy = cy - R;
                const dist = Math.hypot(dx, dy) || 0.01;
                const max = R - rad - 2;
                if (dist > max) {
                    const nx = dx / dist, ny = dy / dist;
                    b.x = R + nx * max - rad;
                    b.y = R + ny * max - rad;
                    const dot = b.vx * nx + b.vy * ny;
                    b.vx = (b.vx - 2 * dot * nx) * wallDamp;
                    b.vy = (b.vy - 2 * dot * ny) * wallDamp;
                    b.squash = Math.min(1, Math.abs(dot) * 0.07);
                }
                if (!blowPower) { b.vx *= 0.985; b.vy *= 0.99; } // settle when idle
            }

            // ball-ball collisions: separate + redirect momentum (no pass-through)
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    const a = balls[i], c = balls[j];
                    const dx = c.x - a.x, dy = c.y - a.y;
                    const d = Math.hypot(dx, dy) || 0.01;
                    if (d < size) {
                        const overlap = (size - d) / 2;
                        const nx = dx / d, ny = dy / d;
                        a.x -= nx * overlap; a.y -= ny * overlap;
                        c.x += nx * overlap; c.y += ny * overlap;
                        // exchange the velocity component along the contact normal
                        const va = a.vx * nx + a.vy * ny;
                        const vc = c.vx * nx + c.vy * ny;
                        const diff = (vc - va) * 0.9;
                        a.vx += diff * nx; a.vy += diff * ny;
                        c.vx -= diff * nx; c.vy -= diff * ny;
                        a.squash = Math.max(a.squash, Math.min(0.7, Math.abs(diff) * 0.08));
                        c.squash = a.squash;
                    }
                }
            }
            draw();
            raf = requestAnimationFrame(frame);
        }

        function run() { if (!raf && !reduceMotion) raf = requestAnimationFrame(frame); }

        return {
            build,
            // gentle idle churn (load / reset)
            start() { blowPower = 0.5; drumEl.classList.add("is-spinning"); run(); },
            // Phase A: full chaotic mixing
            mix() {
                blowPower = 1;
                drumEl.classList.remove("is-spinning");
                drumEl.classList.add("is-mixing");
                run();
            },
            calm() { blowPower = 0; },
            stop() {
                blowPower = 0;
                drumEl.classList.remove("is-spinning", "is-mixing");
                if (raf) { cancelAnimationFrame(raf); raf = null; }
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

    /* ---------- 5b. The tube: a drawn, curved exit pipe ----------
       Spans the machine card from the drum's bottom chute down to the
       left of the Winning Numbers row. Balls follow its centre-line via
       SVG getPointAtLength, so the path is curved and fully responsive. */
    const Tube = (() => {
        const cardEl = $("#machineCard");
        const svg = $("#tubeSvg");
        let bore = null;            // path the balls follow
        let geom = null;            // { startX, startY, exitX, exitY }

        const cardRect = () => cardEl.getBoundingClientRect();
        const toCard = (rect) => {
            const c = cardRect();
            return {
                x: rect.left - c.left, y: rect.top - c.top,
                w: rect.width, h: rect.height,
                cx: rect.left - c.left + rect.width / 2,
                cy: rect.top - c.top + rect.height / 2,
            };
        };

        function build() {
            const c = cardRect();
            if (!c.width) return;
            svg.setAttribute("viewBox", `0 0 ${c.width} ${c.height}`);

            const drum = toCard($("#drum").getBoundingClientRect());
            const row = toCard(slotsEl.getBoundingClientRect());
            const r = getBallSize() / 2;

            // start at the drum's bottom chute
            const startX = drum.cx;
            const startY = drum.y + drum.h - 6;
            // exit just to the LEFT of the results row, level with the slots
            const exitX = Math.max(r + 8, row.x - r - 2);
            const exitY = row.cy;

            // S-curve: drop straight, then sweep left to the exit
            const d =
                `M ${startX} ${startY} ` +
                `C ${startX} ${startY + 46}, ` +
                `${exitX + (startX - exitX) * 0.5} ${(startY + exitY) / 2 + 14}, ` +
                `${exitX} ${exitY}`;

            const casing = Math.max(getBallSize() + 10, 32);
            svg.innerHTML =
                `<path class="tube-casing" d="${d}" stroke-width="${casing}"/>` +
                `<path class="tube-bore" d="${d}" stroke-width="${casing - 9}"/>`;
            bore = svg.querySelector(".tube-bore");
            geom = { startX, startY, exitX, exitY };
        }

        return {
            build,
            get start() { return { x: geom.startX, y: geom.startY }; },
            get exit() { return { x: geom.exitX, y: geom.exitY }; },
            length: () => bore.getTotalLength(),
            pointAt: (len) => bore.getPointAtLength(len),
            toCard,
            ready: () => !!bore,
        };
    })();

    const fxLayer = $("#machineFx");
    const slotCenter = (slot) => Tube.toCard(slot.getBoundingClientRect());

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

        // generate the result up front (unique)
        const pool = shuffle([...Array(TOTAL)].map((_, i) => i + 1));
        state.drawn = pool.slice(0, PICKS);
        state.bonus = pool[PICKS];

        Tube.build();   // make sure the pipe geometry is current

        // ----- Phase A: mixing (~4.5s of chaotic tumbling) -----
        setStatus("Mixing…", "amber");
        Drum.mix();
        Sound.startBlower();
        await sleep(reduceMotion ? 200 : 4500);

        // ----- Phase B + C: eject the balls one at a time -----
        for (let i = 0; i < PICKS; i++) {
            setStatus(`Drawing ${i + 1} of ${PICKS}…`, "amber");
            await drawOne(state.drawn[i], slotEls()[i], false);
            await sleep(reduceMotion ? 80 : 320);
        }
        setStatus("Bonus number…", "amber");
        await drawOne(state.bonus, bonusSlot(), true);

        Drum.stop();
        Sound.stopBlower();
        finishDraw();
    }

    /* Place the final resting ball into its slot, with one bounce + glow. */
    function settleBall(num, slot, isBonus) {
        const ball = document.createElement("div");
        ball.className = "ball" + (isBonus ? " ball--bonus" : "") + (reduceMotion ? "" : " ball--settle");
        ball.textContent = num;
        if (!isBonus) ball.style.setProperty("--ball-color", ballColor(num));
        ball.dataset.n = num;
        slot.appendChild(ball);

        slot.style.setProperty("--glow", isBonus ? "#f5c518" : ballColor(num));
        slot.classList.add("is-glowing");
        setTimeout(() => slot.classList.remove("is-glowing"), 600);
        Sound.pop();
    }

    /* Phase B: roll the ball down the curved tube (drum -> exit). */
    function travelTube(flyer) {
        return new Promise((resolve) => {
            const L = Tube.length();
            const r = getBallSize() / 2;
            const dur = 1150;
            let t0 = null, last = null, roll = 0;
            const stepFn = (now) => {
                if (t0 === null) t0 = now;
                const t = Math.min(1, (now - t0) / dur);
                // smoothstep: ease in (drop into tube) then ease out (decelerate at exit)
                const e = t * t * (3 - 2 * t);
                const pt = Tube.pointAt(e * L);
                if (last) roll += Math.hypot(pt.x - last.x, pt.y - last.y) / r;
                last = pt;
                flyer.style.transform = `translate(${pt.x - r}px, ${pt.y - r}px) rotate(${roll}rad)`;
                if (t < 1) requestAnimationFrame(stepFn);
                else resolve(pt);
            };
            requestAnimationFrame(stepFn);
        });
    }

    /* Phase C: roll out of the tube into the slot, entering from the left. */
    function slideToSlot(flyer, slot, from) {
        return new Promise((resolve) => {
            const r = getBallSize() / 2;
            const s = slotCenter(slot);
            const dur = 540;
            let t0 = null, lastX = from.x, roll = 0;
            const stepFn = (now) => {
                if (t0 === null) t0 = now;
                const t = Math.min(1, (now - t0) / dur);
                const e = 1 - Math.pow(1 - t, 3);          // ease-out: decelerate
                const x = from.x + (s.cx - from.x) * e;
                const y = from.y + (s.cy - from.y) * e;
                roll += Math.abs(x - lastX) / r;            // rolling rightwards
                lastX = x;
                flyer.style.transform = `translate(${x - r}px, ${y - r}px) rotate(${roll}rad)`;
                if (t < 1) requestAnimationFrame(stepFn);
                else resolve();
            };
            requestAnimationFrame(stepFn);
        });
    }

    /* Full ejection of one ball: Phase B -> Phase C -> rest. */
    async function drawOne(num, slot, isBonus) {
        if (reduceMotion || !Tube.ready()) {
            settleBall(num, slot, isBonus);
            return;
        }
        const r = getBallSize() / 2;
        const flyer = document.createElement("div");
        flyer.className = "ball ball--flying" + (isBonus ? " ball--bonus" : "");
        flyer.textContent = num;
        if (!isBonus) flyer.style.setProperty("--ball-color", ballColor(num));
        const start = Tube.start;
        flyer.style.transform = `translate(${start.x - r}px, ${start.y - r}px)`;
        fxLayer.appendChild(flyer);
        Sound.tick();

        const exitPt = await travelTube(flyer);   // Phase B
        await slideToSlot(flyer, slot, exitPt);    // Phase C
        flyer.remove();
        settleBall(num, slot, isBonus);            // one-bounce rest + glow
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
        Tube.build();
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
        Tube.build();
        // a brief idle shuffle so the drum looks alive on load
        Drum.start();
        setTimeout(() => Drum.stop(), 1400);
        syncTicket();
        window.addEventListener("resize", () => {
            Tube.build();
            if (state.phase === "select") Drum.build();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
