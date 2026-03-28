// ============================================================
// DebtZero — Full App Logic
// ============================================================

// === State ===
let debts = JSON.parse(localStorage.getItem('debtzero_debts') || '[]');
let transactions = JSON.parse(localStorage.getItem('debtzero_transactions') || '[]');
let totalPaid = parseFloat(localStorage.getItem('debtzero_totalPaid') || '0');
let originalTotal = parseFloat(localStorage.getItem('debtzero_originalTotal') || '0');
let strategy = 'avalanche';
let payoffChart = null;

// Migrate old payments to transactions
(function migrateOldPayments() {
  const old = localStorage.getItem('debtzero_payments');
  if (old && transactions.length === 0) {
    const oldPayments = JSON.parse(old);
    transactions = oldPayments.map(p => ({ ...p, type: 'payment' }));
    localStorage.setItem('debtzero_transactions', JSON.stringify(transactions));
    localStorage.removeItem('debtzero_payments');
  }
})();

// === DOM Refs ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// === Theme ===
const savedTheme = localStorage.getItem('debtzero_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
$('#theme-toggle').textContent = savedTheme === 'dark' ? '\u{1F319}' : '\u{2600}\u{FE0F}';

$('#theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  $('#theme-toggle').textContent = next === 'dark' ? '\u{1F319}' : '\u{2600}\u{FE0F}';
  localStorage.setItem('debtzero_theme', next);
  renderChart();
});

// === Formatting ===
function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtMonth(date) {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// === Save ===
function save() {
  localStorage.setItem('debtzero_debts', JSON.stringify(debts));
  localStorage.setItem('debtzero_transactions', JSON.stringify(transactions));
  localStorage.setItem('debtzero_totalPaid', totalPaid.toString());
  localStorage.setItem('debtzero_originalTotal', originalTotal.toString());
}

// === Render Everything ===
function render() {
  renderDashboard();
  renderDebtList();
  renderPaymentSelect();
  renderPurchaseSelect();
  renderTransactionHistory();
  renderStrategy();
  renderProgress();
  renderChart();
  renderMilestones();
  renderMotivation();
  renderStreak();
  renderAmortViewer();
}

// ============================================================
// MOTIVATION SYSTEM
// ============================================================
const QUOTES = [
  "The secret of getting ahead is getting started. — Mark Twain",
  "A journey of a thousand miles begins with a single step. — Lao Tzu",
  "Debt is the slavery of the free. — Publilius Syrus",
  "Do not save what is left after spending, but spend what is left after saving. — Warren Buffett",
  "The only way to permanently change the temperature in the room is to reset the thermostat. — Dave Ramsey",
  "Financial freedom is available to those who learn about it and work for it. — Robert Kiyosaki",
  "Every payment you make is a step closer to freedom.",
  "You don't have to be great to start, but you have to start to be great. — Zig Ziglar",
  "Small daily improvements over time lead to stunning results. — Robin Sharma",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "Compound interest works for you or against you. Make it work FOR you.",
  "Being debt-free is worth every sacrifice you make today.",
  "Your future self will thank you for the payments you make today.",
  "It's not about how much money you make — it's about how much you keep.",
  "Every dollar paid toward debt is a dollar of freedom earned.",
  "Discipline is choosing between what you want now and what you want most.",
  "The pain of discipline is far less than the pain of regret. — Sarah Bombell",
  "Money looks better in your bank account than on your feet. — Sophia Amoruso",
  "Act as if what you do makes a difference. It does. — William James",
  "You are one payment closer to zero. Keep going!"
];

function renderMotivation() {
  const pct = originalTotal > 0 ? (totalPaid / originalTotal) * 100 : 0;
  let contextQuote = '';
  if (debts.length === 0 && originalTotal <= 0) {
    contextQuote = "Ready to start your journey? Add your first debt and take control!";
  } else if (pct >= 100) {
    contextQuote = "YOU DID IT! You are officially DEBT FREE! Celebrate this incredible achievement!";
  } else if (pct >= 75) {
    contextQuote = "The finish line is in sight! You've paid off " + pct.toFixed(0) + "% — keep charging forward!";
  } else if (pct >= 50) {
    contextQuote = "HALFWAY THERE! You've crossed the 50% mark. The momentum is with you!";
  } else if (pct >= 25) {
    contextQuote = "Great progress! 25% down. You're building an unstoppable habit!";
  } else {
    contextQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
  $('#motivation-text').textContent = contextQuote;
}

$('#motivation-refresh').addEventListener('click', () => {
  $('#motivation-text').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
});

// === Streak ===
function getStreak() {
  const paymentDates = transactions
    .filter(t => t.type === 'payment')
    .map(t => t.date)
    .reverse();
  if (paymentDates.length === 0) return 0;

  // Count unique months with payments
  const months = new Set();
  paymentDates.forEach(d => {
    const dt = new Date(d);
    months.add(dt.getFullYear() + '-' + dt.getMonth());
  });
  const sortedMonths = [...months].sort().reverse();
  let streak = 0;
  const now = new Date();
  let checkYear = now.getFullYear();
  let checkMonth = now.getMonth();

  for (let i = 0; i < 120; i++) {
    const key = checkYear + '-' + checkMonth;
    if (sortedMonths.includes(key)) {
      streak++;
    } else if (i > 0) {
      break;
    }
    checkMonth--;
    if (checkMonth < 0) { checkMonth = 11; checkYear--; }
  }
  return streak;
}

function renderStreak() {
  $('#streak-count').textContent = getStreak();
}

// === Milestones ===
function renderMilestones() {
  if (originalTotal <= 0) {
    $('#milestones-section').style.display = 'none';
    return;
  }
  $('#milestones-section').style.display = 'block';
  const pct = (totalPaid / originalTotal) * 100;
  const milestones = [
    { pct: 10, icon: '\u{1F331}', label: '10% Paid' },
    { pct: 25, icon: '\u{1F4AA}', label: '25% Paid' },
    { pct: 50, icon: '\u{1F525}', label: 'Halfway!' },
    { pct: 75, icon: '\u{1F680}', label: '75% Paid' },
    { pct: 90, icon: '\u{2B50}', label: 'Almost There!' },
    { pct: 100, icon: '\u{1F3C6}', label: 'DEBT FREE!' },
  ];

  $('#milestone-track').innerHTML = milestones.map(m =>
    `<div class="milestone ${pct >= m.pct ? 'achieved' : ''}">
      <span class="ms-icon">${m.icon}</span> ${m.label}
    </div>`
  ).join('');
}

// ============================================================
// CONFETTI
// ============================================================
const confettiCanvas = $('#confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');
let confettiPieces = [];
let confettiRunning = false;

function resizeConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeConfetti);
resizeConfetti();

function launchConfetti() {
  confettiPieces = [];
  for (let i = 0; i < 150; i++) {
    confettiPieces.push({
      x: Math.random() * confettiCanvas.width,
      y: Math.random() * confettiCanvas.height - confettiCanvas.height,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 3,
      color: ['#6c63ff', '#2cb67d', '#f5a623', '#ef4565', '#fff', '#ffd700'][Math.floor(Math.random() * 6)],
      vy: Math.random() * 3 + 2,
      vx: (Math.random() - 0.5) * 4,
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      life: 1,
    });
  }
  if (!confettiRunning) {
    confettiRunning = true;
    animateConfetti();
  }
}

function animateConfetti() {
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiPieces.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.rotSpeed;
    p.life -= 0.003;
    if (p.life <= 0) return;
    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot * Math.PI / 180);
    confettiCtx.globalAlpha = p.life;
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    confettiCtx.restore();
  });
  confettiPieces = confettiPieces.filter(p => p.life > 0 && p.y < confettiCanvas.height + 50);
  if (confettiPieces.length > 0) {
    requestAnimationFrame(animateConfetti);
  } else {
    confettiRunning = false;
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const total = debts.reduce((s, d) => s + d.balance, 0);
  const monthly = debts.reduce((s, d) => s + d.minimum, 0);

  $('#total-debt').textContent = fmt(total);
  $('#total-monthly').textContent = fmt(monthly);
  $('#debt-count').textContent = debts.length;

  // Estimated debt-free date
  const months = simulatePayoff(debts, 0);
  if (debts.length > 0 && months.length > 0) {
    const lastMonth = months[months.length - 1];
    $('#debt-free-date').textContent = fmtMonth(lastMonth.date);
  } else {
    $('#debt-free-date').textContent = debts.length > 0 ? 'N/A' : '--';
  }
}

// ============================================================
// PROGRESS
// ============================================================
function renderProgress() {
  if (originalTotal <= 0) {
    $('#progress-fill').style.width = '0%';
    $('#progress-pct').textContent = '0%';
    $('#progress-sub').textContent = 'Add debts and log payments to track your progress.';
    return;
  }
  const pct = Math.min(100, (totalPaid / originalTotal) * 100);
  $('#progress-fill').style.width = pct.toFixed(1) + '%';
  $('#progress-pct').textContent = pct.toFixed(1) + '%';
  const remaining = debts.reduce((s, d) => s + d.balance, 0);
  $('#progress-sub').textContent = `${fmt(totalPaid)} paid of ${fmt(originalTotal)} \u2014 ${fmt(remaining)} remaining`;
}

// ============================================================
// PAYOFF SIMULATION ENGINE
// ============================================================
function simulatePayoff(debtList, extraMonthly) {
  if (debtList.length === 0) return [];
  // Deep copy debts for simulation
  let sim = debtList.map(d => ({
    name: d.name,
    balance: d.balance,
    rate: d.rate,
    minimum: d.minimum,
    type: d.type || 'loan',
    amort: d.amort || null,
  }));

  const months = [];
  const now = new Date();
  let date = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const MAX_MONTHS = 360; // 30 years cap

  for (let m = 0; m < MAX_MONTHS; m++) {
    // Apply interest
    sim.forEach(d => {
      const monthlyRate = d.rate / 100 / 12;
      d.balance += d.balance * monthlyRate;
    });

    // Pay minimums
    sim.forEach(d => {
      const pay = Math.min(d.minimum, d.balance);
      d.balance -= pay;
    });

    // Extra payment applied per strategy
    let extra = extraMonthly;
    const sorted = [...sim].filter(d => d.balance > 0);
    if (strategy === 'avalanche') sorted.sort((a, b) => b.rate - a.rate);
    else sorted.sort((a, b) => a.balance - b.balance);

    for (const target of sorted) {
      if (extra <= 0) break;
      const pay = Math.min(extra, target.balance);
      target.balance -= pay;
      extra -= pay;
    }

    // Round small balances
    sim.forEach(d => { if (d.balance < 0.01) d.balance = 0; });

    const totalRemaining = sim.reduce((s, d) => s + d.balance, 0);
    months.push({
      date: new Date(date),
      total: totalRemaining,
      breakdown: sim.map(d => ({ name: d.name, balance: d.balance }))
    });

    if (totalRemaining <= 0) break;
    date = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }

  return months;
}

// ============================================================
// PAYOFF CHART (Chart.js)
// ============================================================
function renderChart() {
  if (debts.length === 0) {
    if (payoffChart) { payoffChart.destroy(); payoffChart = null; }
    $('#chart-summary').innerHTML = '';
    $('#chart-legend').innerHTML = '';
    return;
  }

  const extraPayment = parseInt($('#extra-payment-slider').value) || 0;
  const baseMonths = simulatePayoff(debts, 0);
  const extraMonths = simulatePayoff(debts, extraPayment);

  if (baseMonths.length === 0) return;

  const labels = baseMonths.map(m => fmtMonth(m.date));
  const baseData = baseMonths.map(m => m.total);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#8b8fa3' : '#6b7084';

  const datasets = [{
    label: 'Current Plan',
    data: baseData,
    borderColor: '#6c63ff',
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
    fill: true,
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 2.5,
  }];

  if (extraPayment > 0) {
    // Pad extra data to match base length
    const extraData = extraMonths.map(m => m.total);
    while (extraData.length < baseData.length) extraData.push(0);
    datasets.push({
      label: `+${fmt(extraPayment)}/mo`,
      data: extraData,
      borderColor: '#2cb67d',
      backgroundColor: 'rgba(44, 182, 125, 0.08)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2.5,
      borderDash: [6, 3],
    });
  }

  // Per-debt breakdown lines
  const debtNames = debts.map(d => d.name);
  const perDebtColors = ['#f5a623', '#ef4565', '#00bcd4', '#e040fb', '#8bc34a', '#ff7043'];
  if (debts.length <= 6) {
    debts.forEach((d, i) => {
      const data = baseMonths.map(m => {
        const found = m.breakdown.find(b => b.name === d.name);
        return found ? found.balance : 0;
      });
      datasets.push({
        label: d.name,
        data,
        borderColor: perDebtColors[i % perDebtColors.length],
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 1.5,
        borderDash: [3, 3],
      });
    });
  }

  if (payoffChart) payoffChart.destroy();

  payoffChart = new Chart($('#payoff-chart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, maxTicksLimit: 8, font: { size: 11 } },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: textColor, callback: v => fmt(v), font: { size: 11 } },
          grid: { color: gridColor },
          beginAtZero: true,
        }
      }
    }
  });

  // Legend
  $('#chart-legend').innerHTML = datasets.map(ds =>
    `<span class="legend-item">
      <span class="legend-dot" style="background:${ds.borderColor};${ds.borderDash ? 'border:1px dashed ' + ds.borderColor + ';background:transparent;' : ''}"></span>
      ${escapeHtml(ds.label)}
    </span>`
  ).join('');

  // Summary
  const baseTotalInterest = baseMonths.reduce((s, m, i) => {
    const prevTotal = i === 0 ? debts.reduce((a, d) => a + d.balance, 0) : baseMonths[i - 1].total;
    const minPayments = debts.reduce((a, d) => a + Math.min(d.minimum, d.balance), 0);
    return s;
  }, 0);

  let summaryHtml = `
    <div class="chart-summary-item">
      <span class="cs-label">Payoff Date (Current)</span>
      <span class="cs-value">${fmtMonth(baseMonths[baseMonths.length - 1].date)}</span>
    </div>
    <div class="chart-summary-item">
      <span class="cs-label">Months to Payoff</span>
      <span class="cs-value">${baseMonths.length} months</span>
    </div>
  `;

  if (extraPayment > 0 && extraMonths.length < baseMonths.length) {
    const monthsSaved = baseMonths.length - extraMonths.length;
    summaryHtml += `
      <div class="chart-summary-item">
        <span class="cs-label">With Extra Payment</span>
        <span class="cs-value cs-faster">${extraMonths.length} months (${monthsSaved} faster!)</span>
      </div>
      <div class="chart-summary-item">
        <span class="cs-label">New Payoff Date</span>
        <span class="cs-value cs-saved">${fmtMonth(extraMonths[extraMonths.length - 1].date)}</span>
      </div>
    `;
  }

  $('#chart-summary').innerHTML = summaryHtml;
}

$('#extra-payment-slider').addEventListener('input', (e) => {
  $('#extra-payment-display').textContent = fmt(parseInt(e.target.value));
  renderChart();
});

// ============================================================
// DEBT LIST
// ============================================================
function renderDebtList() {
  const debtListEl = $('#debt-list');
  if (debts.length === 0) {
    debtListEl.innerHTML = '<p class="empty-state">No debts added yet. Use the form above to get started!</p>';
    return;
  }

  const loanIcons = ['\u{1F3E0}', '\u{1F393}', '\u{1F697}', '\u{1F3E5}', '\u{1F4F1}'];
  const ccIcons = ['\u{1F4B3}', '\u{1F6D2}', '\u{2708}\u{FE0F}', '\u{1F4B0}'];
  let loanIdx = 0, ccIdx = 0;

  debtListEl.innerHTML = debts.map((d, i) => {
    const icon = d.type === 'credit_card'
      ? ccIcons[ccIdx++ % ccIcons.length]
      : loanIcons[loanIdx++ % loanIcons.length];
    const badgeClass = d.type === 'credit_card' ? 'badge-credit_card' : 'badge-loan';
    const badgeText = d.type === 'credit_card' ? 'Credit Card' : 'Loan';
    const iconClass = d.type === 'credit_card' ? 'type-credit_card' : 'type-loan';
    const amortTag = d.amort ? ' \u00B7 Amortized' : '';

    return `
    <div class="debt-item">
      <div class="debt-icon ${iconClass}">${icon}</div>
      <div class="debt-info">
        <div class="debt-title">
          ${escapeHtml(d.name)}
          <span class="debt-type-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="debt-meta">${d.rate}% APR \u00B7 ${fmt(d.minimum)}/mo min${amortTag}</div>
      </div>
      <div class="debt-balance">
        <div class="balance-amount">${fmt(d.balance)}</div>
        <div class="balance-original">of ${fmt(d.original)}</div>
      </div>
      <button class="btn-delete" data-index="${i}" title="Remove debt">&times;</button>
    </div>`;
  }).join('');

  debtListEl.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      debts.splice(idx, 1);
      recalcOriginalTotal();
      save();
      render();
    });
  });
}

// ============================================================
// PAYMENT / PURCHASE SELECTS
// ============================================================
function renderPaymentSelect() {
  $('#payment-debt').innerHTML = '<option value="">Select a debt</option>' +
    debts.map((d, i) => `<option value="${i}">${escapeHtml(d.name)} (${fmt(d.balance)})</option>`).join('');
}

function renderPurchaseSelect() {
  const ccDebts = debts.map((d, i) => ({ ...d, idx: i })).filter(d => d.type === 'credit_card');
  $('#purchase-card').innerHTML = '<option value="">Select a credit card</option>' +
    ccDebts.map(d => `<option value="${d.idx}">${escapeHtml(d.name)} (${fmt(d.balance)})</option>`).join('');
}

// ============================================================
// TRANSACTION HISTORY
// ============================================================
function renderTransactionHistory() {
  const historyEl = $('#transaction-history');
  if (transactions.length === 0) {
    historyEl.innerHTML = '';
    return;
  }
  const recent = transactions.slice(-15).reverse();
  historyEl.innerHTML = recent.map(t => {
    const isPayment = t.type === 'payment';
    const amtClass = isPayment ? 'pe-payment' : 'pe-purchase';
    const prefix = isPayment ? '-' : '+';
    const desc = t.description ? ` \u00B7 ${escapeHtml(t.description)}` : '';
    return `
    <div class="payment-entry">
      <span class="pe-info">${escapeHtml(t.debtName)}${desc} \u00B7 ${t.date}</span>
      <span class="pe-amount ${amtClass}">${prefix}${fmt(t.amount)}</span>
    </div>`;
  }).join('');
}

// ============================================================
// TABS
// ============================================================
$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ============================================================
// STRATEGY
// ============================================================
function renderStrategy() {
  const strategyInfoEl = $('#strategy-info');
  const payoffOrderEl = $('#payoff-order');

  if (debts.length === 0) {
    strategyInfoEl.textContent = 'Add debts to see your recommended payoff order.';
    payoffOrderEl.innerHTML = '';
    return;
  }

  const sorted = [...debts].sort((a, b) => {
    if (strategy === 'avalanche') return b.rate - a.rate;
    return a.balance - b.balance;
  });

  strategyInfoEl.textContent = strategy === 'avalanche'
    ? 'Pay minimums on all debts, then throw extra money at the highest interest rate first. Saves the most money over time.'
    : 'Pay minimums on all debts, then throw extra money at the smallest balance first. Builds momentum with quick wins.';

  payoffOrderEl.innerHTML = sorted.map(d => `
    <li>
      <span class="po-name">${escapeHtml(d.name)}</span>
      <span class="po-detail">${fmt(d.balance)} @ ${d.rate}%</span>
    </li>
  `).join('');
}

$$('.strategy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.strategy-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    strategy = btn.dataset.strategy;
    renderStrategy();
    renderChart();
  });
});

// ============================================================
// ADD DEBT FORM
// ============================================================
const debtTypeSelect = $('#debt-type');
const amortToggle = $('#amort-toggle');
const amortCheckbox = $('#has-amortization');
const amortFields = $('#amort-fields');

// Show/hide amortization based on type
debtTypeSelect.addEventListener('change', () => {
  const isLoan = debtTypeSelect.value === 'loan';
  amortToggle.style.display = isLoan ? 'block' : 'none';
  if (!isLoan) {
    amortCheckbox.checked = false;
    amortFields.style.display = 'none';
  }
});

amortCheckbox.addEventListener('change', () => {
  amortFields.style.display = amortCheckbox.checked ? 'block' : 'none';
});

// Live amortization preview
['amort-principal', 'amort-term', 'amort-emi', 'amort-payments-made', 'debt-rate'].forEach(id => {
  const el = $(`#${id}`);
  if (el) el.addEventListener('input', updateAmortPreview);
});

function updateAmortPreview() {
  const preview = $('#amort-preview');
  const principal = parseFloat($('#amort-principal').value);
  const term = parseInt($('#amort-term').value);
  const emi = parseFloat($('#amort-emi').value);
  const made = parseInt($('#amort-payments-made').value) || 0;
  const rate = parseFloat($('#debt-rate').value);

  if (!principal || !term || !rate) { preview.innerHTML = ''; return; }

  const monthlyRate = rate / 100 / 12;
  // Calculate EMI if not provided
  const calcEmi = emi || (principal * monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);
  const remainingPayments = term - made;
  const totalCost = calcEmi * term;
  const totalInterest = totalCost - principal;

  // Lender's payoff date
  const now = new Date();
  const payoffDate = new Date(now.getFullYear(), now.getMonth() + remainingPayments, 1);

  preview.innerHTML = `
    <div class="amort-calc">
      <div class="ac-item"><span class="ac-label">Calculated EMI</span><span class="ac-value">${fmt(calcEmi)}</span></div>
      <div class="ac-item"><span class="ac-label">Remaining Payments</span><span class="ac-value">${remainingPayments}</span></div>
      <div class="ac-item"><span class="ac-label">Total Interest</span><span class="ac-value">${fmt(totalInterest)}</span></div>
      <div class="ac-item"><span class="ac-label">Lender Payoff Date</span><span class="ac-value">${fmtMonth(payoffDate)}</span></div>
    </div>
  `;
}

$('#debt-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const type = debtTypeSelect.value;
  const name = $('#debt-name').value.trim();
  const balance = parseFloat($('#debt-balance').value);
  const rate = parseFloat($('#debt-rate').value);
  const minimum = parseFloat($('#debt-minimum').value);

  if (!name || isNaN(balance) || isNaN(rate) || isNaN(minimum)) return;

  const debt = { name, balance, rate, minimum, original: balance, type };

  // Amortization data
  if (type === 'loan' && amortCheckbox.checked) {
    const principal = parseFloat($('#amort-principal').value);
    const term = parseInt($('#amort-term').value);
    const emi = parseFloat($('#amort-emi').value);
    const made = parseInt($('#amort-payments-made').value) || 0;

    if (principal && term) {
      const monthlyRate = rate / 100 / 12;
      const calcEmi = emi || (principal * monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);
      debt.amort = { principal, term, emi: calcEmi, paymentsMade: made };
      debt.original = principal;
      debt.minimum = calcEmi;
    }
  }

  debts.push(debt);
  originalTotal += debt.original;
  save();
  render();
  $('#debt-form').reset();
  amortFields.style.display = 'none';
  amortCheckbox.checked = false;
  $('#amort-preview').innerHTML = '';
});

// ============================================================
// LOG PAYMENT
// ============================================================
$('#payment-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const idx = parseInt($('#payment-debt').value);
  const amount = parseFloat($('#payment-amount').value);

  if (isNaN(idx) || isNaN(amount) || amount <= 0) return;

  const debt = debts[idx];
  const actual = Math.min(amount, debt.balance);
  debt.balance = Math.max(0, debt.balance - actual);
  totalPaid += actual;

  transactions.push({
    type: 'payment',
    debtName: debt.name,
    amount: actual,
    date: new Date().toLocaleDateString('en-US')
  });

  const justPaidOff = debt.balance <= 0;
  if (justPaidOff) {
    debts.splice(idx, 1);
  }

  save();
  render();
  $('#payment-form').reset();

  // Celebrations
  if (justPaidOff) {
    launchConfetti();
  }
  const pct = originalTotal > 0 ? (totalPaid / originalTotal) * 100 : 0;
  if (pct >= 100 && debts.length === 0) {
    launchConfetti();
    setTimeout(launchConfetti, 1500);
  }
});

// ============================================================
// ADD PURCHASE (Credit Card)
// ============================================================
$('#purchase-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const idx = parseInt($('#purchase-card').value);
  const desc = $('#purchase-desc').value.trim();
  const amount = parseFloat($('#purchase-amount').value);

  if (isNaN(idx) || !desc || isNaN(amount) || amount <= 0) return;

  const debt = debts[idx];
  debt.balance += amount;
  debt.original += amount;
  originalTotal += amount;

  transactions.push({
    type: 'purchase',
    debtName: debt.name,
    description: desc,
    amount,
    date: new Date().toLocaleDateString('en-US')
  });

  save();
  render();
  $('#purchase-form').reset();
});

// ============================================================
// AMORTIZATION SCHEDULE VIEWER
// ============================================================
function renderAmortViewer() {
  const amortDebts = debts.filter(d => d.amort);
  const section = $('#amort-viewer-section');

  if (amortDebts.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const select = $('#amort-viewer-select');
  const currentVal = select.value;
  select.innerHTML = amortDebts.map((d, i) =>
    `<option value="${i}">${escapeHtml(d.name)}</option>`
  ).join('');
  if (currentVal) select.value = currentVal;

  renderAmortTable();
}

$('#amort-viewer-select').addEventListener('change', renderAmortTable);

function renderAmortTable() {
  const amortDebts = debts.filter(d => d.amort);
  const idx = parseInt($('#amort-viewer-select').value) || 0;
  const debt = amortDebts[idx];
  if (!debt || !debt.amort) {
    $('#amort-table-wrap').innerHTML = '';
    return;
  }

  const { principal, term, emi, paymentsMade } = debt.amort;
  const monthlyRate = debt.rate / 100 / 12;
  const rows = [];
  let balance = principal;

  for (let i = 1; i <= term; i++) {
    const interest = balance * monthlyRate;
    const principalPart = Math.min(emi - interest, balance);
    balance = Math.max(0, balance - principalPart);
    const isPast = i <= paymentsMade;
    const isCurrent = i === paymentsMade + 1;

    rows.push({
      month: i,
      payment: emi,
      principal: principalPart,
      interest,
      balance,
      isPast,
      isCurrent,
    });
  }

  const html = `
    <table class="amort-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Payment</th>
          <th>Principal</th>
          <th>Interest</th>
          <th>Balance</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr class="${r.isPast ? 'past-row' : ''} ${r.isCurrent ? 'current-row' : ''}">
            <td>${r.month}</td>
            <td>${fmt(r.payment)}</td>
            <td>${fmt(r.principal)}</td>
            <td>${fmt(r.interest)}</td>
            <td>${fmt(r.balance)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  $('#amort-table-wrap').innerHTML = html;
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function recalcOriginalTotal() {
  originalTotal = debts.reduce((s, d) => s + d.original, 0) + totalPaid;
  save();
}

// ============================================================
// INIT
// ============================================================
render();
