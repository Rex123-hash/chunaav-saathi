
    /**
     * Voter Journey - 5-Step Wizard
     * Tracks user progress through Firestore API
     */
    (function() {
      'use strict';

      // ==========================================
      // STATE MANAGEMENT
      // ==========================================
      
      /** @typedef {Object} JourneyState */
      const AppState = {
        currentStep: 1,
        userId: localStorage.getItem('chunav_userId') || generateUserId(),
        isProcessing: false,
        journeyData: {
          completed_modules: [],
          stage: 1,
          progress: 0
        }
      };

      // ==========================================
      // STEP CONTENT DEFINITIONS
      // ==========================================
      
      const STEPS = {
        1: {
          title: "Am I Eligible to Vote?",
          icon: "user-check",
          content: `
            <h3 class="text-xl md:text-2xl font-bold mb-4">Check Your Eligibility</h3>
            <p class="text-white/80 mb-6 text-sm md:text-base">To vote in Indian elections, you must meet these criteria:</p>
            
            <div class="space-y-4 mb-6">
              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <i data-lucide="calendar" class="w-5 h-5 md:w-6 md:h-6 text-orange-400 shrink-0 mt-0.5"></i>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Age Requirement</h4>
                  <p class="text-xs md:text-sm text-white/70 leading-relaxed">You must be 18 years or older on the qualifying date (January 1st of the election year).</p>
                </div>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <i data-lucide="flag" class="w-5 h-5 md:w-6 md:h-6 text-green-400 shrink-0 mt-0.5"></i>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Citizenship</h4>
                  <p class="text-xs md:text-sm text-white/70 leading-relaxed">You must be a citizen of India.</p>
                </div>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <i data-lucide="map-pin" class="w-5 h-5 md:w-6 md:h-6 text-blue-400 shrink-0 mt-0.5"></i>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Residence</h4>
                  <p class="text-xs md:text-sm text-white/70 leading-relaxed">You must be an ordinary resident of the polling area of the constituency where you want to be enrolled.</p>
                </div>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <i data-lucide="shield-check" class="w-5 h-5 md:w-6 md:h-6 text-purple-400 shrink-0 mt-0.5"></i>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">No Disqualifications</h4>
                  <p class="text-xs md:text-sm text-white/70 leading-relaxed">You must not be disqualified under any law (e.g., unsound mind, criminal conviction).</p>
                </div>
              </div>
            </div>

            <div class="bg-gradient-to-r from-orange-500/20 to-green-500/20 border border-white/10 rounded-xl p-4">
              <p class="text-sm md:text-base">
                ✅ <strong>Good news!</strong> If you meet all criteria, you're eligible to register and vote.
              </p>
            </div>
          `,
          moduleId: 'eligibility_check'
        },

        2: {
          title: "Register to Vote",
          icon: "file-text",
          content: `
            <h3 class="text-xl md:text-2xl font-bold mb-4">How to Register</h3>
            <p class="text-white/80 mb-6 text-sm md:text-base">Registration is free and can be done online or offline.</p>

            <div class="space-y-4 mb-6">
              <div class="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 class="font-semibold mb-3 flex items-center gap-2 text-sm md:text-base">
                  <i data-lucide="monitor" class="w-5 h-5 text-blue-300"></i>
                  Online Registration (Recommended)
                </h4>
                <ol class="text-xs md:text-sm text-white/80 space-y-2 pl-5 list-decimal">
                  <li>Visit <a href="https://voters.eci.gov.in" target="_blank" rel="noopener noreferrer" class="underline text-orange-400 hover:text-orange-300 transition">voters.eci.gov.in</a></li>
                  <li>Click on "Apply Online for Registration of New Voter"</li>
                  <li>Fill Form 6 with personal details</li>
                  <li>Upload required documents (age proof, address proof, photo)</li>
                  <li>Submit and note your Application Reference Number</li>
                </ol>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 class="font-semibold mb-3 flex items-center gap-2 text-sm md:text-base">
                  <i data-lucide="file" class="w-5 h-5 text-orange-300"></i>
                  Required Documents
                </h4>
                <ul class="text-xs md:text-sm text-white/80 space-y-1 pl-5 list-disc">
                  <li><strong>Age Proof:</strong> Birth certificate, Aadhaar, PAN card, Passport</li>
                  <li><strong>Address Proof:</strong> Aadhaar, Passport, Utility bill, Rent agreement</li>
                  <li><strong>Recent photograph:</strong> Passport size</li>
                </ul>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <i data-lucide="clock" class="w-5 h-5 text-green-300 shrink-0 mt-0.5"></i>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Timeline</h4>
                  <p class="text-xs md:text-sm text-white/70">Your application will be verified within <strong>30 days</strong>. You'll receive your EPIC (Voter ID card) by post.</p>
                </div>
              </div>
            </div>

            <div class="bg-blue-500/20 border border-blue-500/30 rounded-xl p-4">
              <p class="text-sm md:text-base">
                💡 <strong>Pro tip:</strong> You can track your application status using your Reference Number on the NVSP website.
              </p>
            </div>
          `,
          moduleId: 'registration'
        },

        3: {
          title: "Find Your Polling Booth",
          icon: "map-pin",
          content: `
            <h3 class="text-xl md:text-2xl font-bold mb-4">Locate Your Polling Station</h3>
            <p class="text-white/80 mb-6 text-sm md:text-base">Know exactly where to vote on election day.</p>

            <div class="space-y-4 mb-6">
              <div class="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 class="font-semibold mb-2 text-sm md:text-base">Search by EPIC Number</h4>
                <p class="text-xs md:text-sm text-white/60 mb-3">If you have your Voter ID card:</p>
                <ol class="text-xs md:text-sm text-white/80 space-y-2 pl-5 list-decimal">
                  <li>Visit <a href="https://electoralsearch.eci.gov.in" target="_blank" rel="noopener noreferrer" class="underline text-orange-400 hover:text-orange-300">electoralsearch.eci.gov.in</a></li>
                  <li>Enter your EPIC number</li>
                  <li>View your polling station details and exact map location</li>
                </ol>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 class="font-semibold mb-2 text-sm md:text-base">Search by Details</h4>
                <p class="text-xs md:text-sm text-white/60 mb-3">If you don't have your EPIC number handy:</p>
                <ol class="text-xs md:text-sm text-white/80 space-y-2 pl-5 list-decimal">
                  <li>Use the "Search by Details" option on the portal</li>
                  <li>Enter your name, father/husband's name, age, and state</li>
                  <li>Find your name in the electoral roll and note the booth</li>
                </ol>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <i data-lucide="smartphone" class="w-5 h-5 md:w-6 md:h-6 text-purple-300 shrink-0 mt-0.5"></i>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Mobile Apps</h4>
                  <p class="text-xs md:text-sm text-white/70">
                    Download the <strong>Voter Helpline App</strong> (Android/iOS) to find your polling booth, check status, and report issues easily.
                  </p>
                </div>
              </div>
            </div>

            <div class="bg-green-500/20 border border-green-500/30 rounded-xl p-4">
              <p class="text-sm md:text-base">
                📍 <strong>Note:</strong> Visit your polling booth before election day to familiarize yourself with the route.
              </p>
            </div>
          `,
          moduleId: 'find_booth'
        },

        4: {
          title: "Understand the Voting Process",
          icon: "info",
          content: `
            <h3 class="text-xl md:text-2xl font-bold mb-4">How Voting Works</h3>
            <p class="text-white/80 mb-6 text-sm md:text-base">Step-by-step guide to casting your vote inside the booth.</p>

            <div class="space-y-3 mb-6">
              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <div class="bg-orange-500/30 rounded-full w-7 h-7 md:w-8 md:h-8 flex items-center justify-center shrink-0">
                  <span class="font-bold text-sm">1</span>
                </div>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Queue & Identification</h4>
                  <p class="text-xs md:text-sm text-white/70">Show your EPIC or any valid photo ID to the First Polling Officer.</p>
                </div>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <div class="bg-orange-500/30 rounded-full w-7 h-7 md:w-8 md:h-8 flex items-center justify-center shrink-0">
                  <span class="font-bold text-sm">2</span>
                </div>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Ink Marking</h4>
                  <p class="text-xs md:text-sm text-white/70">The Second Polling Officer will mark your left index finger with indelible ink.</p>
                </div>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <div class="bg-green-500/30 rounded-full w-7 h-7 md:w-8 md:h-8 flex items-center justify-center shrink-0">
                  <span class="font-bold text-sm">3</span>
                </div>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">EVM Voting</h4>
                  <p class="text-xs md:text-sm text-white/70">Inside the voting compartment, press the blue button next to your chosen candidate's name and symbol on the EVM.</p>
                </div>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <div class="bg-green-500/30 rounded-full w-7 h-7 md:w-8 md:h-8 flex items-center justify-center shrink-0">
                  <span class="font-bold text-sm">4</span>
                </div>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">VVPAT Verification</h4>
                  <p class="text-xs md:text-sm text-white/70">A paper slip will be visible behind the VVPAT glass for 7 seconds showing your vote — verify it!</p>
                </div>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <div class="bg-blue-500/30 rounded-full w-7 h-7 md:w-8 md:h-8 flex items-center justify-center shrink-0">
                  <span class="font-bold text-sm">5</span>
                </div>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Exit</h4>
                  <p class="text-xs md:text-sm text-white/70">Once the red light flashes on the EVM and you hear a long beep, your vote is cast. You can now exit.</p>
                </div>
              </div>
            </div>

            <div class="bg-purple-500/20 border border-purple-500/30 rounded-xl p-4">
              <p class="text-sm md:text-base">
                🔒 <strong>Secrecy:</strong> Your vote is completely secret. No one can ever trace whom you voted for.
              </p>
            </div>
          `,
          moduleId: 'voting_process'
        },

        5: {
          title: "Election Day Checklist",
          icon: "check-circle",
          content: `
            <h3 class="text-xl md:text-2xl font-bold mb-4">Ready for Election Day!</h3>
            <p class="text-white/80 mb-6 text-sm md:text-base">Everything you need to know for a smooth voting experience.</p>

            <div class="space-y-4 mb-6">
              <div class="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 class="font-semibold mb-3 flex items-center gap-2 text-sm md:text-base">
                  <i data-lucide="clipboard-check" class="w-5 h-5 text-orange-300"></i>
                  What to Bring
                </h4>
                <ul class="text-xs md:text-sm text-white/80 space-y-2 pl-5 list-disc">
                  <li>EPIC (Voter ID) <strong>OR</strong> any of the 11 alternative valid photo IDs (Aadhaar, Passport, Driving License, PAN card, etc.)</li>
                  <li>Voter Information Slip (optional, but speeds up identification)</li>
                </ul>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <i data-lucide="clock" class="w-5 h-5 md:w-6 md:h-6 text-blue-300 shrink-0 mt-0.5"></i>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Timing</h4>
                  <p class="text-xs md:text-sm text-white/70">Polling typically runs from <strong>7:00 AM to 6:00 PM</strong>. Arrive early to avoid the peak heat and long crowds.</p>
                </div>
              </div>

              <div class="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 class="font-semibold mb-3 flex items-center gap-2 text-sm md:text-base">
                  <i data-lucide="alert-triangle" class="w-5 h-5 text-red-400"></i>
                  Strict Don'ts
                </h4>
                <ul class="text-xs md:text-sm text-white/80 space-y-2 pl-5 list-disc">
                  <li>No mobile phones inside the actual voting compartment.</li>
                  <li>No photography or selfies inside the polling booth.</li>
                  <li>Do not wear or carry any party symbols or campaign materials.</li>
                  <li>No canvassing or soliciting votes within 100 meters of the station.</li>
                </ul>
              </div>
              
              <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <i data-lucide="phone" class="w-5 h-5 md:w-6 md:h-6 text-green-300 shrink-0 mt-0.5"></i>
                <div>
                  <h4 class="font-semibold mb-1 text-sm md:text-base">Need Help?</h4>
                  <p class="text-xs md:text-sm text-white/70">Call the ECI Toll-Free Helpline at <strong>1950</strong> for immediate assistance.</p>
                </div>
              </div>
            </div>

            <div class="bg-gradient-to-r from-orange-500/20 via-white/10 to-green-500/20 border border-white/20 rounded-xl p-6 text-center">
              <div class="text-4xl mb-3">🎉</div>
              <h4 class="text-lg md:text-xl font-bold mb-2">Almost There!</h4>
              <p class="text-sm text-white/80">
                Click "Complete Journey" below to finalize your voter education!
              </p>
            </div>
          `,
          moduleId: 'election_day'
        }
      };

      // ==========================================
      // INITIALIZATION
      // ==========================================
      
      /**
       * Initialize application on DOM ready
       */
      async function init() {
        lucide.createIcons();
        setupEventListeners();
        
        // Attempt to load journey state from API
        await loadJourney();
        renderStep();
      }

      // ==========================================
      // EVENT LISTENERS
      // ==========================================
      
      /**
       * Set up navigation event listeners
       */
      function setupEventListeners() {
        document.getElementById('prevBtn')?.addEventListener('click', prevStep);
        document.getElementById('nextBtn')?.addEventListener('click', nextStep);
      }

      // ==========================================
      // STEP NAVIGATION
      // ==========================================
      
      /**
       * Handle "Next" / "Complete" button click
       */
      async function nextStep() {
        if (AppState.isProcessing) return;
        AppState.isProcessing = true;

        try {
          if (AppState.currentStep < 5) {
            // Mark current module as complete
            const moduleId = STEPS[AppState.currentStep].moduleId;
            if (!AppState.journeyData.completed_modules.includes(moduleId)) {
              AppState.journeyData.completed_modules.push(moduleId);
            }
            
            AppState.currentStep++;
            AppState.journeyData.stage = AppState.currentStep;
            AppState.journeyData.progress = (AppState.currentStep - 1) * 25;
            
            await saveJourney();
            renderStep();
          } else {
            // Final step completion
            const moduleId = STEPS[5].moduleId;
            if (!AppState.journeyData.completed_modules.includes(moduleId)) {
              AppState.journeyData.completed_modules.push(moduleId);
            }
            AppState.journeyData.progress = 100;
            
            await saveJourney();
            completeJourney();
          }
        } catch (error) {
          handleError(error, 'nextStep');
        } finally {
          AppState.isProcessing = false;
        }
      }

      /**
       * Handle "Previous" button click
       */
      function prevStep() {
        if (AppState.currentStep > 1) {
          AppState.currentStep--;
          renderStep();
        }
      }

      // ==========================================
      // RENDERING
      // ==========================================
      
      /**
       * Render current step content and update UI state
       */
      function renderStep() {
        const step = STEPS[AppState.currentStep];
        const contentContainer = document.getElementById('stepContent');
        
        if (!contentContainer) return;

        // Reset animation by triggering reflow
        contentContainer.classList.remove('fade-in');
        void contentContainer.offsetWidth;
        
        // Set content securely using innerHTML for static trusted content
        // (XSS protection rule applies to user-generated content, but this is static predefined HTML)
        contentContainer.innerHTML = step.content;
        contentContainer.classList.add('fade-in');
        
        updateStepper();
        updateButtons();
        
        // Re-initialize icons inside new HTML content
        lucide.createIcons();
      }

      /**
       * Update visual progress stepper dots and line
       */
      function updateStepper() {
        // Update step dots
        document.querySelectorAll('.step-dot').forEach((dot, index) => {
          const stepNum = index + 1;
          dot.classList.remove('active', 'completed');
          
          if (stepNum < AppState.currentStep) {
            dot.classList.add('completed');
          } else if (stepNum === AppState.currentStep) {
            dot.classList.add('active');
          }
        });

        // Update progress line and ARIA attributes
        const progressLine = document.getElementById('progressLine');
        if (progressLine) {
          const progressPct = ((AppState.currentStep - 1) / 4) * 100;
          progressLine.style.width = `${progressPct}%`;
          progressLine.setAttribute('aria-valuenow', progressPct);
        }
      }

      /**
       * Update button states based on current step
       */
      function updateButtons() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        if (prevBtn) {
          prevBtn.disabled = AppState.currentStep === 1;
        }
        
        if (nextBtn) {
          if (AppState.currentStep === 5) {
            nextBtn.innerHTML = `Complete Journey <i data-lucide="check" class="w-5 h-5 ml-2 inline"></i>`;
            nextBtn.classList.remove('from-orange-500/30', 'to-green-500/30');
            nextBtn.classList.add('bg-green-600/60', 'hover:bg-green-500/80', 'border-green-400');
          } else {
            nextBtn.innerHTML = `Next <i data-lucide="chevron-right" class="w-5 h-5 ml-2 inline"></i>`;
            nextBtn.classList.add('from-orange-500/30', 'to-green-500/30');
            nextBtn.classList.remove('bg-green-600/60', 'hover:bg-green-500/80', 'border-green-400');
          }
        }
      }

      // ==========================================
      // API / FIRESTORE INTEGRATION
      // ==========================================
      
      /**
       * Fetch journey state from API
       */
      async function loadJourney() {
        try {
          const response = await fetch(`/api/v1/voter-journey/${AppState.userId}`);
          if (response.ok) {
            const data = await response.json();
            AppState.journeyData = data;
            // Cap the loaded stage at 5
            AppState.currentStep = Math.min(data.stage || 1, 5);
          }
        } catch (error) {
          // Non-critical, gracefully degrade to step 1
          handleError(error, 'loadJourney (Using defaults)');
        }
      }

      /**
       * Save current journey progress to API
       */
      async function saveJourney() {
        try {
          const payload = {
            stage: AppState.journeyData.stage,
            completed_modules: AppState.journeyData.completed_modules,
            progress: AppState.journeyData.progress
          };
          
          await fetch(`/api/v1/voter-journey/${AppState.userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (error) {
          handleError(error, 'saveJourney');
        }
      }

      /**
       * Trigger confetti and success state
       */
      function completeJourney() {
        // Fire canvas confetti
        if (typeof confetti === 'function') {
          const duration = 3000;
          const end = Date.now() + duration;

          (function frame() {
            confetti({
              particleCount: 5,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
              colors: ['#FF9933', '#FFFFFF', '#138808']
            });
            confetti({
              particleCount: 5,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
              colors: ['#FF9933', '#FFFFFF', '#138808']
            });

            if (Date.now() < end) {
              requestAnimationFrame(frame);
            }
          }());
        }

        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
          nextBtn.disabled = true;
          nextBtn.textContent = 'Completed!';
        }

        setTimeout(() => {
          // Allow returning home
          window.location.href = '/';
        }, 3500);
      }

      // ==========================================
      // UTILITIES
      // ==========================================
      
      /**
       * Generate a random session-based userId
       * @returns {string}
       */
      function generateUserId() {
        const id = 'voter_' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('chunav_userId', id);
        return id;
      }

      /**
       * Structured Error Handler
       * @param {Error} error 
       * @param {string} context 
       */
      function handleError(error, context) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          context: context,
          message: error.message || error,
        }));
      }

      // ==========================================
      // DOM READY BOOTSTRAP
      // ==========================================
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }

    })();
  