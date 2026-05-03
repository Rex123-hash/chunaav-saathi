/**
 * @file time-machine.js
 * @description Election Time Machine — interactive historical election data viewer.
 * Supports a year-slider to browse Lok Sabha elections from 1952-2024 and
 * a side-by-side 2019 vs 2024 comparison mode.
 */
(function() {
    'use strict';

    const historicalData = {
      1952: {
        title: "1st Lok Sabha Elections",
        totalSeats: 489,
        turnout: 45.7,
        eligibleVoters: "173 Million",
        votesPolled: "79 Million",
        winner: {party: "INC", name: "Indian National Congress", alliance: "Single Party", seats: 364, percentage: 74.4, badgeText: "INC", badgeStyle: "linear-gradient(135deg, #3b82f6, #1d4ed8)"},
        parties: [
          {name: "INC", seats: 364, color: "#3b82f6"},
          {name: "CPI", seats: 16, color: "#ef4444"},
          {name: "Others", seats: 109, color: "#9333ea"}
        ]
      },
      1967: {
        title: "4th Lok Sabha Elections",
        totalSeats: 520,
        turnout: 61.3,
        eligibleVoters: "250 Million",
        votesPolled: "153 Million",
        winner: {party: "INC", name: "Indian National Congress", alliance: "Single Party", seats: 283, percentage: 54.4, badgeText: "INC", badgeStyle: "linear-gradient(135deg, #3b82f6, #1d4ed8)"},
        parties: [
          {name: "INC", seats: 283, color: "#3b82f6"},
          {name: "SWA", seats: 44, color: "#eab308"},
          {name: "Others", seats: 193, color: "#9333ea"}
        ]
      },
      1980: {
        title: "7th Lok Sabha Elections",
        totalSeats: 529,
        turnout: 56.9,
        eligibleVoters: "362 Million",
        votesPolled: "202 Million",
        winner: {party: "INC(I)", name: "Indian National Congress (I)", alliance: "Single Party", seats: 353, percentage: 66.7, badgeText: "INC", badgeStyle: "linear-gradient(135deg, #3b82f6, #1d4ed8)"},
        parties: [
          {name: "INC(I)", seats: 353, color: "#3b82f6"},
          {name: "JNP(S)", seats: 41, color: "#22c55e"},
          {name: "Others", seats: 135, color: "#9333ea"}
        ]
      },
      1998: {
        title: "12th Lok Sabha Elections",
        totalSeats: 543,
        turnout: 61.9,
        eligibleVoters: "605 Million",
        votesPolled: "374 Million",
        winner: {party: "BJP", name: "Bharatiya Janata Party", alliance: "NDA Alliance", seats: 182, percentage: 33.5, badgeText: "BJP", badgeStyle: "linear-gradient(135deg, #f97316, #ea580c)"},
        parties: [
          {name: "BJP", seats: 182, color: "#f97316"},
          {name: "INC", seats: 141, color: "#3b82f6"},
          {name: "Others", seats: 220, color: "#9333ea"}
        ]
      },
      2014: {
        title: "16th Lok Sabha Elections",
        totalSeats: 543,
        turnout: 66.4,
        eligibleVoters: "814 Million",
        votesPolled: "551 Million",
        winner: {party: "BJP", name: "Bharatiya Janata Party", alliance: "NDA Alliance", seats: 282, percentage: 52.0, badgeText: "BJP", badgeStyle: "linear-gradient(135deg, #f97316, #ea580c)"},
        parties: [
          {name: "BJP", seats: 282, color: "#f97316"},
          {name: "INC", seats: 44, color: "#3b82f6"},
          {name: "Others", seats: 217, color: "#9333ea"}
        ]
      },
      2019: {
        title: "17th Lok Sabha Elections",
        totalSeats: 543,
        turnout: 67.11,
        eligibleVoters: "900 Million",
        votesPolled: "614 Million",
        winner: {party: "BJP", name: "Bharatiya Janata Party", alliance: "NDA Alliance", seats: 303, percentage: 55.8, badgeText: "BJP", badgeStyle: "linear-gradient(135deg, #f97316, #ea580c)"},
        parties: [
          {name: "BJP", seats: 303, color: "#f97316"},
          {name: "INC", seats: 52, color: "#3b82f6"},
          {name: "Others", seats: 188, color: "#9333ea"}
        ]
      },
      2024: {
        title: "18th Lok Sabha Elections",
        totalSeats: 543,
        turnout: 67.40,
        eligibleVoters: "968 Million",
        votesPolled: "642 Million",
        winner: {party: "BJP", name: "Bharatiya Janata Party", alliance: "NDA Alliance", seats: 303, percentage: 55.8, badgeText: "BJP", badgeStyle: "linear-gradient(135deg, #f97316, #ea580c)"},
        parties: [
          {name: "BJP", seats: 303, color: "#f97316"},
          {name: "INC", seats: 99, color: "#3b82f6"},
          {name: "Others", seats: 141, color: "#9333ea"}
        ]
      }
    };

    // Helper to find the closest available year
    function getClosestYear(target) {
      const years = Object.keys(historicalData).map(Number).sort((a, b) => a - b);
      return years.reduce((prev, curr) => Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev);
    }

    const yearSlider = document.getElementById('yearSlider');
    const selectedYearDisplay = document.getElementById('selectedYear');

    if (yearSlider && selectedYearDisplay) {
      yearSlider.addEventListener('input', (e) => {
        const closestYear = getClosestYear(parseInt(e.target.value));
        selectedYearDisplay.textContent = closestYear;
        updateSingleView(closestYear);
      });
      
      // Initialize with 2024
      updateSingleView(2024);
    }

    function updateSingleView(year) {
      const data = historicalData[year];
      if (!data) return;
      
      const elTitle = document.getElementById('electionTitle');
      const elTotalSeats = document.getElementById('totalSeats');
      const elVoterTurnout = document.getElementById('voterTurnout');
      const elEligibleVoters = document.getElementById('eligibleVoters');
      const elVotesPolled = document.getElementById('votesPolled');
      const elWinnerName = document.getElementById('winnerName');
      const elWinnerAlliance = document.getElementById('winnerAlliance');
      const elWinnerBadge = document.getElementById('winnerBadge');
      const seatDistContainer = document.getElementById('seatDistribution');
      
      if (elTitle) elTitle.textContent = data.title;
      if (elTotalSeats) elTotalSeats.textContent = data.totalSeats;
      if (elVoterTurnout) elVoterTurnout.textContent = data.turnout + '%';
      if (elEligibleVoters) elEligibleVoters.textContent = data.eligibleVoters;
      if (elVotesPolled) elVotesPolled.textContent = data.votesPolled;
      
      if (elWinnerName) elWinnerName.textContent = data.winner.name;
      if (elWinnerAlliance) elWinnerAlliance.textContent = data.winner.alliance;
      if (elWinnerBadge) {
        elWinnerBadge.textContent = data.winner.badgeText;
        elWinnerBadge.style.background = data.winner.badgeStyle;
      }
      
      // Update seat distribution
      if (seatDistContainer && data.parties) {
        seatDistContainer.innerHTML = data.parties.map(party => `
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="font-semibold">${party.name}</span>
              <span class="font-bold">${party.seats} seats</span>
            </div>
            <div class="bg-white/20 rounded-full h-6 overflow-hidden">
              <div class="h-6 flex items-center px-3 text-xs font-semibold" 
                   style="width: ${(party.seats/data.totalSeats*100).toFixed(1)}%; background: ${party.color}">
                ${(party.seats/data.totalSeats*100).toFixed(1)}%
              </div>
            </div>
          </div>
        `).join('');
      }
    }

    // View toggles
    const singleViewBtn = document.getElementById('singleViewBtn');
    const compareViewBtn = document.getElementById('compareViewBtn');
    const singleView = document.getElementById('singleView');
    const compareView = document.getElementById('compareView');

    if (singleViewBtn && compareViewBtn && singleView && compareView) {
      singleViewBtn.addEventListener('click', () => {
        singleView.classList.remove('hidden');
        singleView.classList.add('block');
        compareView.classList.add('hidden');
        compareView.classList.remove('block');
        
        singleViewBtn.classList.add('bg-gradient-to-r', 'from-orange-500', 'to-green-500', 'border-transparent');
        singleViewBtn.classList.remove('bg-white/10', 'border', 'border-white/20');
        
        compareViewBtn.classList.remove('bg-gradient-to-r', 'from-orange-500', 'to-green-500', 'border-transparent');
        compareViewBtn.classList.add('bg-white/10', 'border', 'border-white/20');
      });

      compareViewBtn.addEventListener('click', () => {
        singleView.classList.add('hidden');
        singleView.classList.remove('block');
        compareView.classList.remove('hidden');
        compareView.classList.add('block');
        
        compareViewBtn.classList.add('bg-gradient-to-r', 'from-orange-500', 'to-green-500', 'border-transparent');
        compareViewBtn.classList.remove('bg-white/10', 'border', 'border-white/20');
        
        singleViewBtn.classList.remove('bg-gradient-to-r', 'from-orange-500', 'to-green-500', 'border-transparent');
        singleViewBtn.classList.add('bg-white/10', 'border', 'border-white/20');
      });
    }

  })();
  