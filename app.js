import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut as fbSignOut }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, push, set, get, onValue, query, orderByChild, limitToLast }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCdU-t2ItIjVFRQo65rzle8n2PrKZ_STmU",
  authDomain: "cameroon-fintech-status.firebaseapp.com",
  databaseURL: "https://cameroon-fintech-status-default-rtdb.firebaseio.com",
  projectId: "cameroon-fintech-status",
  storageBucket: "cameroon-fintech-status.firebasestorage.app",
  messagingSenderId: "842559320219",
  appId: "1:842559320219:web:6011def2b8d8031b6bd63e"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db   = getDatabase(firebaseApp);

// ── EMAILJS ───────────────────────────────────────────
const EMAILJS_PUBLIC_KEY  = "d8K09WdYtlKvPaXd_";
const EMAILJS_SERVICE_ID  = "service_6ljqwdj";
const EMAILJS_TEMPLATE_ID = "template_eojd1t9";

async function sendEmailAlert(toEmail, toName, serviceName, status, details) {
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:  EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id:     EMAILJS_PUBLIC_KEY,
        template_params: {
          to_name:      toName,
          to_email:     toEmail,
          service_name: serviceName,
          status:       status,
          time:         new Date().toLocaleString("en-GB"),
          details:      details
        }
      })
    });
    return res.status === 200;
  } catch(e) {
    console.error("EmailJS error:", e);
    return false;
  }
}

// ── UPTIMEROBOT ───────────────────────────────────────
const UPTIME_API_KEY = "u3467999-6008331abb99448af28067b2";
let previousStatuses = {};
let alertHistory     = [];

async function fetchUptimeData() {
  try {
    const res = await fetch("https://api.uptimerobot.com/v2/getMonitors", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `api_key=${UPTIME_API_KEY}&format=json&logs=0&response_times=1`
    });
    const data = await res.json();
    if (data.stat === "ok" && data.monitors?.length) {
      await applyUptimeData(data.monitors);
      const indicator = document.getElementById("live-indicator");
      if (indicator) {
        indicator.innerHTML = `
          <div class="live-indicator-dot"></div>
          <span>${t("live_data_ok")} · ${new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>`;
      }
    }
  } catch(e) {
    console.log("UptimeRobot fetch failed — using static data");
  }
}

async function applyUptimeData(monitors) {
  const alertPrefs = await loadAlertPrefs();

  for (const monitor of monitors) {
    const match = userServices.find(s =>
      s.name.toLowerCase().includes(monitor.friendly_name.toLowerCase()) ||
      monitor.friendly_name.toLowerCase().includes(s.name.toLowerCase().split(" ")[0])
    );
    if (!match) continue;

    const prevStatus = previousStatuses[match.name];
    let newStatus = match.status;

    if (monitor.status === 2)      newStatus = "operational";
    else if (monitor.status === 8) newStatus = "degraded";
    else if (monitor.status === 9) newStatus = "outage";

    if (monitor.all_time_uptime_ratio) {
      match.note = `Live uptime: ${parseFloat(monitor.all_time_uptime_ratio).toFixed(2)}%`;
    }

    // Detect status change and fire alert
    if (prevStatus && prevStatus !== newStatus && alertPrefs) {
      const shouldAlert = alertPrefs.services?.[match.name] !== false;
      if (shouldAlert && alertPrefs.email) {
        const statusText = newStatus === "outage" ? "DOWN — Service outage detected"
          : newStatus === "degraded" ? "DEGRADED — Performance issues detected"
          : "RECOVERED — Service is back online";

        const sent = await sendEmailAlert(
          alertPrefs.email,
          alertPrefs.name || "FinCheck User",
          match.name,
          statusText,
          match.note
        );

        // Log to alert history
        const historyEntry = {
          service: match.name,
          status: statusText,
          time: new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),
          sent: sent ? "Email sent ✓" : "Email failed ✗",
          type: newStatus
        };
        alertHistory.unshift(historyEntry);
        renderAlertHistory();

        // Save to Firebase
        if (currentUser) {
          await push(ref(db, `users/${currentUser.uid}/alertHistory`), {
            ...historyEntry, timestamp: Date.now()
          });
        }
      }
    }

    previousStatuses[match.name] = newStatus;
    match.status = newStatus;
  }

  renderOverview();
  renderMonitoring();
}

// ── TRANSLATIONS ──────────────────────────────────────
const translations = {
  en: {
    brand:"FinCheck Cameroon", nav_overview:"Overview", nav_monitoring:"Monitoring",
    nav_tracker:"Tracker", nav_services:"My Services", nav_logs:"Live Logs",
    nav_alerts:"Alerts", signout:"Sign out",
    live_data:"Fetching live uptime data...", live_data_ok:"Live data from UptimeRobot",
    greeting_prefix:"Welcome back", overview_title:"Platform Overview",
    overview_sub:"Live monitoring of Cameroonian fintech services",
    monitored:"Monitored", operational:"Operational", disrupted:"Disrupted", outage:"Outage",
    search_services:"Search services...", report_title:"Report an issue",
    report_sub:"Experiencing a problem? Let the community know.",
    select_service:"Select a service...", select_issue:"Type of issue...",
    issue_login:"Cannot log in", issue_tx:"Transaction failed",
    issue_funds:"Funds debited but not received", issue_otp:"OTP not received",
    issue_app:"App not loading", issue_slow:"Slow transactions", issue_other:"Other",
    desc_placeholder:"Describe the issue briefly (optional)...",
    submit_report:"Submit report", report_ok:"✓ Report submitted. Thank you!",
    report_err:"Please select a service and issue type.",
    monitoring_title:"Monitoring Dashboard",
    monitoring_sub:"Key metrics across all Cameroonian fintech services",
    uptime_chart:"Uptime % — Last 30 days", incident_chart:"Incident frequency",
    heatmap_title:"Peak downtime hours", heatmap_sub:"Hours when outages occur most",
    response_title:"Response time trends", response_sub:"Average response time (ms)",
    tracker_title:"Transaction Tracker", tracker_sub:"Monitor and manage your transactions",
    total:"Total", total_sent:"Total sent", search_tx:"Search transactions...",
    all:"All", success:"Success", pending:"Pending", failed:"Failed", successful:"Successful",
    dispute:"⚠ Dispute", timeline:"⏱ Timeline",
    services_title:"My Services", services_sub:"Personalise which fintechs you monitor",
    remove:"Remove", add_service:"Add a service",
    add_sub:"Don't see your fintech? Add it manually.",
    name_placeholder:"Service name (e.g. Ecobank Mobile)",
    type_placeholder:"Type (e.g. Mobile Banking)", add_btn:"Add service",
    logs_title:"Live Logs", logs_sub:"Real-time community reports",
    no_logs:"No reports yet. Be the first!",
    dispute_title:"Dispute Transaction", dispute_reason:"Reason for dispute",
    select_reason:"Select reason...", r1:"Funds debited but not received",
    r2:"Wrong amount charged", r3:"Transaction not initiated by me",
    r4:"Service not delivered", r5:"Other",
    details:"Additional details", details_ph:"Describe what happened...",
    submit_dispute:"Submit Dispute", timeline_title:"Transaction Timeline",
    refresh_in:"Auto-refreshing in", refresh_btn:"Refresh now",
    health_label:"Transaction success rate",
    health_score:"of your transactions completed successfully",
    spending:"Spending breakdown", all_good:"All systems operational",
    some_issues:"Some disruptions", some_down:"Some services down",
    last_30:"Last 30 days", newly_added:"Newly added service",
    add_ok:"added to your services.", add_err:"Please fill in both fields.",
    dispute_ok:"✓ Dispute submitted. Reference: ", dispute_err:"Failed to submit.",
    dispute_reason_err:"Please select a reason.",
    health_great:"Excellent", health_good:"Good", health_poor:"Poor", health_prefix:"Health: ",
    reports_count:"community report", reports_counts:"community reports",
    alerts_title:"Alerts & Notifications",
    alerts_sub:"Get notified when a service goes down",
    alerts_contact:"Contact details",
    alerts_contact_sub:"Where should we send alerts when a service goes down?",
    alerts_email_label:"Email address",
    alerts_email_ph:"you@email.com",
    alerts_phone_label:"Phone number (SMS — coming soon)",
    alerts_phone_ph:"+237 6XX XXX XXX",
    alerts_freq_label:"Alert frequency",
    alerts_instant:"Instant — alert me the moment a service goes down",
    alerts_digest:"Digest — send me a summary every hour",
    alerts_save:"Save preferences",
    alerts_saved:"✓ Alert preferences saved.",
    alerts_save_err:"Please enter at least an email address.",
    alerts_services_title:"Services to monitor",
    alerts_services_sub:"Choose which services trigger an alert",
    alerts_history_title:"Alert history",
    alerts_history_sub:"Alerts sent in this session",
    alerts_no_history:"No alerts sent yet this session.",
    alert_sent_via:"Alert sent via email",
    alert_failed:"Alert failed to send",
  },
  fr: {
    brand:"FinCheck Cameroun", nav_overview:"Aperçu", nav_monitoring:"Surveillance",
    nav_tracker:"Suivi", nav_services:"Mes Services", nav_logs:"Journaux Live",
    nav_alerts:"Alertes", signout:"Déconnexion",
    live_data:"Récupération des données en direct...",
    live_data_ok:"Données en direct via UptimeRobot",
    greeting_prefix:"Bienvenue", overview_title:"Aperçu de la plateforme",
    overview_sub:"Surveillance en direct des services fintech camerounais",
    monitored:"Surveillés", operational:"Opérationnel", disrupted:"Perturbé", outage:"Panne",
    search_services:"Rechercher un service...", report_title:"Signaler un problème",
    report_sub:"Vous avez un problème? Informez la communauté.",
    select_service:"Sélectionner un service...", select_issue:"Type de problème...",
    issue_login:"Impossible de se connecter", issue_tx:"Transaction échouée",
    issue_funds:"Fonds débités mais non reçus", issue_otp:"OTP non reçu",
    issue_app:"Application ne charge pas", issue_slow:"Transactions lentes",
    issue_other:"Autre", desc_placeholder:"Décrivez brièvement le problème (optionnel)...",
    submit_report:"Soumettre le signalement", report_ok:"✓ Signalement soumis. Merci!",
    report_err:"Veuillez sélectionner un service et un type de problème.",
    monitoring_title:"Tableau de bord de surveillance",
    monitoring_sub:"Métriques clés pour tous les services fintech camerounais",
    uptime_chart:"Disponibilité % — 30 derniers jours",
    incident_chart:"Fréquence des incidents",
    heatmap_title:"Heures de panne les plus fréquentes",
    heatmap_sub:"Heures auxquelles les pannes surviennent le plus",
    response_title:"Tendances des temps de réponse",
    response_sub:"Temps de réponse moyen (ms)",
    tracker_title:"Suivi des transactions", tracker_sub:"Surveillez et gérez vos transactions",
    total:"Total", total_sent:"Total envoyé", search_tx:"Rechercher une transaction...",
    all:"Tout", success:"Succès", pending:"En attente", failed:"Échoué",
    successful:"Réussi", dispute:"⚠ Contester", timeline:"⏱ Chronologie",
    services_title:"Mes Services",
    services_sub:"Personnalisez les fintechs que vous surveillez",
    remove:"Supprimer", add_service:"Ajouter un service",
    add_sub:"Votre fintech n'est pas listée? Ajoutez-la manuellement.",
    name_placeholder:"Nom du service (ex: Ecobank Mobile)",
    type_placeholder:"Type (ex: Banque Mobile)", add_btn:"Ajouter le service",
    logs_title:"Journaux en direct",
    logs_sub:"Signalements communautaires en temps réel",
    no_logs:"Aucun signalement pour l'instant. Soyez le premier!",
    dispute_title:"Contester une transaction", dispute_reason:"Raison de la contestation",
    select_reason:"Sélectionner une raison...", r1:"Fonds débités mais non reçus",
    r2:"Montant incorrect débité", r3:"Transaction non initiée par moi",
    r4:"Service non rendu", r5:"Autre",
    details:"Détails supplémentaires", details_ph:"Décrivez ce qui s'est passé...",
    submit_dispute:"Soumettre la contestation", timeline_title:"Chronologie de la transaction",
    refresh_in:"Actualisation dans", refresh_btn:"Actualiser maintenant",
    health_label:"Taux de réussite des transactions",
    health_score:"de vos transactions ont été complétées avec succès",
    spending:"Répartition des dépenses", all_good:"Tous les systèmes opérationnels",
    some_issues:"Quelques perturbations", some_down:"Certains services indisponibles",
    last_30:"30 derniers jours", newly_added:"Service nouvellement ajouté",
    add_ok:"ajouté à vos services.", add_err:"Veuillez remplir les deux champs.",
    dispute_ok:"✓ Contestation soumise. Référence: ", dispute_err:"Échec de la soumission.",
    dispute_reason_err:"Veuillez sélectionner une raison.",
    health_great:"Excellent", health_good:"Bon", health_poor:"Faible",
    health_prefix:"Santé: ", reports_count:"signalement", reports_counts:"signalements",
    alerts_title:"Alertes & Notifications",
    alerts_sub:"Recevez une notification quand un service tombe en panne",
    alerts_contact:"Coordonnées",
    alerts_contact_sub:"Où devons-nous envoyer les alertes?",
    alerts_email_label:"Adresse email",
    alerts_email_ph:"vous@email.com",
    alerts_phone_label:"Numéro de téléphone (SMS — bientôt disponible)",
    alerts_phone_ph:"+237 6XX XXX XXX",
    alerts_freq_label:"Fréquence des alertes",
    alerts_instant:"Instantané — alertez-moi dès qu'un service tombe",
    alerts_digest:"Résumé — envoyez-moi un résumé toutes les heures",
    alerts_save:"Enregistrer les préférences",
    alerts_saved:"✓ Préférences d'alerte enregistrées.",
    alerts_save_err:"Veuillez entrer au moins une adresse email.",
    alerts_services_title:"Services à surveiller",
    alerts_services_sub:"Choisissez les services qui déclenchent une alerte",
    alerts_history_title:"Historique des alertes",
    alerts_history_sub:"Alertes envoyées pendant cette session",
    alerts_no_history:"Aucune alerte envoyée cette session.",
    alert_sent_via:"Alerte envoyée par email",
    alert_failed:"Échec de l'envoi de l'alerte",
  }
};

// ── LANGUAGE ──────────────────────────────────────────
let currentLang = localStorage.getItem("fincheck_lang") || "en";

function t(key) {
  return translations[currentLang][key] || translations["en"][key] || key;
}

window.setLang = function(lang) {
  currentLang = lang;
  localStorage.setItem("fincheck_lang", lang);
  document.querySelectorAll(".lang-btn").forEach((btn, i) => {
    btn.classList.toggle("active", (i===0&&lang==="en")||(i===1&&lang==="fr"));
  });
  applyTranslations();
  populateReportSelect();
  renderOverview();
  renderMonitoring();
  renderTracker();
  renderManageServices();
  renderAlertToggles();
};

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (el.tagName==="INPUT"||el.tagName==="TEXTAREA") el.placeholder = t(key);
    else el.textContent = t(key);
  });
}

// ── DEFAULT SERVICES ──────────────────────────────────
const defaultServices = [
  { name:"Sara Money",       type:"Afriland First Bank · Mobile Wallet", status:"degraded",    note:"Login issues reported",  uptime:["up","up","up","up","up","up","partial","partial","up","up","up","up","up","up","down","up","up","up","up","up","up","up","partial","up","up","up","up","up","up","up"] },
  { name:"MTN Mobile Money", type:"MTN Cameroon · Mobile Money",         status:"operational", note:"All systems normal",     uptime:["up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up"] },
  { name:"Orange Money",     type:"Orange Cameroun · Mobile Money",      status:"operational", note:"All systems normal",     uptime:["up","up","up","up","up","up","up","up","up","up","up","up","up","up","partial","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up"] },
  { name:"Express Union",    type:"Express Union · Money Transfer",      status:"outage",      note:"Service unavailable",    uptime:["up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","down","down","down","up","up","up","up","up"] },
  { name:"CCA Bank",         type:"CCA Bank · Mobile Banking",           status:"operational", note:"All systems normal",     uptime:["up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up"] },
  { name:"Yoomee Mobile",    type:"Yoomee · Mobile Payment",             status:"operational", note:"All systems normal",     uptime:["up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up","up"] }
];

const transactions = [
  { id:"TXN-00134", to:"MTN Mobile Money",        amount:5000,  date:"24 Apr 2026 · 09:14", status:"success", note:"Airtime top-up" },
  { id:"TXN-00133", to:"Orange Money",             amount:12500, date:"24 Apr 2026 · 08:52", status:"pending", note:"Awaiting network confirmation" },
  { id:"TXN-00132", to:"Jean-Paul Kamga",          amount:25000, date:"23 Apr 2026 · 17:30", status:"failed",  note:"Transaction debited — funds not received." },
  { id:"TXN-00131", to:"Express Union",            amount:50000, date:"23 Apr 2026 · 14:11", status:"success", note:"School fees payment" },
  { id:"TXN-00130", to:"Afriland Branch — Bastos", amount:8200,  date:"22 Apr 2026 · 11:05", status:"pending", note:"Withdrawal request processing" },
  { id:"TXN-00129", to:"Mama Ngono Store",         amount:3750,  date:"21 Apr 2026 · 16:44", status:"success", note:"QR code merchant payment" }
];

// ── STATE ─────────────────────────────────────────────
let currentUser      = null;
let userServices     = [...defaultServices];
let currentFilter    = "all";
let currentDisputeTx = null;
let logsStarted      = false;

// ── AUTH ──────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;
  const name = user.displayName || user.email.split("@")[0];
  document.getElementById("user-display").textContent = name;
  document.getElementById("greeting").textContent = `${t("greeting_prefix")}, ${name}`;
  applyTranslations();
  loadUserServices();
  loadAlertPrefsIntoForm();
  initClock();
  initCountdown();
  renderMonitoring();
  renderTracker();
  fetchUptimeData();
  setInterval(fetchUptimeData, 60000);
});

window.signOut = async function() {
  await fbSignOut(auth);
  window.location.href = "index.html";
};

// ── PAGES ─────────────────────────────────────────────
window.showPage = function(name, link) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(l => l.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  if (link) link.classList.add("active");
  if (name === "logs")    startLiveLogs();
  if (name === "services") renderManageServices();
  if (name === "alerts")  renderAlertToggles();
};

// ── CLOCK & COUNTDOWN ─────────────────────────────────
function initClock() {
  function tick() {
    const el = document.getElementById("live-clock");
    if (el) el.textContent = new Date().toLocaleTimeString("en-GB",
      { hour:"2-digit", minute:"2-digit", second:"2-digit" });
  }
  setInterval(tick, 1000); tick();
}

function initCountdown() {
  let c = 60;
  setInterval(() => {
    c--;
    const el = document.getElementById("countdown");
    if (el) el.textContent = c;
    if (c <= 0) { c = 60; renderOverview(); }
  }, 1000);
}
window.manualRefresh = function() { fetchUptimeData(); renderOverview(); };

// ── USER SERVICES ─────────────────────────────────────
async function loadUserServices() {
  const snap = await get(ref(db, `users/${currentUser.uid}/services`));
  if (snap.exists()) userServices = snap.val();
  else await set(ref(db, `users/${currentUser.uid}/services`), defaultServices);
  populateReportSelect();
  renderOverview();
}

async function saveUserServices() {
  await set(ref(db, `users/${currentUser.uid}/services`), userServices);
}

function populateReportSelect() {
  const sel = document.getElementById("report-service");
  if (sel) sel.innerHTML = `<option value="">${t("select_service")}</option>` +
    userServices.map(s=>`<option>${s.name}</option>`).join("");
  const typeEl = document.getElementById("report-type");
  if (typeEl) typeEl.innerHTML = `
    <option value="">${t("select_issue")}</option>
    <option>${t("issue_login")}</option>
    <option>${t("issue_tx")}</option>
    <option>${t("issue_funds")}</option>
    <option>${t("issue_otp")}</option>
    <option>${t("issue_app")}</option>
    <option>${t("issue_slow")}</option>
    <option>${t("issue_other")}</option>`;
  const desc = document.getElementById("report-desc");
  if (desc) desc.placeholder = t("desc_placeholder");
  const btn = document.querySelector(".report-section .primary-btn");
  if (btn) btn.textContent = t("submit_report");
  const heading = document.querySelector(".report-section h2");
  if (heading) heading.textContent = t("report_title");
  const subtitle = document.querySelector(".report-section .subtitle");
  if (subtitle) subtitle.textContent = t("report_sub");
}

// ── OVERVIEW ──────────────────────────────────────────
function renderOverview() {
  renderSummary(); renderServices(); setOverallBadge();
}

function renderSummary() {
  const ok   = userServices.filter(s=>s.status==="operational").length;
  const warn = userServices.filter(s=>s.status==="degraded").length;
  const bad  = userServices.filter(s=>s.status==="outage").length;
  const el   = document.getElementById("summary-grid");
  if (!el) return;
  el.innerHTML = `
    <div class="summary-card"><p class="s-label">${t("monitored")}</p><p class="s-num">${userServices.length}</p></div>
    <div class="summary-card"><p class="s-label">${t("operational")}</p><p class="s-num ok">${ok}</p></div>
    <div class="summary-card"><p class="s-label">${t("disrupted")}</p><p class="s-num warn">${warn}</p></div>
    <div class="summary-card"><p class="s-label">${t("outage")}</p><p class="s-num bad">${bad}</p></div>`;
}

function setOverallBadge() {
  const badge = document.getElementById("overall-badge");
  if (!badge) return;
  const bad  = userServices.some(s=>s.status==="outage");
  const warn = userServices.some(s=>s.status==="degraded");
  if (bad)       { badge.textContent=t("some_down");   badge.className="overall-badge issues"; }
  else if (warn) { badge.textContent=t("some_issues"); badge.className="overall-badge some"; }
  else           { badge.textContent=t("all_good");    badge.className="overall-badge all-good"; }
}

const hoverMessages = {
  operational:{ en:"All systems running normally.", fr:"Tous les systèmes fonctionnent normalement." },
  degraded:   { en:"Issues reported. Transactions may fail.", fr:"Problèmes signalés. Les transactions peuvent échouer." },
  outage:     { en:"Service DOWN. Contact support if funds debited.", fr:"Service EN PANNE. Contactez le support si des fonds ont été débités." }
};

function renderServices() {
  const q = (document.getElementById("search-input")?.value||"").toLowerCase();
  const filtered = userServices.filter(s=>
    s.name.toLowerCase().includes(q)||s.type.toLowerCase().includes(q));
  const grid = document.getElementById("services-grid");
  if (!grid) return;
  if (!filtered.length) { grid.innerHTML=`<div class="no-results">No services found.</div>`; return; }
  grid.innerHTML = filtered.map(s => {
    const blocks = s.uptime.map(d=>`<div class="uptime-block ${d}"></div>`).join("");
    const msg    = hoverMessages[s.status]?.[currentLang]||"";
    const stLabel = currentLang==="fr"
      ? (s.status==="operational"?"Opérationnel":s.status==="degraded"?"Perturbé":"Panne")
      : (s.status.charAt(0).toUpperCase()+s.status.slice(1));
    return `
      <div class="service-card">
        <div class="service-top">
          <p class="service-name">${s.name}</p>
          <div class="status-dot ${s.status}"></div>
        </div>
        <p class="service-type">${s.type}</p>
        <span class="status-badge ${s.status}">${stLabel}</span>
        <p class="service-note">${s.note}</p>
        <div class="uptime-bar">${blocks}</div>
        <p class="uptime-label">${t("last_30")}</p>
        <div class="hover-message ${s.status}">${msg}</div>
      </div>`;
  }).join("");
}

// ── REPORT ────────────────────────────────────────────
window.submitReport = async function() {
  const service  = document.getElementById("report-service").value;
  const type     = document.getElementById("report-type").value;
  const desc     = document.getElementById("report-desc").value.trim();
  const feedback = document.getElementById("report-feedback");
  if (!service||!type) { feedback.textContent=t("report_err"); feedback.className="feedback error"; return; }
  try {
    await push(ref(db,"reports"), {
      service, type, desc:desc||"No details", timestamp:Date.now(),
      user:currentUser.displayName||currentUser.email, lang:currentLang
    });
    feedback.textContent=t("report_ok"); feedback.className="feedback success";
    document.getElementById("report-service").value="";
    document.getElementById("report-type").value="";
    document.getElementById("report-desc").value="";
    setTimeout(()=>{ feedback.textContent=""; feedback.className="feedback"; },4000);
  } catch(e) { feedback.textContent=t("report_err"); feedback.className="feedback error"; }
};

// ── ALERT PREFERENCES ─────────────────────────────────
async function loadAlertPrefs() {
  if (!currentUser) return null;
  try {
    const snap = await get(ref(db, `users/${currentUser.uid}/alertPrefs`));
    return snap.exists() ? snap.val() : null;
  } catch(e) { return null; }
}

async function loadAlertPrefsIntoForm() {
  const prefs = await loadAlertPrefs();
  if (!prefs) return;
  const emailEl = document.getElementById("alert-email");
  const phoneEl = document.getElementById("alert-phone");
  const freqEl  = document.getElementById("alert-frequency");
  if (emailEl && prefs.email) emailEl.value = prefs.email;
  if (phoneEl && prefs.phone) phoneEl.value = prefs.phone;
  if (freqEl  && prefs.freq)  freqEl.value  = prefs.freq;
}

window.saveAlertPrefs = async function() {
  const email = document.getElementById("alert-email").value.trim();
  const phone = document.getElementById("alert-phone").value.trim();
  const freq  = document.getElementById("alert-frequency").value;
  const fb    = document.getElementById("alert-prefs-feedback");
  if (!email) { fb.textContent=t("alerts_save_err"); fb.className="feedback error"; return; }

  // Save service toggle states
  const serviceToggles = {};
  userServices.forEach(s => {
    const toggle = document.getElementById(`toggle-${s.name.replace(/\s+/g,"_")}`);
    serviceToggles[s.name] = toggle ? toggle.checked : true;
  });

  try {
    await set(ref(db, `users/${currentUser.uid}/alertPrefs`), {
      email, phone, freq, services: serviceToggles,
      name: currentUser.displayName || currentUser.email.split("@")[0],
      updatedAt: Date.now()
    });
    fb.textContent = t("alerts_saved"); fb.className = "feedback success";
    setTimeout(()=>{ fb.textContent=""; fb.className="feedback"; }, 3000);
  } catch(e) { fb.textContent=t("alerts_save_err"); fb.className="feedback error"; }
};

function renderAlertToggles() {
  const el = document.getElementById("alert-toggles");
  if (!el) return;
  el.innerHTML = userServices.map(s => {
    const id = `toggle-${s.name.replace(/\s+/g,"_")}`;
    const dotColor = s.status==="operational"?"#2ecc71":s.status==="degraded"?"#f0a020":"#e74c3c";
    return `
      <div class="alert-toggle-row">
        <div class="alert-toggle-info">
          <h3>${s.name}</h3>
          <p>${s.type} · <span style="color:${dotColor}">${s.status}</span></p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="${id}" checked/>
          <span class="toggle-slider"></span>
        </label>
      </div>`;
  }).join("");
}

function renderAlertHistory() {
  const el = document.getElementById("alert-history-list");
  if (!el) return;
  if (!alertHistory.length) {
    el.innerHTML = `<div class="no-logs">${t("alerts_no_history")}</div>`; return;
  }
  el.innerHTML = alertHistory.slice(0,10).map((a,i) => `
    <div class="alert-history-card ${a.type==="operational"?"resolved":""}"
         style="animation-delay:${i*0.04}s">
      <div class="alert-h-top">
        <div class="alert-h-service">${a.service}</div>
        <div class="alert-h-time">${a.time}</div>
      </div>
      <div class="alert-h-status">${a.status}</div>
      <div class="alert-h-sent">${a.sent}</div>
    </div>`).join("");
}

// ── MONITORING ────────────────────────────────────────
function renderMonitoring() {
  renderUptimeChart(); renderIncidentChart(); renderHeatmap(); renderResponseChart();
}

function renderUptimeChart() {
  const el = document.getElementById("chart-uptime"); if (!el) return;
  el.innerHTML = userServices.map(s => {
    const upDays = s.uptime.filter(d=>d==="up").length;
    const pct    = Math.round((upDays/s.uptime.length)*100);
    const color  = pct>=95?"#2ecc71":pct>=80?"#f0a020":"#e74c3c";
    return `
      <div class="uptime-chart-row">
        <div class="uptime-chart-label">${s.name}</div>
        <div class="uptime-chart-bar-bg">
          <div class="uptime-chart-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="uptime-chart-pct">${pct}%</div>
      </div>`;
  }).join("");
}

function renderIncidentChart() {
  const el = document.getElementById("chart-incidents"); if (!el) return;
  const months = currentLang==="fr"
    ? ["Nov","Déc","Jan","Fév","Mar","Avr"]
    : ["Nov","Dec","Jan","Feb","Mar","Apr"];
  const data = [2,1,4,2,3,5]; const max = Math.max(...data);
  el.innerHTML = `<div class="inc-chart">` +
    months.map((m,i)=>`
      <div class="inc-bar-wrap">
        <div class="inc-bar" style="height:${(data[i]/max)*100}px"></div>
        <div class="inc-bar-label">${m}</div>
      </div>`).join("") + `</div>`;
}

function renderHeatmap() {
  const el = document.getElementById("chart-heatmap"); if (!el) return;
  const hours  = ["00","02","04","06","08","10","12","14","16","18","20","22"];
  const values = [8,5,3,2,4,6,7,5,9,12,10,7]; const max = Math.max(...values);
  el.innerHTML = `<div class="heatmap">` +
    values.map(v=>`<div class="heatmap-cell" style="background:rgba(231,76,60,${0.1+(v/max)*0.8})">${v}</div>`).join("") +
    `</div><div class="heatmap-labels">` +
    hours.map(h=>`<div class="heatmap-label">${h}h</div>`).join("") + `</div>`;
}

function renderResponseChart() {
  const el = document.getElementById("chart-response"); if (!el) return;
  const svcs   = ["Sara","MTN","Orange","Express","CCA","Yoomee"];
  const values = [420,180,210,890,160,240]; const max = Math.max(...values);
  const colors = ["#e74c3c","#2ecc71","#2ecc71","#e74c3c","#2ecc71","#3498db"];
  el.innerHTML = `<div class="response-chart">` +
    svcs.map((s,i)=>`
      <div class="resp-bar-wrap">
        <div class="resp-ms">${values[i]}</div>
        <div class="resp-bar" style="height:${(values[i]/max)*80}px;background:${colors[i]}"></div>
        <div class="resp-label">${s}</div>
      </div>`).join("") + `</div>`;
}

// ── TRACKER ───────────────────────────────────────────
function renderTracker() {
  renderTxSummary(); renderHealthScore(); renderSpendingChart(); renderTransactions();
}

function renderTxSummary() {
  const ok    = transactions.filter(t=>t.status==="success").length;
  const warn  = transactions.filter(t=>t.status==="pending").length;
  const bad   = transactions.filter(t=>t.status==="failed").length;
  const total = transactions.filter(t=>t.status==="success").reduce((s,t)=>s+t.amount,0);
  const el    = document.getElementById("tx-summary"); if (!el) return;
  el.innerHTML = `
    <div class="summary-card"><p class="s-label">${t("total")}</p><p class="s-num">${transactions.length}</p></div>
    <div class="summary-card"><p class="s-label">${t("successful")}</p><p class="s-num ok">${ok}</p></div>
    <div class="summary-card"><p class="s-label">${t("pending")}</p><p class="s-num warn">${warn}</p></div>
    <div class="summary-card"><p class="s-label">${t("failed")}</p><p class="s-num bad">${bad}</p></div>
    <div class="summary-card"><p class="s-label">${t("total_sent")}</p><p class="s-num" style="font-size:16px">${total.toLocaleString()} XAF</p></div>`;
}

function renderHealthScore() {
  const ok    = transactions.filter(t=>t.status==="success").length;
  const score = Math.round((ok/transactions.length)*100);
  const color = score>=90?"#2ecc71":score>=70?"#f0a020":"#e74c3c";
  const cls   = score>=90?"great":score>=70?"good":"poor";
  const label = score>=90?t("health_great"):score>=70?t("health_good"):t("health_poor");
  const badge = document.getElementById("health-badge");
  if (badge) { badge.textContent=`${t("health_prefix")}${label}`; badge.className=`health-badge ${cls}`; }
  const el = document.getElementById("health-section"); if (!el) return;
  el.innerHTML = `
    <p class="health-label">${t("health_label")}</p>
    <div class="health-bar-wrap"><div class="health-bar-fill" style="width:${score}%;background:${color}"></div></div>
    <p class="health-score-text">${score}% ${t("health_score")}</p>`;
}

function renderSpendingChart() {
  const byDest = {};
  transactions.filter(t=>t.status==="success").forEach(t=>{byDest[t.to]=(byDest[t.to]||0)+t.amount;});
  const sorted = Object.entries(byDest).sort((a,b)=>b[1]-a[1]);
  const max    = sorted[0]?.[1]||1;
  const colors = ["#2ecc71","#3498db","#9b59b6","#f39c12","#1abc9c"];
  const el     = document.getElementById("spending-chart"); if (!el) return;
  el.innerHTML = sorted.map(([name,amt],i)=>`
    <div class="chart-row">
      <div class="chart-label">${name}</div>
      <div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${(amt/max)*100}%;background:${colors[i%colors.length]}"></div></div>
      <div class="chart-amount">${amt.toLocaleString()} XAF</div>
    </div>`).join("");
}

window.filterTx = function(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderTransactions();
};

function renderTransactions() {
  const q = (document.getElementById("tx-search")?.value||"").toLowerCase();
  let filtered = transactions.filter(t=>
    t.to.toLowerCase().includes(q)||t.id.toLowerCase().includes(q)||t.note.toLowerCase().includes(q));
  if (currentFilter!=="all") filtered=filtered.filter(t=>t.status===currentFilter);
  const list = document.getElementById("tx-list"); if (!list) return;
  if (!filtered.length) { list.innerHTML=`<div class="no-results">${t("no_logs")}</div>`; return; }
  list.innerHTML = filtered.map(tx=>{
    const stLabel = tx.status==="success"?t("successful"):tx.status==="pending"?t("pending"):t("failed");
    const disputeBtn  = tx.status==="failed"?`<button class="tx-btn danger" onclick="openDispute('${tx.id}')">${t("dispute")}</button>`:"";
    const timelineBtn = tx.status==="pending"?`<button class="tx-btn" onclick="openTimeline('${tx.id}')">${t("timeline")}</button>`:"";
    return `
      <div class="tx-card">
        <div class="tx-main">
          <div class="tx-info">
            <p class="tx-name">${tx.to}</p>
            <p class="tx-meta">${tx.date} · ${tx.id}</p>
            <p class="tx-note">${tx.note}</p>
          </div>
          <div class="tx-right">
            <p class="tx-amount">${tx.amount.toLocaleString()} XAF</p>
            <span class="badge ${tx.status}">${stLabel}</span>
          </div>
        </div>
        ${disputeBtn||timelineBtn?`<div class="tx-actions">${disputeBtn}${timelineBtn}</div>`:""}
      </div>`;
  }).join("");
}

// ── DISPUTE ───────────────────────────────────────────
window.openDispute = function(txId) {
  const tx = transactions.find(t=>t.id===txId); if (!tx) return;
  currentDisputeTx = tx;
  document.getElementById("modal-tx-info").innerHTML =
    `<strong>${tx.to}</strong><br>${tx.id} · ${tx.date}<br>${tx.amount.toLocaleString()} XAF`;
  document.getElementById("dispute-modal").classList.add("open");
};
window.closeDispute = function() {
  document.getElementById("dispute-modal").classList.remove("open");
  document.getElementById("dispute-feedback").textContent="";
};
window.submitDispute = async function() {
  const reason = document.getElementById("dispute-reason").value;
  const desc   = document.getElementById("dispute-desc").value.trim();
  const fb     = document.getElementById("dispute-feedback");
  if (!reason) { fb.textContent=t("dispute_reason_err"); fb.className="feedback error"; return; }
  try {
    await push(ref(db,"disputes"), {
      txId:currentDisputeTx.id, service:currentDisputeTx.to,
      amount:currentDisputeTx.amount, reason, desc:desc||"No details",
      timestamp:Date.now(), user:currentUser.email
    });
    fb.textContent=t("dispute_ok")+currentDisputeTx.id; fb.className="feedback success";
    setTimeout(()=>window.closeDispute(),3000);
  } catch(e) { fb.textContent=t("dispute_err"); fb.className="feedback error"; }
};

// ── TIMELINE ──────────────────────────────────────────
window.openTimeline = function(txId) {
  const tx = transactions.find(t=>t.id===txId); if (!tx) return;
  const steps = currentLang==="fr" ? [
    { title:"Transaction initiée",          sub:`${tx.date} · ${tx.id}`,                             state:"done" },
    { title:"Requête envoyée au réseau",    sub:"Connexion au réseau de paiement",                   state:"done" },
    { title:"Traitement du paiement",       sub:"En attente de confirmation du réseau destinataire", state:"active" },
    { title:"Confirmation",                 sub:"En attente...",                                     state:"pending" },
    { title:"Terminé",                      sub:"Les fonds apparaîtront bientôt",                   state:"pending" }
  ] : [
    { title:"Transaction initiated",        sub:`${tx.date} · ${tx.id}`,                             state:"done" },
    { title:"Request sent to network",      sub:"Connecting to payment network",                     state:"done" },
    { title:"Processing payment",           sub:"Awaiting confirmation from recipient network",      state:"active" },
    { title:"Confirmation",                 sub:"Pending...",                                        state:"pending" },
    { title:"Complete",                     sub:"Funds will reflect shortly",                        state:"pending" }
  ];
  const icons = { done:"✓", active:"⏳", pending:"○" };
  document.getElementById("timeline-content").innerHTML = `
    <p style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:1.25rem">${tx.to} · ${tx.amount.toLocaleString()} XAF</p>
    <div class="timeline">${steps.map(s=>`
      <div class="timeline-step">
        <div class="timeline-dot ${s.state}">${icons[s.state]}</div>
        <div class="timeline-text">
          <p class="timeline-title">${s.title}</p>
          <p class="timeline-sub">${s.sub}</p>
        </div>
      </div>`).join("")}</div>`;
  document.getElementById("timeline-modal").classList.add("open");
};
window.closeTimeline = function() {
  document.getElementById("timeline-modal").classList.remove("open");
};

// ── MY SERVICES ───────────────────────────────────────
function renderManageServices() {
  const el = document.getElementById("services-manage"); if (!el) return;
  el.innerHTML = userServices.map((s,i)=>`
    <div class="manage-card">
      <div class="manage-card-info"><h3>${s.name}</h3><p>${s.type}</p></div>
      <button class="remove-btn" onclick="removeService(${i})">${t("remove")}</button>
    </div>`).join("");
}

window.removeService = async function(index) {
  userServices.splice(index,1);
  await saveUserServices();
  renderManageServices(); populateReportSelect(); renderOverview();
};

window.addCustomService = async function() {
  const name = document.getElementById("new-service-name").value.trim();
  const type = document.getElementById("new-service-type").value.trim();
  const fb   = document.getElementById("add-feedback");
  if (!name||!type) { fb.textContent=t("add_err"); fb.className="feedback error"; return; }
  userServices.push({ name, type, status:"operational", note:t("newly_added"), uptime:Array(30).fill("up") });
  await saveUserServices();
  document.getElementById("new-service-name").value="";
  document.getElementById("new-service-type").value="";
  fb.textContent=`✓ ${name} ${t("add_ok")}`; fb.className="feedback success";
  setTimeout(()=>{ fb.textContent=""; fb.className="feedback"; },3000);
  renderManageServices(); populateReportSelect(); renderOverview();
};

// ── LIVE LOGS ─────────────────────────────────────────
function startLiveLogs() {
  if (logsStarted) return;
  logsStarted = true;
  const logsRef = query(ref(db,"reports"), orderByChild("timestamp"), limitToLast(50));
  onValue(logsRef, snap => {
    const list    = document.getElementById("live-logs-list");
    const countEl = document.getElementById("logs-count");
    if (!list) return;
    const data = snap.val();
    if (!data) { list.innerHTML=`<div class="no-logs">${t("no_logs")}</div>`; if(countEl)countEl.textContent=""; return; }
    const reports = Object.entries(data).map(([id,val])=>({id,...val})).sort((a,b)=>b.timestamp-a.timestamp);
    if (countEl) countEl.textContent=`${reports.length} ${reports.length!==1?t("reports_counts"):t("reports_count")}`;
    list.innerHTML = reports.map((r,i)=>`
      <div class="log-card" style="animation-delay:${i*0.04}s">
        <div class="log-top">
          <div class="log-service">${r.service}</div>
          <div class="log-time">${timeAgo(r.timestamp)}</div>
        </div>
        <div class="log-type">${r.type}</div>
        <div class="log-desc">${r.desc}</div>
      </div>`).join("");
  });
}

function timeAgo(ts) {
  const d = Math.floor((Date.now()-ts)/1000);
  if (d<60)   return currentLang==="fr"?`${d}s`:`${d}s ago`;
  if (d<3600) return currentLang==="fr"?`${Math.floor(d/60)}min`:`${Math.floor(d/60)}m ago`;
  return currentLang==="fr"?`${Math.floor(d/3600)}h`:`${Math.floor(d/3600)}h ago`;
}