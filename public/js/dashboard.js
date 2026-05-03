/**
 * @file dashboard.js
 * @description Chunav Saathi — Dashboard, constituency tracker, news feed,
 * participation leaderboard, EVM simulator, and FAQ accordion.
 * All data is mock/demo for the PromptWars hackathon submission.
 */
(function() {
    'use strict';

    // ── Mock Data ──────────────────────────────────────────────────
    const MOCK = {
      turnout: 67.8, votes: 523456789, stations: 12453, statesCount: 28,
      constituencies: [
        {name:'Mumbai North',state:'Maharashtra',party:'NDA',color:'#f97316',margin:3421,pct:52},
        {name:'Lucknow',state:'UP',party:'NDA',color:'#f97316',margin:8823,pct:58},
        {name:'Bangalore South',state:'Karnataka',party:'NDA',color:'#f97316',margin:5210,pct:54},
        {name:'Chennai Central',state:'Tamil Nadu',party:'INDIA',color:'#3b82f6',margin:2100,pct:48},
        {name:'Pune',state:'Maharashtra',party:'NDA',color:'#f97316',margin:1234,pct:51},
        {name:'Ahmedabad East',state:'Gujarat',party:'NDA',color:'#f97316',margin:9012,pct:61},
        {name:'New Delhi',state:'Delhi',party:'NDA',color:'#f97316',margin:4567,pct:55},
        {name:'Varanasi',state:'UP',party:'NDA',color:'#f97316',margin:15244,pct:63},
        {name:'Hyderabad',state:'Telangana',party:'AIMIM',color:'#8b5cf6',margin:3322,pct:49},
        {name:'Kolkata North',state:'WB',party:'TMC',color:'#22c55e',margin:2890,pct:50},
      ],
      states: [
        {name:'Nagaland',flag:'🏔️',pct:87.2,prev:83.1},
        {name:'Sikkim',flag:'🌿',pct:82.6,prev:80.3},
        {name:'Tripura',flag:'🎋',pct:81.8,prev:79.9},
        {name:'Manipur',flag:'🌸',pct:79.5,prev:76.4},
        {name:'Goa',flag:'🏖️',pct:78.3,prev:75.1},
      ],
      news: [
        {h:'ECI announces 96.8 crore voters registered for 2024 General Elections',src:'ECI',t:'2h ago',cat:'eci',v:true,fc:null},
        {h:'VVPAT slips to be matched in 5 randomly selected EVMs per constituency',src:'PIB',t:'4h ago',cat:'eci',v:true,fc:null},
        {h:'Claim: EVMs can be hacked via Bluetooth signals',src:'Social Media',t:'6h ago',cat:'factcheck',v:false,fc:8},
        {h:'Voter turnout hits record 67.8% — highest since 1984',src:'NDTV',t:'1h ago',cat:'breaking',v:true,fc:null},
        {h:'Model Code of Conduct violations: 1,400 cases registered',src:'The Hindu',t:'3h ago',cat:'eci',v:true,fc:null},
        {h:'Claim: Voting without Aadhaar will invalidate your vote',src:'WhatsApp',t:'8h ago',cat:'factcheck',v:false,fc:12},
      ],
      faqs: [
        {q:'Can I vote without my Voter ID card?',a:'Yes! ECI allows 12 alternate documents including Aadhaar, Passport, Driving License, MNREGA Card, and more. As long as your name is on the Electoral Roll, you can vote.',cat:'registration',views:24531},
        {q:'How do I register to vote for the first time?',a:'Visit voterportal.eci.gov.in or use the Voter Helpline App. Fill Form 6 (online or offline). Deadline is typically 30 days before election.',cat:'firsttime',views:18234},
        {q:'Can EVMs be hacked or manipulated remotely?',a:'No. EVMs are standalone machines with no Wi-Fi, Bluetooth, or internet connectivity. They are sealed and verified by all candidates before voting. The VVPAT provides a paper audit trail.',cat:'evm',views:31245},
        {q:'What is NOTA and when should I use it?',a:'NOTA (None of the Above) is a ballot option for voters who find no candidate suitable. Press the NOTA button (last option) on the EVM. NOTA votes are counted but do not affect results.',cat:'process',views:14822},
        {q:'Can I take a selfie in the voting booth?',a:'No. Photography inside the voting compartment is strictly prohibited under Section 128 of the Representation of People Act. You can be legally penalized.',cat:'process',views:9102},
        {q:'What if my name is missing from the voter list?',a:'Contact your local BLO (Booth Level Officer) or ERO (Electoral Registration Officer) immediately. File an application at voterportal.eci.gov.in. You can also call 1950 (National Voter Helpline).',cat:'registration',views:11502},
        {q:'How does the VVPAT work?',a:'After you press the EVM candidate button, the VVPAT machine prints a slip showing candidate name, symbol, and serial number. This slip is visible for 7 seconds, then drops into a sealed box. It provides a physical audit trail.',cat:'evm',views:8731},
        {q:'I am a first-time voter. What should I bring on election day?',a:'Bring your Voter ID (EPIC card) or any 1 of 12 approved alternate documents. Wear comfortable clothes. Indelible ink will be applied to your left index finger. Keep your polling booth address handy.',cat:'firsttime',views:21045},
      ],
      evmCandidates: [
        {name:'Amit Kumar',party:'Party A',symbol:'🌸',color:'#f97316'},
        {name:'Priya Singh',party:'Party B',symbol:'🌿',color:'#3b82f6'},
        {name:'Ravi Mehta',party:'Party C',symbol:'⭐',color:'#8b5cf6'},
        {name:'NOTA',party:'None of the Above',symbol:'✗',color:'#6b7280'},
      ]
    };

    // ── Smooth scroll + active nav highlight ───────────────────────
    (function setupNav() {
      const NAV_HEIGHT = 64; // sticky nav height in px

      // Enable CSS smooth scroll on the whole page
      document.documentElement.style.scrollBehavior = 'smooth';

      // Handle all anchor clicks — preventDefault + offset for sticky nav
      document.addEventListener('click', function(e) {
        const link = e.target.closest('a[href^="#"]');
        if (!link) return;
        const targetId = link.getAttribute('href').slice(1); // strip '#'
        const target = document.getElementById(targetId);
        if (!target) return;
        e.preventDefault();
        const top = target.getBoundingClientRect().top + window.scrollY - NAV_HEIGHT - 8;
        window.scrollTo({ top, behavior: 'smooth' });
        // Close mobile nav if open
        document.getElementById('mobileNav')?.classList.remove('open');
        // Immediately mark clicked link active
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll(`.nav-link[href="#${targetId}"]`).forEach(l => l.classList.add('active'));
      });

      // IntersectionObserver to highlight active section while scrolling
      const sections = document.querySelectorAll('section[id]');
      const navLinks = document.querySelectorAll('.nav-link[href^="#"]');

      const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach(l => {
              l.classList.toggle('active', l.getAttribute('href') === `#${id}`);
            });
          }
        });
      }, { rootMargin: `-${NAV_HEIGHT}px 0px -60% 0px`, threshold: 0 });

      sections.forEach(s => obs.observe(s));
    })();

    // ── Mobile nav toggle ──────────────────────────────────────────
    window.toggleMobileNav = function() {
      document.getElementById('mobileNav')?.classList.toggle('open');
    };
    document.getElementById('hamBtn')?.addEventListener('click', toggleMobileNav);

    // ── Toast ──────────────────────────────────────────────────────
    function showToast(msg, icon = 'ℹ️') {
      const t = document.getElementById('toast');
      if (!t) return;
      t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }

    // ── Scroll Reveal ──────────────────────────────────────────────
    const revealObs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

    // ── Counter Animation ──────────────────────────────────────────
    function animateCount(el, target, suffix = '', decimals = 0, duration = 1800) {
      const start = performance.now();
      const update = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const val = p * target;
        el.textContent = (decimals > 0 ? val.toFixed(decimals) : Math.floor(val).toLocaleString('en-IN')) + suffix;
        if (p < 1) requestAnimationFrame(update);
      };
      requestAnimationFrame(update);
    }

    // ── Dashboard ──────────────────────────────────────────────────
    function initDashboard() {
      const dashObs = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        dashObs.disconnect();
        animateCount(document.getElementById('ctr-turnout'), MOCK.turnout, '%', 1);
        animateCount(document.getElementById('ctr-votes'), MOCK.votes, '');
        animateCount(document.getElementById('ctr-stations'), MOCK.stations, '');
        animateCount(document.getElementById('ctr-states'), MOCK.statesCount, '');
        setTimeout(() => {
          const bar = document.getElementById('bar-turnout');
          if (bar) bar.style.width = MOCK.turnout + '%';
        }, 200);
        initCharts();
      }, { threshold: 0.2 });
      const sec = document.getElementById('s-dashboard');
      if (sec) dashObs.observe(sec);
    }

    function initCharts() {
      // Hourly trend
      const tCtx = document.getElementById('trendChart')?.getContext('2d');
      if (tCtx) new Chart(tCtx, {
        type: 'line',
        data: {
          labels: ['7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM'],
          datasets: [{ label: 'Votes (Millions)', data: [2,8,18,31,42,52,59,65,72,80,88,94], borderColor: '#fb923c', backgroundColor: 'rgba(251,146,60,0.1)', fill: true, tension: 0.4, pointRadius: 3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#ffffff80', font: { size: 10 } }, grid: { color: '#ffffff10' } }, y: { ticks: { color: '#ffffff80', font: { size: 10 } }, grid: { color: '#ffffff10' } } } }
      });
      // Urban vs Rural donut
      const sCtx = document.getElementById('splitChart')?.getContext('2d');
      if (sCtx) new Chart(sCtx, {
        type: 'doughnut',
        data: { labels: ['Urban','Rural','Semi-Urban'], datasets: [{ data: [38, 49, 13], backgroundColor: ['#fb923c','#22c55e','#8b5cf6'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#ffffff80', font: { size: 11 } } } } }
      });
    }

    // ── Constituency Tracker ───────────────────────────────────────
    function renderConstituencies(filter = '') {
      const list = document.getElementById('conList');
      if (!list) return;
      const state = document.getElementById('stateFilter')?.value || 'all';
      const data = MOCK.constituencies.filter(c =>
        (state === 'all' || c.state === state) &&
        c.name.toLowerCase().includes(filter.toLowerCase())
      );
      list.innerHTML = data.length ? data.map(c => `
        <div class="glass-card rounded-xl p-3 flex items-center gap-3">
          <div class="flex-1">
            <div class="font-semibold text-sm">${c.name}</div>
            <div class="text-xs text-white/50">${c.state}</div>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold px-2 py-0.5 rounded-full" style="background:${c.color}30;color:${c.color}">${c.party}</span>
            <div class="text-xs text-white/50 mt-1">Margin: ${c.margin.toLocaleString()}</div>
          </div>
          <div class="w-20">
            <div class="con-bar" style="width:${c.pct}%;background:${c.color}"></div>
            <div class="text-xs text-center text-white/50 mt-1">${c.pct}%</div>
          </div>
        </div>`).join('') : '<p class="text-white/40 text-center py-8">No constituencies found</p>';
    }
    document.getElementById('conSearch')?.addEventListener('input', e => renderConstituencies(e.target.value));
    document.getElementById('stateFilter')?.addEventListener('change', () => renderConstituencies(document.getElementById('conSearch')?.value || ''));

    // ── News Feed ──────────────────────────────────────────────────
    function renderNews(filter = 'all') {
      const feed = document.getElementById('newsFeed');
      if (!feed) return;
      const items = filter === 'all' ? MOCK.news : MOCK.news.filter(n => n.cat === filter);
      feed.innerHTML = items.map(n => `
        <div class="glass-card rounded-xl p-4 hover:bg-white/10 transition">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-bold px-2 py-0.5 rounded-full ${n.v ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}">${n.v ? '✓ Verified' : '⚠ Unverified'}</span>
            <span class="text-xs text-white/40">${n.src}</span>
            <span class="text-xs text-white/40 ml-auto">${n.t}</span>
          </div>
          <p class="text-sm font-medium leading-snug mb-2">${n.h}</p>
          ${n.fc !== null ? `<span class="text-xs text-red-300">Truth Score: ${n.fc}/100 — <button class="underline" onclick="document.querySelector('[data-feature=\'myth-buster\']').click()">Fact-Check It</button></span>` : ''}
        </div>`).join('');
    }
    document.querySelectorAll('.news-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.news-filter').forEach(b => { b.classList.remove('active','bg-orange-500/30','border-orange-400/40'); b.classList.add('bg-white/10','border-white/20'); });
        btn.classList.add('active','bg-orange-500/30','border-orange-400/40'); btn.classList.remove('bg-white/10','border-white/20');
        renderNews(btn.dataset.filter);
      });
    });

    // ── Participation Leaderboard ──────────────────────────────────
    function initParticipation() {
      const top = document.getElementById('topStates');
      if (top) top.innerHTML = MOCK.states.map((s, i) => `
        <div class="flex items-center gap-3">
          <span class="text-lg">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
          <span class="text-lg">${s.flag}</span>
          <div class="flex-1">
            <div class="flex justify-between text-sm mb-1"><span>${s.name}</span><span class="font-bold text-green-300">${s.pct}%</span></div>
            <div class="bg-white/10 rounded-full h-1.5"><div class="con-bar bg-gradient-to-r from-green-400 to-green-600" style="width:${s.pct}%"></div></div>
          </div>
        </div>`).join('');
      if (typeof confetti !== 'undefined') { try { confetti({ particleCount:60, spread:70, origin:{y:0.4} }); } catch(e){} }
      // Comparison chart
      const cCtx = document.getElementById('compareChart')?.getContext('2d');
      if (cCtx) new Chart(cCtx, {
        type: 'bar',
        data: {
          labels: MOCK.states.map(s => s.name),
          datasets: [
            { label: '2024', data: MOCK.states.map(s => s.pct), backgroundColor: '#fb923c' },
            { label: '2019', data: MOCK.states.map(s => s.prev), backgroundColor: '#3b82f6' }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#ffffff80', font: { size: 10 } } } }, scales: { x: { ticks: { color: '#ffffff80', font: { size: 9 } }, grid: { color: '#ffffff10' } }, y: { ticks: { color: '#ffffff80', font: { size: 10 } }, grid: { color: '#ffffff10' }, min: 70 } } }
      });
    }

    // ── EVM Simulator ─────────────────────────────────────────────
    function initEVM() {
      const container = document.getElementById('evmCandidates');
      if (!container) return;
      container.innerHTML = MOCK.evmCandidates.map((c, i) => `
        <button class="evm-btn w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm" style="border-color:${c.color}40;background:${c.color}10" onclick="castVote(${i})">
          <span class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border-2" style="border-color:${c.color};color:${c.color}">${i+1}</span>
          <span>${c.symbol} ${c.name}</span>
        </button>`).join('');
    }

    window.castVote = function(i) {
      const c = MOCK.evmCandidates[i];
      const slip = document.getElementById('vvpatSlip');
      const content = document.getElementById('vvpatContent');
      const step = document.getElementById('evmStep');
      if (!slip || !content || !step) return;
      content.innerHTML = `<div><strong>Candidate:</strong> ${c.name}</div><div><strong>Party:</strong> ${c.party}</div><div><strong>Symbol:</strong> ${c.symbol}</div>`;
      slip.classList.remove('hidden');
      step.innerHTML = '<div class="text-4xl mb-2">✅</div><p class="text-sm text-green-300 font-semibold">Vote Cast Successfully! VVPAT slip visible for 7 seconds.</p>';
      if (c.name !== 'NOTA' && typeof confetti !== 'undefined') { try { confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } }); } catch(e){} }
      document.querySelectorAll('.evm-btn').forEach(b => b.disabled = true);
      setTimeout(() => { slip.classList.add('hidden'); }, 7000);
    };

    window.resetEVM = function() {
      document.getElementById('vvpatSlip')?.classList.add('hidden');
      const step = document.getElementById('evmStep');
      if (step) step.innerHTML = '<div class="text-4xl mb-2">👆</div><p class="text-sm text-white/80">Press any candidate button on the EVM to cast your vote</p>';
      document.querySelectorAll('.evm-btn').forEach(b => b.disabled = false);
    };

    // ── FAQ Accordion ──────────────────────────────────────────────
    function renderFAQ(filter = 'all', search = '') {
      const list = document.getElementById('faqList');
      if (!list) return;
      const data = MOCK.faqs.filter(f =>
        (filter === 'all' || f.cat === filter) &&
        (f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()))
      );
      list.innerHTML = data.length ? data.map((f, i) => `
        <div class="glass-card rounded-xl overflow-hidden">
          <button class="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 transition" onclick="toggleFAQ('faq${i}')" aria-expanded="false">
            <span class="text-sm font-medium">${f.q}</span>
            <span class="text-white/40 text-xs shrink-0">${f.views.toLocaleString()} asked ▾</span>
          </button>
          <div id="faq${i}" class="faq-answer px-4">
            <p class="text-sm text-white/80 pb-4 leading-relaxed">${f.a}</p>
            <button class="mb-3 text-xs text-orange-300 underline" onclick="document.querySelector('[data-feature=\'explainer\']').click()">Ask AI for more detail →</button>
          </div>
        </div>`).join('') : '<p class="text-white/40 text-center py-8">No FAQs found. <button class="text-orange-300 underline" onclick="document.querySelector(\"[data-feature=\'explainer\']\").click()">Ask AI instead</button></p>';
    }

    window.toggleFAQ = function(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('open');
    };

    document.getElementById('faqSearch')?.addEventListener('input', e => {
      const cat = document.querySelector('.faq-cat.active')?.dataset.cat || 'all';
      renderFAQ(cat, e.target.value);
    });
    document.querySelectorAll('.faq-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.faq-cat').forEach(b => { b.classList.remove('active','bg-orange-500/30','border-orange-400/40'); b.classList.add('bg-white/10','border-white/20'); });
        btn.classList.add('active','bg-orange-500/30','border-orange-400/40'); btn.classList.remove('bg-white/10','border-white/20');
        renderFAQ(btn.dataset.cat, document.getElementById('faqSearch')?.value || '');
      });
    });

    // ── Init All ───────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
      initDashboard();
      renderConstituencies();
      renderNews();
      initParticipation();
      initEVM();
      renderFAQ();
      // Pad main for sticky nav
      document.querySelector('main')?.style.setProperty('padding-top', '72px');
    });

  })();
  