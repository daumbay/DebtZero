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

// === Currency Settings ===
const DEFAULT_SETTINGS = {
  currency: 'USD',
  showSymbol: true,
  numberFormat: 'international', // international | indian | european | plain
};
let settings = JSON.parse(localStorage.getItem('debtzero_settings') || 'null') || { ...DEFAULT_SETTINGS };

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

// Migrate old date formats (en-US locale strings) to ISO
(function migrateDates() {
  let changed = false;
  transactions.forEach(t => {
    if (t.date && !t.date.match(/^\d{4}-\d{2}-\d{2}/)) {
      // Try to parse old date format
      const parsed = new Date(t.date);
      if (!isNaN(parsed)) {
        t.date = parsed.toISOString().slice(0, 10);
        changed = true;
      }
    }
  });
  if (changed) localStorage.setItem('debtzero_transactions', JSON.stringify(transactions));
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
function getLocaleForFormat(format) {
  switch (format) {
    case 'indian': return 'en-IN';
    case 'european': return 'de-DE';
    case 'plain': return 'en-US';
    default: return 'en-US';
  }
}

function fmt(n) {
  const locale = getLocaleForFormat(settings.numberFormat);
  const curr = settings.currency;
  const showSym = settings.showSymbol;

  if (settings.numberFormat === 'plain') {
    const fixed = Math.abs(n).toFixed(2);
    const sign = n < 0 ? '-' : '';
    if (showSym) {
      try {
        const sym = getCurrencySymbol(curr);
        return sign + sym + fixed;
      } catch { return sign + curr + ' ' + fixed; }
    }
    return sign + fixed;
  }

  if (showSym) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } else {
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }
}

function getCurrencySymbol(currencyCode) {
  return (0).toLocaleString('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).replace(/\d/g, '').trim();
}

function fmtMonth(date) {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// === Date Helpers ===
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ordSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// === Due Date Status ===
function getDueStatus(debt) {
  if (!debt.dueDay) return null;
  const today = new Date();
  const day = today.getDate();
  const dueDay = debt.dueDay;

  // Check if there's a payment this month
  const thisMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  const paidThisMonth = transactions.some(t =>
    t.type === 'payment' &&
    t.debtName === debt.name &&
    t.date && t.date.startsWith(thisMonth)
  );

  if (paidThisMonth) return null; // Already paid this month

  if (day > dueDay) {
    return { status: 'overdue', label: 'OVERDUE', detail: `Due on the ${ordSuffix(dueDay)}` };
  }
  const daysUntil = dueDay - day;
  if (daysUntil <= 5) {
    return { status: 'due-soon', label: 'DUE SOON', detail: `Due in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}` };
  }
  return null;
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
  renderStrategy();
  renderChart();
  renderMilestones();
  renderMotivation();
  renderStreak();
  renderDueWarnings();
}

// ============================================================
// GENERIC MODAL SYSTEM
// ============================================================
function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add('open');
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('open');
}

// Close on [data-close] buttons
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) {
    closeModal(closeBtn.dataset.close);
    return;
  }
  // Close on overlay background click
  if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('open')) {
    e.target.classList.remove('open');
  }
});

// ============================================================
// MOTIVATION SYSTEM
// ============================================================
const QUOTES = [
  "The secret of getting ahead is getting started. \u2014 Mark Twain",
  "A journey of a thousand miles begins with a single step. \u2014 Lao Tzu",
  "Debt is the slavery of the free. \u2014 Publilius Syrus",
  "Do not save what is left after spending, but spend what is left after saving. \u2014 Warren Buffett",
  "The only way to permanently change the temperature in the room is to reset the thermostat. \u2014 Dave Ramsey",
  "Financial freedom is available to those who learn about it and work for it. \u2014 Robert Kiyosaki",
  "Every payment you make is a step closer to freedom.",
  "You don't have to be great to start, but you have to start to be great. \u2014 Zig Ziglar",
  "Small daily improvements over time lead to stunning results. \u2014 Robin Sharma",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "Compound interest works for you or against you. Make it work FOR you.",
  "Being debt-free is worth every sacrifice you make today.",
  "Your future self will thank you for the payments you make today.",
  "It's not about how much money you make \u2014 it's about how much you keep.",
  "Every dollar paid toward debt is a dollar of freedom earned.",
  "Discipline is choosing between what you want now and what you want most.",
  "The pain of discipline is far less than the pain of regret. \u2014 Sarah Bombell",
  "Money looks better in your bank account than on your feet. \u2014 Sophia Amoruso",
  "Act as if what you do makes a difference. It does. \u2014 William James",
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
    contextQuote = "The finish line is in sight! You've paid off " + pct.toFixed(0) + "% \u2014 keep charging forward!";
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
// DUE DATE WARNINGS
// ============================================================
function renderDueWarnings() {
  const container = $('#due-warnings');
  const warnings = [];

  debts.forEach(d => {
    const status = getDueStatus(d);
    if (status) {
      warnings.push({ name: d.name, ...status });
    }
  });

  if (warnings.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = warnings.map(w => `
    <div class="due-warning-item ${w.status}">
      <span class="due-warning-icon">${w.status === 'overdue' ? '\u{1F6A8}' : '\u{26A0}\u{FE0F}'}</span>
      <strong>${escapeHtml(w.name)}</strong> \u2014 ${w.label} (${w.detail})
    </div>
  `).join('');
}

// ============================================================
// PAYOFF SIMULATION ENGINE
// ============================================================
function simulatePayoff(debtList, extraMonthly) {
  if (debtList.length === 0) return [];
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
  const MAX_MONTHS = 360;

  for (let m = 0; m < MAX_MONTHS; m++) {
    sim.forEach(d => {
      const monthlyRate = d.rate / 100 / 12;
      d.balance += d.balance * monthlyRate;
    });

    sim.forEach(d => {
      const pay = Math.min(d.minimum, d.balance);
      d.balance -= pay;
    });

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
// DEBT LIST (with action buttons)
// ============================================================
function renderDebtList() {
  const debtListEl = $('#debt-list');
  if (debts.length === 0) {
    debtListEl.innerHTML = '<p class="empty-state">No debts added yet. Click + above to get started!</p>';
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
    const dueTag = d.dueDay ? ` \u00B7 Due ${ordSuffix(d.dueDay)}` : '';

    // Due status badge
    const dueStatus = getDueStatus(d);
    const dueBadgeHtml = dueStatus
      ? `<span class="due-badge ${dueStatus.status}">${dueStatus.label}</span>`
      : '';

    // Action buttons
    const purchaseBtn = d.type === 'credit_card'
      ? `<button class="btn-action btn-purchase" data-action="purchase" data-index="${i}">+ Purchase</button>`
      : '';
    const scheduleBtn = (d.amort && d.amort.schedule)
      ? `<button class="btn-action btn-schedule" data-action="view-amort" data-index="${i}">Schedule</button>`
      : '';

    return `
    <div class="debt-item">
      <div class="debt-icon ${iconClass}">${icon}</div>
      <div class="debt-info">
        <div class="debt-title">
          ${escapeHtml(d.name)}
          <span class="debt-type-badge ${badgeClass}">${badgeText}</span>
          ${dueBadgeHtml}
        </div>
        <div class="debt-meta">${d.rate}% APR \u00B7 ${fmt(d.minimum)}/mo min${amortTag}${dueTag}</div>
      </div>
      <div class="debt-balance">
        <div class="balance-amount">${fmt(d.balance)}</div>
        <div class="balance-original">of ${fmt(d.original)}</div>
      </div>
      <div class="debt-actions">
        <button class="btn-action btn-pay" data-action="pay" data-index="${i}">Pay</button>
        ${purchaseBtn}
        ${scheduleBtn}
        <button class="btn-delete" data-action="delete" data-index="${i}" title="Remove debt">&times;</button>
      </div>
    </div>`;
  }).join('');
}

// Delegated click handler for debt list
$('#debt-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const idx = parseInt(btn.dataset.index);

  if (action === 'pay') {
    openPaymentModal(idx);
  } else if (action === 'purchase') {
    openPurchaseModal(idx);
  } else if (action === 'view-amort') {
    openAmortViewerModal(idx);
  } else if (action === 'delete') {
    if (!confirm(`Remove "${debts[idx].name}"? This cannot be undone.`)) return;
    debts.splice(idx, 1);
    recalcOriginalTotal();
    save();
    render();
  }
});

// ============================================================
// PAYMENT MODAL
// ============================================================
function openPaymentModal(idx) {
  const debt = debts[idx];
  if (!debt) return;
  $('#payment-debt-idx').value = idx;
  $('#payment-debt-name').textContent = `${debt.name} \u2014 Balance: ${fmt(debt.balance)}`;
  $('#payment-amount').value = '';
  $('#payment-date').value = todayISO();
  openModal('payment-overlay');
}

$('#payment-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const idx = parseInt($('#payment-debt-idx').value);
  const amount = parseFloat($('#payment-amount').value);
  const date = $('#payment-date').value || todayISO();

  if (isNaN(idx) || isNaN(amount) || amount <= 0) return;

  const debt = debts[idx];
  const actual = Math.min(amount, debt.balance);
  debt.balance = Math.max(0, debt.balance - actual);
  totalPaid += actual;

  transactions.push({
    type: 'payment',
    debtName: debt.name,
    amount: actual,
    date: date
  });

  const justPaidOff = debt.balance <= 0;
  if (justPaidOff) {
    debts.splice(idx, 1);
  }

  save();
  closeModal('payment-overlay');
  render();
  renderDataMeta();
  showToast(`Payment of ${fmt(actual)} logged for ${debt.name}!`);

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
// PURCHASE MODAL
// ============================================================
function openPurchaseModal(idx) {
  const debt = debts[idx];
  if (!debt || debt.type !== 'credit_card') return;
  $('#purchase-card-idx').value = idx;
  $('#purchase-card-name').textContent = `${debt.name} \u2014 Balance: ${fmt(debt.balance)}`;
  $('#purchase-desc').value = '';
  $('#purchase-amount').value = '';
  $('#purchase-date').value = todayISO();
  openModal('purchase-overlay');
}

$('#purchase-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const idx = parseInt($('#purchase-card-idx').value);
  const desc = $('#purchase-desc').value.trim();
  const amount = parseFloat($('#purchase-amount').value);
  const date = $('#purchase-date').value || todayISO();

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
    date: date
  });

  save();
  closeModal('purchase-overlay');
  render();
  renderDataMeta();
  showToast(`Purchase of ${fmt(amount)} added to ${debt.name}.`);
});

// ============================================================
// TRANSACTION HISTORY MODAL
// ============================================================
$('#history-toggle').addEventListener('click', () => {
  populateHistoryFilters();
  renderHistoryList();
  openModal('history-overlay');
});

function populateHistoryFilters() {
  const debtSelect = $('#history-filter-debt');
  const names = [...new Set(transactions.map(t => t.debtName))];
  const currentVal = debtSelect.value;
  debtSelect.innerHTML = '<option value="all">All Accounts</option>' +
    names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (currentVal && names.includes(currentVal)) debtSelect.value = currentVal;
}

function getFilteredTransactions() {
  const debtFilter = $('#history-filter-debt').value;
  const typeFilter = $('#history-filter-type').value;
  const sortOrder = $('#history-sort').value;
  const dateFrom = $('#history-date-from').value;
  const dateTo = $('#history-date-to').value;

  let filtered = [...transactions];

  if (debtFilter !== 'all') {
    filtered = filtered.filter(t => t.debtName === debtFilter);
  }
  if (typeFilter !== 'all') {
    filtered = filtered.filter(t => t.type === typeFilter);
  }
  if (dateFrom) {
    filtered = filtered.filter(t => t.date && t.date >= dateFrom);
  }
  if (dateTo) {
    filtered = filtered.filter(t => t.date && t.date <= dateTo);
  }

  filtered.sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    return sortOrder === 'newest' ? db.localeCompare(da) : da.localeCompare(db);
  });

  return filtered;
}

function renderHistoryList() {
  const listEl = $('#history-list');
  const filtered = getFilteredTransactions();

  // Summary
  const totalPayments = filtered.filter(t => t.type === 'payment').reduce((s, t) => s + t.amount, 0);
  const totalPurchases = filtered.filter(t => t.type === 'purchase').reduce((s, t) => s + t.amount, 0);
  $('#history-summary').innerHTML = `
    <span class="hs-item"><span class="hs-count">${filtered.length}</span> transaction${filtered.length !== 1 ? 's' : ''}</span>
    ${totalPayments > 0 ? `<span class="hs-item">Payments: <span class="hs-payments">${fmt(totalPayments)}</span></span>` : ''}
    ${totalPurchases > 0 ? `<span class="hs-item">Purchases: <span class="hs-purchases">${fmt(totalPurchases)}</span></span>` : ''}
  `;

  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="empty-state" style="padding:1rem 0;">No transactions match your filters.</p>';
    return;
  }

  listEl.innerHTML = filtered.map(t => {
    const isPayment = t.type === 'payment';
    const amtClass = isPayment ? 'pe-payment' : 'pe-purchase';
    const prefix = isPayment ? '-' : '+';
    const desc = t.description ? ` \u00B7 ${escapeHtml(t.description)}` : '';
    const dateStr = t.date ? `<span class="pe-date">${fmtDate(t.date)}</span>` : '';
    return `
    <div class="payment-entry">
      <span class="pe-info">${escapeHtml(t.debtName)}${desc} ${dateStr}</span>
      <span class="pe-amount ${amtClass}">${prefix}${fmt(t.amount)}</span>
    </div>`;
  }).join('');
}

// Filter/sort change listeners
['history-filter-debt', 'history-filter-type', 'history-sort', 'history-date-from', 'history-date-to'].forEach(id => {
  $(`#${id}`).addEventListener('change', renderHistoryList);
});

$('#history-clear-filters').addEventListener('click', () => {
  $('#history-filter-debt').value = 'all';
  $('#history-filter-type').value = 'all';
  $('#history-sort').value = 'newest';
  $('#history-date-from').value = '';
  $('#history-date-to').value = '';
  renderHistoryList();
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
// ADD DEBT MODAL
// ============================================================
$('#btn-add-debt').addEventListener('click', () => {
  openModal('add-debt-overlay');
});

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
  const calcEmi = emi || (principal * monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);
  const remainingPayments = term - made;
  const totalCost = calcEmi * term;
  const totalInterest = totalCost - principal;

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

  // If amort is enabled, require preview first (unless already confirmed)
  if (debtTypeSelect.value === 'loan' && amortCheckbox.checked && !confirmedSchedule) {
    // Trigger preview instead of direct submit
    $('#btn-preview-schedule').click();
    return;
  }

  submitDebtForm();
});

function submitDebtForm() {
  const type = debtTypeSelect.value;
  const name = $('#debt-name').value.trim();
  const balance = parseFloat($('#debt-balance').value);
  const rate = parseFloat($('#debt-rate').value);
  const minimum = parseFloat($('#debt-minimum').value);
  const dueDay = parseInt($('#debt-due-day').value) || null;

  if (!name || isNaN(balance) || isNaN(rate) || isNaN(minimum)) return;

  const debt = { name, balance, rate, minimum, original: balance, type };
  if (dueDay && dueDay >= 1 && dueDay <= 31) debt.dueDay = dueDay;

  // Amortization data
  if (type === 'loan' && amortCheckbox.checked && confirmedSchedule) {
    const principal = parseFloat($('#amort-principal').value) || balance;
    const term = confirmedSchedule.length;
    const emi = confirmedSchedule[0] ? confirmedSchedule[0].emi : minimum;
    const made = parseInt($('#amort-payments-made').value) || 0;
    const startDate = $('#amort-start-date').value || null;

    debt.amort = {
      principal,
      term,
      emi,
      paymentsMade: made,
      schedule: confirmedSchedule,
      source: amortSource,
    };
    if (startDate) debt.amort.startDate = startDate;
    debt.original = principal;
    debt.minimum = emi;
  }

  debts.push(debt);
  originalTotal += debt.original;
  save();
  closeModal('add-debt-overlay');
  render();
  renderDataMeta();
  $('#debt-form').reset();
  amortFields.style.display = 'none';
  amortCheckbox.checked = false;
  $('#amort-preview').innerHTML = '';
  confirmedSchedule = null;
  pendingCSVSchedule = null;
  amortSource = 'calculator';
  $$('.amort-src-btn').forEach(b => b.classList.remove('active'));
  $$('.amort-src-btn')[0].classList.add('active');
  $('#amort-calc-panel').style.display = 'block';
  $('#amort-csv-panel').style.display = 'none';
  $('#csv-status').textContent = '';
  showToast(`"${name}" added!`);
}

// ============================================================
// AMORTIZATION SCHEDULE SYSTEM
// ============================================================

// --- Generate schedule from calculator parameters ---
function generateScheduleFromCalc(principal, term, rate, emi, paymentsMade, startDate) {
  const monthlyRate = rate / 100 / 12;
  const calcEmi = emi || (principal * monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);
  const schedule = [];
  let balance = principal;

  let rowDate = null;
  if (startDate) {
    const sd = new Date(startDate + 'T00:00:00');
    rowDate = new Date(sd.getFullYear(), sd.getMonth() + 1, sd.getDate());
  }

  for (let i = 1; i <= term; i++) {
    const interest = balance * monthlyRate;
    const principalPart = Math.min(calcEmi - interest, balance);
    balance = Math.max(0, balance - principalPart);

    let date = '';
    if (rowDate) {
      date = rowDate.toISOString().slice(0, 10);
      rowDate = new Date(rowDate.getFullYear(), rowDate.getMonth() + 1, rowDate.getDate());
    }

    schedule.push({
      month: i,
      date,
      balance: Math.round(balance * 100) / 100,
      emi: Math.round(calcEmi * 100) / 100,
      principal: Math.round(principalPart * 100) / 100,
      interest: Math.round(interest * 100) / 100,
    });
  }
  return schedule;
}

// --- Parse CSV into schedule ---
function parseAmortCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const reqCols = ['date', 'outstanding balance', 'emi', 'principal component', 'interest component'];
  const colMap = {};
  reqCols.forEach(col => {
    const idx = header.findIndex(h => h.includes(col.split(' ')[0]) && (col.split(' ').length === 1 || h.includes(col.split(' ')[1])));
    if (idx === -1) throw new Error(`Missing column: "${col}". Found: ${header.join(', ')}`);
    colMap[col] = idx;
  });

  const schedule = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',').map(c => c.trim());

    const dateRaw = cols[colMap['date']] || '';
    const balance = parseFloat(cols[colMap['outstanding balance']]);
    const emi = parseFloat(cols[colMap['emi']]);
    const principal = parseFloat(cols[colMap['principal component']]);
    const interest = parseFloat(cols[colMap['interest component']]);

    if (isNaN(balance) || isNaN(emi) || isNaN(principal) || isNaN(interest)) {
      throw new Error(`Invalid number on row ${i + 1}.`);
    }

    // Try to parse date into ISO format
    let date = '';
    if (dateRaw) {
      const parsed = new Date(dateRaw);
      if (!isNaN(parsed)) {
        date = parsed.toISOString().slice(0, 10);
      } else {
        date = dateRaw; // keep as-is
      }
    }

    schedule.push({
      month: i,
      date,
      balance: Math.round(balance * 100) / 100,
      emi: Math.round(emi * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
    });
  }

  if (schedule.length === 0) throw new Error('No data rows found in CSV.');
  return schedule;
}

// --- Generate CSV string from schedule ---
function generateCSVFromSchedule(schedule) {
  const header = 'Date,Outstanding Balance,EMI,Principal Component,Interest Component';
  const rows = schedule.map(r =>
    `${r.date},${r.balance.toFixed(2)},${r.emi.toFixed(2)},${r.principal.toFixed(2)},${r.interest.toFixed(2)}`
  );
  return header + '\n' + rows.join('\n');
}

// --- Download CSV ---
function downloadCSV(schedule, filename) {
  const csv = generateCSVFromSchedule(schedule);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Generate CSV template ---
function generateCSVTemplate() {
  const header = 'Date,Outstanding Balance,EMI,Principal Component,Interest Component';
  const example = '2025-01-15,24500.00,483.15,275.48,207.67';
  return header + '\n' + example;
}

// --- Render amort table into a container element ---
function renderAmortTableInto(container, schedule, paymentsMade) {
  if (!schedule || schedule.length === 0) {
    container.innerHTML = '<p class="empty-state">No schedule data.</p>';
    return;
  }

  const hasDate = schedule.some(r => r.date);
  const made = paymentsMade || 0;

  container.innerHTML = `
    <table class="amort-table">
      <thead>
        <tr>
          <th>#</th>
          ${hasDate ? '<th>Date</th>' : ''}
          <th>EMI</th>
          <th>Principal</th>
          <th>Interest</th>
          <th>Balance</th>
        </tr>
      </thead>
      <tbody>
        ${schedule.map(r => {
          const isPast = r.month <= made;
          const isCurrent = r.month === made + 1;
          return `
          <tr class="${isPast ? 'past-row' : ''} ${isCurrent ? 'current-row' : ''}">
            <td>${r.month}</td>
            ${hasDate ? `<td>${r.date ? fmtDate(r.date) : ''}</td>` : ''}
            <td>${fmt(r.emi)}</td>
            <td>${fmt(r.principal)}</td>
            <td>${fmt(r.interest)}</td>
            <td>${fmt(r.balance)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

// --- Amort source toggle in add-debt form ---
let amortSource = 'calculator';
let pendingCSVSchedule = null;

$$('.amort-src-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.amort-src-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    amortSource = btn.dataset.source;
    $('#amort-calc-panel').style.display = amortSource === 'calculator' ? 'block' : 'none';
    $('#amort-csv-panel').style.display = amortSource === 'csv' ? 'block' : 'none';
  });
});

// CSV template download
$('#btn-csv-template').addEventListener('click', () => {
  const csv = generateCSVTemplate();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'amortization-template.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Template downloaded!');
});

// CSV file input
$('#csv-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = $('#csv-status');

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      pendingCSVSchedule = parseAmortCSV(evt.target.result);
      statusEl.className = 'csv-status csv-ok';
      statusEl.textContent = `Parsed ${pendingCSVSchedule.length} rows successfully. Click "Preview Schedule" to review.`;
    } catch (err) {
      pendingCSVSchedule = null;
      statusEl.className = 'csv-status csv-err';
      statusEl.textContent = 'Error: ' + err.message;
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Preview Schedule button
let pendingPreviewSchedule = null;
let pendingPreviewCallback = null;

$('#btn-preview-schedule').addEventListener('click', () => {
  let schedule = null;

  if (amortSource === 'csv') {
    if (!pendingCSVSchedule) {
      showToast('Please upload a CSV file first.', 'error');
      return;
    }
    schedule = pendingCSVSchedule;
  } else {
    const principal = parseFloat($('#amort-principal').value);
    const term = parseInt($('#amort-term').value);
    const rate = parseFloat($('#debt-rate').value);
    const emi = parseFloat($('#amort-emi').value) || 0;
    const made = parseInt($('#amort-payments-made').value) || 0;
    const startDate = $('#amort-start-date').value || null;

    if (!principal || !term || !rate) {
      showToast('Please fill in Principal, Term, and Interest Rate.', 'error');
      return;
    }
    schedule = generateScheduleFromCalc(principal, term, rate, emi, made, startDate);
  }

  openAmortPreviewModal(schedule);
});

// --- Preview Modal ---
function openAmortPreviewModal(schedule) {
  pendingPreviewSchedule = schedule;
  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
  const totalEmi = schedule.reduce((s, r) => s + r.emi, 0);
  $('#amort-preview-info').innerHTML = `<strong>${schedule.length} payments</strong> &middot; Total EMI: ${fmt(totalEmi)} &middot; Total Interest: ${fmt(totalInterest)}`;
  renderAmortTableInto($('#amort-preview-table'), schedule, 0);
  openModal('amort-preview-overlay');
}

$('#amort-preview-export').addEventListener('click', () => {
  if (pendingPreviewSchedule) {
    const name = $('#debt-name').value.trim() || 'schedule';
    downloadCSV(pendingPreviewSchedule, `amortization-${name}-${todayISO()}.csv`);
    showToast('Schedule exported as CSV!');
  }
});

// Confirm from preview modal — triggers the actual debt form submission
$('#amort-preview-confirm').addEventListener('click', () => {
  closeModal('amort-preview-overlay');
  // Store the confirmed schedule and submit the form programmatically
  confirmedSchedule = pendingPreviewSchedule;
  submitDebtForm();
});

let confirmedSchedule = null;

// --- Viewer Modal (for existing debts) ---
let viewerDebtIdx = null;

function openAmortViewerModal(idx) {
  const debt = debts[idx];
  if (!debt || !debt.amort || !debt.amort.schedule) return;
  viewerDebtIdx = idx;

  const schedule = debt.amort.schedule;
  const made = debt.amort.paymentsMade || 0;
  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
  const totalEmi = schedule.reduce((s, r) => s + r.emi, 0);

  $('#amort-viewer-info').innerHTML = `<strong>${escapeHtml(debt.name)}</strong> &middot; ${schedule.length} payments &middot; Total Interest: ${fmt(totalInterest)}`;
  renderAmortTableInto($('#amort-viewer-table'), schedule, made);
  openModal('amort-viewer-overlay');
}

$('#amort-viewer-export').addEventListener('click', () => {
  if (viewerDebtIdx !== null && debts[viewerDebtIdx] && debts[viewerDebtIdx].amort && debts[viewerDebtIdx].amort.schedule) {
    const debt = debts[viewerDebtIdx];
    downloadCSV(debt.amort.schedule, `amortization-${debt.name}-${todayISO()}.csv`);
    showToast('Schedule exported as CSV!');
  }
});

$('#amort-viewer-csv-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || viewerDebtIdx === null) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const schedule = parseAmortCSV(evt.target.result);
      debts[viewerDebtIdx].amort.schedule = schedule;
      debts[viewerDebtIdx].amort.source = 'csv';
      save();
      openAmortViewerModal(viewerDebtIdx); // refresh
      showToast(`Schedule updated from CSV (${schedule.length} rows).`);
    } catch (err) {
      showToast('CSV import error: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// --- Migration: auto-generate schedule for existing amort debts without one ---
(function migrateAmortSchedules() {
  let changed = false;
  debts.forEach(d => {
    if (d.amort && !d.amort.schedule) {
      const { principal, term, emi, paymentsMade, startDate } = d.amort;
      if (principal && term && d.rate) {
        d.amort.schedule = generateScheduleFromCalc(principal, term, d.rate, emi, paymentsMade || 0, startDate || null);
        d.amort.source = 'calculator';
        changed = true;
      }
    }
  });
  if (changed) localStorage.setItem('debtzero_debts', JSON.stringify(debts));
})();

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
// DATA MANAGEMENT
// ============================================================

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '\u{2705}' : '\u{274C}'}</span> ${escapeHtml(message)}`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function renderDataMeta() {
  const debtCount = debts.length;
  const txCount = transactions.length;
  const dataSize = new Blob([
    localStorage.getItem('debtzero_debts') || '',
    localStorage.getItem('debtzero_transactions') || '',
    localStorage.getItem('debtzero_totalPaid') || '',
    localStorage.getItem('debtzero_originalTotal') || '',
  ]).size;

  const lastTx = transactions.length > 0
    ? fmtDate(transactions[transactions.length - 1].date) || transactions[transactions.length - 1].date
    : 'N/A';

  const metaEl = $('#data-meta');
  if (metaEl) {
    metaEl.innerHTML = `
      <div class="data-meta-item"><span class="dm-label">Debts</span><span class="dm-value">${debtCount}</span></div>
      <div class="data-meta-item"><span class="dm-label">Transactions</span><span class="dm-value">${txCount}</span></div>
      <div class="data-meta-item"><span class="dm-label">Last Activity</span><span class="dm-value">${lastTx}</span></div>
      <div class="data-meta-item"><span class="dm-label">Storage Used</span><span class="dm-value">${(dataSize / 1024).toFixed(1)} KB</span></div>
    `;
  }

  const statusText = $('#data-status-text');
  const statusDot = document.querySelector('#data-status .status-dot');
  if (statusText && statusDot) {
    if (debtCount > 0 || txCount > 0) {
      statusText.textContent = 'All data saved locally. Consider exporting a backup.';
      statusDot.className = 'status-dot status-ok';
    } else {
      statusText.textContent = 'No data yet. Add debts to get started.';
      statusDot.className = 'status-dot status-warn';
    }
  }
}

// Export
$('#btn-export').addEventListener('click', () => {
  const data = {
    version: 5,
    exportDate: new Date().toISOString(),
    debts,
    transactions,
    totalPaid,
    originalTotal,
    settings,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `debtzero-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('Backup exported successfully!');
});

// Import
$('#file-import').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);

      if (!data.debts || !Array.isArray(data.debts)) {
        throw new Error('Invalid backup file format.');
      }

      if (debts.length > 0 || transactions.length > 0) {
        if (!confirm('This will replace all current data with the backup. Continue?')) {
          return;
        }
      }

      debts = data.debts;
      transactions = data.transactions || [];
      totalPaid = data.totalPaid || 0;
      originalTotal = data.originalTotal || 0;

      if (data.settings) {
        settings = { ...DEFAULT_SETTINGS, ...data.settings };
        localStorage.setItem('debtzero_settings', JSON.stringify(settings));
      }

      save();
      render();
      renderDataMeta();
      showToast(`Backup restored! ${debts.length} debts, ${transactions.length} transactions loaded.`);
    } catch (err) {
      showToast('Failed to import: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Reset
$('#btn-reset').addEventListener('click', () => {
  if (!confirm('Are you sure? This will permanently erase ALL your debts, payments, and progress.')) return;
  if (!confirm('Really? This cannot be undone. Click OK to confirm reset.')) return;

  debts = [];
  transactions = [];
  totalPaid = 0;
  originalTotal = 0;

  settings = { ...DEFAULT_SETTINGS };

  localStorage.removeItem('debtzero_debts');
  localStorage.removeItem('debtzero_transactions');
  localStorage.removeItem('debtzero_totalPaid');
  localStorage.removeItem('debtzero_originalTotal');
  localStorage.removeItem('debtzero_settings');

  save();
  render();
  renderDataMeta();
  showToast('All data has been reset.');
});

// ============================================================
// SETTINGS MODAL
// ============================================================
function openSettings() {
  $('#setting-currency').value = settings.currency;
  $('#setting-show-symbol').checked = settings.showSymbol;
  document.querySelectorAll('input[name="number-format"]').forEach(r => {
    r.checked = r.value === settings.numberFormat;
  });
  updateSettingsPreview();
  renderDataMeta();
  openModal('settings-overlay');
}

function updateSettingsPreview() {
  const curr = $('#setting-currency').value;
  const showSym = $('#setting-show-symbol').checked;
  const numFmt = document.querySelector('input[name="number-format"]:checked').value;

  const prev = { ...settings };
  settings.currency = curr;
  settings.showSymbol = showSym;
  settings.numberFormat = numFmt;

  $('#settings-preview').textContent = fmt(5020000.75);

  settings.currency = prev.currency;
  settings.showSymbol = prev.showSymbol;
  settings.numberFormat = prev.numberFormat;
}

$('#settings-toggle').addEventListener('click', openSettings);

// Live preview on any settings change
$('#setting-currency').addEventListener('change', updateSettingsPreview);
$('#setting-show-symbol').addEventListener('change', updateSettingsPreview);
$$('input[name="number-format"]').forEach(r => {
  r.addEventListener('change', updateSettingsPreview);
});

$('#settings-save').addEventListener('click', () => {
  settings.currency = $('#setting-currency').value;
  settings.showSymbol = $('#setting-show-symbol').checked;
  settings.numberFormat = document.querySelector('input[name="number-format"]:checked').value;

  localStorage.setItem('debtzero_settings', JSON.stringify(settings));
  closeModal('settings-overlay');
  render();
  renderDataMeta();
  showToast('Settings saved! Currency updated to ' + settings.currency + '.');
});

// ============================================================
// INIT
// ============================================================
render();
renderDataMeta();
