/**
 * @file heatmap.js
 * @description Smart Voting Planner & Booth Intelligence module.
 * Renders an SVG bubble-density map of India, booth search with autocomplete,
 * hourly crowd bars, accessibility info, and a live queue ticker.
 */
(function() {
    'use strict';

    // ── Mock Booth & State Data (demo purposes) ────────────────────
    const BOOTH_DATA = {
      booths: [
        { id:101, name:'Rajiv Gandhi School', constituency:'Mumbai North', queue:8,  wait:'3-5 min',  crowd:'low',    qPct:16,
          access:{wheelchair:true,braille:true,senior:true,volunteer:true},
          hours:[{t:'7-9 AM',pct:35,lbl:'Low',col:'#22c55e'},{t:'9-12 PM',pct:80,lbl:'Peak',col:'#ef4444'},{t:'12-3 PM',pct:55,lbl:'Medium',col:'#f97316'},{t:'3-6 PM',pct:28,lbl:'Low',col:'#22c55e'}] },
        { id:102, name:'Gandhi Community Hall', constituency:'Mumbai South', queue:45, wait:'18-22 min', crowd:'high',   qPct:90,
          access:{wheelchair:true,braille:false,senior:true,volunteer:false},
          hours:[{t:'7-9 AM',pct:60,lbl:'Medium',col:'#f97316'},{t:'9-12 PM',pct:95,lbl:'Peak',col:'#ef4444'},{t:'12-3 PM',pct:75,lbl:'High',col:'#ef4444'},{t:'3-6 PM',pct:40,lbl:'Low',col:'#22c55e'}] },
        { id:103, name:'Nehru Primary School', constituency:'Delhi Central', queue:22, wait:'8-12 min', crowd:'medium', qPct:44,
          access:{wheelchair:false,braille:true,senior:true,volunteer:true},
          hours:[{t:'7-9 AM',pct:45,lbl:'Low',col:'#22c55e'},{t:'9-12 PM',pct:88,lbl:'Peak',col:'#ef4444'},{t:'12-3 PM',pct:60,lbl:'Medium',col:'#f97316'},{t:'3-6 PM',pct:35,lbl:'Low',col:'#22c55e'}] },
        { id:104, name:'Ambedkar Public Hall',  constituency:'Bangalore South', queue:5, wait:'2-3 min', crowd:'low', qPct:10,
          access:{wheelchair:true,braille:true,senior:true,volunteer:true},
          hours:[{t:'7-9 AM',pct:30,lbl:'Low',col:'#22c55e'},{t:'9-12 PM',pct:70,lbl:'High',col:'#ef4444'},{t:'12-3 PM',pct:50,lbl:'Medium',col:'#f97316'},{t:'3-6 PM',pct:25,lbl:'Low',col:'#22c55e'}] },
        { id:105, name:'Shivaji Municipal School', constituency:'Pune', queue:30, wait:'12-15 min', crowd:'medium', qPct:60,
          access:{wheelchair:true,braille:false,senior:false,volunteer:true},
          hours:[{t:'7-9 AM',pct:50,lbl:'Medium',col:'#f97316'},{t:'9-12 PM',pct:90,lbl:'Peak',col:'#ef4444'},{t:'12-3 PM',pct:65,lbl:'Medium',col:'#f97316'},{t:'3-6 PM',pct:38,lbl:'Low',col:'#22c55e'}] },
        { id:106, name:'Tagore Vidyalaya',        constituency:'Kolkata North', queue:12, wait:'5-8 min', crowd:'low', qPct:24,
          access:{wheelchair:false,braille:false,senior:true,volunteer:true},
          hours:[{t:'7-9 AM',pct:40,lbl:'Low',col:'#22c55e'},{t:'9-12 PM',pct:82,lbl:'Peak',col:'#ef4444'},{t:'12-3 PM',pct:58,lbl:'Medium',col:'#f97316'},{t:'3-6 PM',pct:33,lbl:'Low',col:'#22c55e'}] },
      ],
      // State bubbles: [name, cx, cy, density, turnout]
      states: [
        ['J&K',     200, 50,  'low',    62.1, '#22c55e'],
        ['Punjab',  175, 95,  'medium', 71.3, '#f97316'],
        ['HP',      230, 90,  'low',    69.8, '#22c55e'],
        ['Uttarakhand',265,115,'medium',64.4,'#f97316'],
        ['Delhi',   230,155,  'high',   60.2, '#ef4444'],
        ['UP',      280,175,  'high',   59.3, '#ef4444'],
        ['Bihar',   330,190,  'high',   55.7, '#ef4444'],
        ['WB',      370,200,  'medium', 80.4, '#f97316'],
        ['Rajasthan',195,195, 'medium', 67.8, '#f97316'],
        ['MP',      245,235,  'medium', 72.1, '#f97316'],
        ['Jharkhand',330,240, 'low',    66.3, '#22c55e'],
        ['Odisha',  350,270,  'low',    74.1, '#22c55e'],
        ['Gujarat', 175,255,  'medium', 65.8, '#f97316'],
        ['Maharashtra',215,290,'high',  72.3, '#ef4444'],
        ['Chhattisgarh',285,275,'low',  70.5,'#22c55e'],
        ['Telangana',270,320,  'medium',68.1, '#f97316'],
        ['AP',      295,355,  'medium', 79.7, '#f97316'],
        ['Karnataka',245,355, 'high',   73.2, '#ef4444'],
        ['Tamil Nadu',275,405,'medium', 72.8, '#f97316'],
        ['Kerala',  240,415,  'low',    77.6, '#22c55e'],
        ['NE',      410,170,  'low',    85.2, '#22c55e'],
      ]
    };

    const ACCESS_LABELS = {
      wheelchair: 'Wheelchair ramp',
      braille:    'Braille guide',
      senior:     'Senior priority lane',
      volunteer:  'Volunteer assistance'
    };

    // ── Render SVG Bubble Map ──────────────────────────────────────
    function renderBubbleMap() {
      const g = document.getElementById('stateBubbles');
      const tooltip = document.getElementById('mapTooltip');
      const ttBg = document.getElementById('ttBg');
      const ttName = document.getElementById('ttName');
      const ttVal  = document.getElementById('ttVal');
      if (!g) return;

      BOOTH_DATA.states.forEach(([name, cx, cy, density, turnout, color], i) => {
        const r = density === 'high' ? 22 : density === 'medium' ? 17 : 13;
        // Outer pulse ring
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', r + 8);
        ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', color);
        ring.setAttribute('stroke-width', '1'); ring.setAttribute('opacity', '0.3');
        ring.style.animation = `pulse-dot ${2 + (i % 3) * 0.5}s ease infinite`;
        g.appendChild(ring);

        // Main bubble
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', r);
        circle.setAttribute('fill', color); circle.setAttribute('fill-opacity', '0.75');
        circle.setAttribute('filter', 'url(#glow)');
        circle.style.cursor = 'pointer';
        circle.style.transition = 'r 0.2s ease, fill-opacity 0.2s ease';

        // Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', cx); label.setAttribute('y', cy + 4);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', r > 17 ? '8' : '7');
        label.setAttribute('fill', 'white'); label.setAttribute('font-family', 'Inter,sans-serif');
        label.setAttribute('font-weight', 'bold'); label.setAttribute('pointer-events', 'none');
        label.textContent = name.length > 6 ? name.slice(0,5) + '…' : name;

        // Hover events
        circle.addEventListener('mouseenter', (e) => {
          circle.setAttribute('fill-opacity', '1');
          circle.setAttribute('r', r + 3);
          // Position tooltip
          const px = Math.min(cx + 14, 430), py = Math.max(cy - 36, 10);
          ttBg.setAttribute('x', px - 4); ttBg.setAttribute('y', py - 14);
          ttBg.setAttribute('width', '130'); ttBg.setAttribute('height', '34');
          ttName.setAttribute('x', px); ttName.setAttribute('y', py);
          ttName.textContent = name;
          ttVal.setAttribute('x', px); ttVal.setAttribute('y', py + 14);
          ttVal.textContent = `Turnout: ${turnout}% · ${density.charAt(0).toUpperCase() + density.slice(1)} crowd`;
          tooltip.style.display = 'block';
        });
        circle.addEventListener('mouseleave', () => {
          circle.setAttribute('fill-opacity', '0.75');
          circle.setAttribute('r', r);
          tooltip.style.display = 'none';
        });
        circle.addEventListener('click', () => {
          // Show related booths for this state
          showToast(`Showing booths for ${name}`, '📍');
        });

        g.appendChild(ring);
        g.appendChild(circle);
        g.appendChild(label);
      });

      // Bring tooltip to front
      const svg = document.getElementById('indiaBubbleMap');
      if (svg && tooltip) svg.appendChild(tooltip);
    }

    // ── Render Hourly Bars ─────────────────────────────────────────
    function renderHourlyBars(booth) {
      const container = document.getElementById('hourlyBars');
      const hint = document.getElementById('bestTimeHint');
      if (!container) return;
      const best = booth.hours.reduce((a, b) => a.pct < b.pct ? a : b);
      container.innerHTML = booth.hours.map(h => `
        <div class="flex items-center gap-3">
          <span class="text-xs text-white/70 w-16 shrink-0">${h.t}</span>
          <div class="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
            <div class="h-6 flex items-center justify-center text-xs font-semibold text-white transition-all duration-1000 rounded-full"
                 style="width:${h.pct}%;background:${h.col}">
              ${h.lbl}
            </div>
          </div>
          <span class="text-xs text-white/50 w-8 text-right">${h.pct}%</span>
        </div>`).join('');
      if (hint) hint.textContent = `Best: ${best.t} — only ~${best.pct}% crowd expected`;
    }

    // ── Render Accessibility ───────────────────────────────────────
    function renderAccessibility(booth) {
      const el = document.getElementById('accessibilityList');
      if (!el) return;
      el.innerHTML = Object.entries(ACCESS_LABELS).map(([key, label]) => `
        <div class="flex items-center gap-1.5">
          <i data-lucide="${booth.access[key] ? 'check-circle' : 'x-circle'}"
             class="w-4 h-4 shrink-0 ${booth.access[key] ? 'text-green-400' : 'text-white/30'}"></i>
          <span class="${booth.access[key] ? 'text-white/80' : 'text-white/30'}">${label}</span>
        </div>`).join('');
      if (window.lucide) lucide.createIcons();
    }

    // ── Render Nearby Booths ───────────────────────────────────────
    function renderNearby(current) {
      const panel = document.getElementById('nearbyBooths');
      const list  = document.getElementById('nearbyList');
      if (!panel || !list) return;
      const others = BOOTH_DATA.booths.filter(b => b.id !== current.id).slice(0, 3);
      const colors = { low:'bg-green-500/20 text-green-300', medium:'bg-orange-500/20 text-orange-300', high:'bg-red-500/20 text-red-300' };
      list.innerHTML = others.map(b => `
        <div class="glass-card rounded-xl p-3 cursor-pointer hover:bg-white/10 transition" onclick="selectBooth(${b.id})">
          <div class="flex justify-between items-start mb-2">
            <span class="text-sm font-semibold">#${b.id}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-bold ${colors[b.crowd]}">${b.crowd}</span>
          </div>
          <p class="text-xs text-white/80">${b.name}</p>
          <p class="text-xs text-white/50 mt-0.5">${b.constituency}</p>
          <p class="text-xs text-white/60 mt-1">Wait: ${b.wait}</p>
        </div>`).join('');
      panel.classList.remove('hidden');
    }

    // ── Show Booth Details ─────────────────────────────────────────
    function showBoothDetails(booth) {
      document.getElementById('boothDetails')?.classList.remove('hidden');
      document.getElementById('boothName').textContent        = `Booth #${booth.id} — ${booth.name}`;
      document.getElementById('boothConstituency').textContent = `Constituency: ${booth.constituency}`;
      document.getElementById('boothQueue').textContent        = `~${booth.queue} people`;
      document.getElementById('boothWait').textContent         = booth.wait;
      // Queue bar + badge
      const bar   = document.getElementById('boothQueueBar');
      const badge = document.getElementById('boothCrowdBadge');
      const colMap = { low:'#22c55e', medium:'#f97316', high:'#ef4444' };
      const bgMap  = { low:'bg-green-500/20 text-green-300', medium:'bg-orange-500/20 text-orange-300', high:'bg-red-500/20 text-red-300' };
      if (bar)   { bar.style.width = booth.qPct + '%'; bar.style.background = colMap[booth.crowd]; }
      if (badge) { badge.className = `px-2 py-0.5 rounded-full text-xs font-bold ${bgMap[booth.crowd]}`; badge.textContent = booth.crowd.charAt(0).toUpperCase() + booth.crowd.slice(1); }
      renderHourlyBars(booth);
      renderAccessibility(booth);
      renderNearby(booth);
      // Scroll booth details into view
      document.getElementById('boothDetails')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }

    // Allow external selection (from Nearby cards)
    window.selectBooth = function(id) {
      const booth = BOOTH_DATA.booths.find(b => b.id === id);
      if (booth) showBoothDetails(booth);
    };

    // ── Booth Search Autocomplete ──────────────────────────────────
    function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

    function initBoothSearch() {
      const input   = document.getElementById('boothSearch');
      const sugBox  = document.getElementById('boothSuggestions');
      const btn     = document.getElementById('boothSearchBtn');
      if (!input || !sugBox) return;

      const doSearch = (q) => {
        const query = q.trim().toLowerCase();
        if (query.length < 2) { sugBox.classList.add('hidden'); return; }
        const results = BOOTH_DATA.booths.filter(b =>
          b.name.toLowerCase().includes(query) ||
          b.constituency.toLowerCase().includes(query) ||
          String(b.id).includes(query)
        );
        if (!results.length) { sugBox.classList.add('hidden'); return; }
        sugBox.innerHTML = results.map(b => `
          <button class="w-full text-left px-4 py-2 hover:bg-white/10 transition flex justify-between items-center border-b border-white/5 last:border-0"
                  onclick="selectBoothFromSearch(${b.id})">
            <span>#${b.id} ${b.name} <span class="text-white/50 text-xs">(${b.constituency})</span></span>
            <span class="text-xs ${b.crowd === 'low' ? 'text-green-300' : b.crowd === 'medium' ? 'text-orange-300' : 'text-red-300'}">${b.crowd}</span>
          </button>`).join('');
        sugBox.classList.remove('hidden');
      };

      input.addEventListener('input', debounce((e) => doSearch(e.target.value), 250));
      btn.addEventListener('click', () => doSearch(input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(input.value); });
      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !sugBox.contains(e.target)) sugBox.classList.add('hidden');
      });
    }

    window.selectBoothFromSearch = function(id) {
      const booth = BOOTH_DATA.booths.find(b => b.id === id);
      if (!booth) return;
      document.getElementById('boothSearch').value = `#${booth.id} ${booth.name}`;
      document.getElementById('boothSuggestions')?.classList.add('hidden');
      showBoothDetails(booth);
      showToast(`Booth #${booth.id} loaded`, '📍');
    };

    // ── Simulated Live Queue Ticker ────────────────────────────────
    function startLiveTicker() {
      setInterval(() => {
        // Randomly nudge queue numbers up/down slightly for demo realism
        BOOTH_DATA.booths.forEach(b => {
          b.queue = Math.max(2, b.queue + (Math.random() > 0.5 ? 1 : -1));
          b.qPct  = Math.min(100, Math.max(5, b.qPct + (Math.random() > 0.5 ? 2 : -2)));
        });
        // Refresh displayed booth if visible
        const name = document.getElementById('boothName')?.textContent;
        if (name && !name.includes('—')) {
          const id = parseInt(name.match(/#(\d+)/)?.[1]);
          const b = BOOTH_DATA.booths.find(x => x.id === id);
          if (b) {
            document.getElementById('boothQueue').textContent = `~${b.queue} people`;
            const bar = document.getElementById('boothQueueBar');
            if (bar) bar.style.width = b.qPct + '%';
          }
        }
      }, 4000);
    }

    // ── Default state: show first booth's timing bars ──────────────
    function renderDefaultHourlyBars() {
      renderHourlyBars(BOOTH_DATA.booths[0]);
      renderAccessibility(BOOTH_DATA.booths[0]);
    }

    // ── Init ───────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
      renderBubbleMap();
      renderDefaultHourlyBars();
      initBoothSearch();
      startLiveTicker();
      if (window.lucide) lucide.createIcons();
    });

  })();
  