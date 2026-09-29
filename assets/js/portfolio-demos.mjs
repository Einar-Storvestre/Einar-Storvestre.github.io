// Browser-only walkthroughs with fictional fixtures. No network or storage access.
export const RADAR_LISTINGS = Object.freeze([
  { key: "strategy", title: "Strategy internship", company: "Example Advisory", source: "Campus board", decision: "keep", reason: "An internship in the selected field" },
  { key: "strategy", title: "Strategy internship", company: "Example Advisory", source: "Company website", decision: "keep", reason: "The same opportunity on another source" },
  { key: "analytics", title: "Business analytics internship", company: "Demo Analytics", source: "Job board", decision: "keep", reason: "The description covers analysis and business decisions" },
  { key: "unusual", title: "Inernship: business projects", company: "Sample Consulting", source: "Campus board", decision: "review", reason: "The title has a typo and the requirements need a closer look" },
  { key: "finance", title: "Finance internship", company: "Example Capital", source: "Company website", decision: "keep", reason: "An internship in the selected field" },
  { key: "retail", title: "Evening retail assistant", company: "Demo Retail", source: "Job board", decision: "outside", reason: "Outside this example's internship focus" },
].map(Object.freeze));

export function deduplicateListings(listings) {
  const found = new Map();
  for (const listing of listings) {
    if (!found.has(listing.key)) found.set(listing.key, { ...listing, sources: [] });
    const row = found.get(listing.key);
    if (!row.sources.includes(listing.source)) row.sources.push(listing.source);
  }
  return [...found.values()];
}

export function reviewListings(listings, unavailable = false) {
  return listings.map(row => ({
    ...row,
    decision: unavailable ? "review" : row.decision,
    reason: unavailable ? "Review unavailable: keep this listing visible for manual review" : row.reason,
  }));
}

export function deliverReport(listings, seen = [], fails = false) {
  const retained = listings.filter(row => row.decision !== "outside");
  return {
    delivered: !fails,
    count: retained.length,
    seen: fails ? [...seen] : [...new Set([...seen, ...retained.map(row => row.key)])],
  };
}

export const BOOKING_TIMES = Object.freeze({
  golf: [
    { id: "g1", label: "Thursday, 10:30", weather: true, calendar: true, available: true, detail: "Dry weather and a free calendar" },
    { id: "g2", label: "Thursday, 13:00", weather: false, calendar: true, available: true, detail: "Rain during the example round" },
    { id: "g3", label: "Friday, 11:00", weather: true, calendar: false, available: true, detail: "Overlaps a calendar event" },
    { id: "g4", label: "Saturday, 09:10", weather: true, calendar: true, available: true, detail: "Dry weather and a free calendar" },
  ],
  haircut: [
    { id: "h1", label: "Tuesday, 09:00", calendar: true, available: true, detail: "Available and clear in the calendar" },
    { id: "h2", label: "Tuesday, 11:30", calendar: false, available: true, detail: "Overlaps a calendar event" },
    { id: "h3", label: "Thursday, 15:00", calendar: true, available: false, detail: "Unavailable at the example salon" },
    { id: "h4", label: "Friday, 10:00", calendar: true, available: true, detail: "Available and clear in the calendar" },
  ],
});

export function bookingState(kind) {
  if (!BOOKING_TIMES[kind]) throw new Error("Unknown booking walkthrough");
  return { kind, status: "idle", selected: null, requests: 0, bookings: [], unavailable: [], message: "" };
}

export function eligibleTimes(state) {
  return BOOKING_TIMES[state.kind].filter(slot =>
    slot.available && slot.calendar && slot.weather !== false && !state.unavailable.includes(slot.id));
}

export function selectTime(state, id) {
  if (!["choosing", "selected", "unavailable"].includes(state.status)) return state;
  if (!eligibleTimes(state).some(slot => slot.id === id)) return state;
  return { ...state, selected: id, status: "selected", message: "" };
}

export function confirmBooking(state, outcome = "normal") {
  if (["booked", "uncertain"].includes(state.status)) {
    return { ...state, message: state.status === "booked"
      ? "Repeated confirmation ignored. The example still contains one booking."
      : "Repeated confirmation blocked. Check the uncertain outcome before trying again." };
  }
  if (state.status !== "selected" || !eligibleTimes(state).some(slot => slot.id === state.selected)) return state;
  if (outcome === "taken") {
    return { ...state, status: "unavailable", selected: null,
      requests: state.requests + (state.kind === "haircut" ? 1 : 0),
      unavailable: [...state.unavailable, state.selected],
      message: "That example time is no longer available. Choose another time and set a new example outcome." };
  }
  if (outcome === "uncertain") {
    return { ...state, status: "uncertain", requests: state.requests + 1,
      message: "The connection was interrupted after the request. The booking might exist. A manual check is required before another attempt." };
  }
  if (outcome !== "normal") throw new Error("Unknown example outcome");
  return { ...state, status: "booked", requests: state.requests + 1,
    bookings: [...state.bookings, state.selected],
    message: "Example booking confirmed. This walkthrough has recorded it in its temporary state." };
}

const escapeHTML = value => String(value).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const checked = value => value ? " checked" : "";
const disabled = value => value ? " disabled" : "";
const button = (action, label, off = false, secondary = false) =>
  '<button type="button" data-action="' + action + '" data-key="' + action +
  '" class="pd-button' + (secondary ? ' pd-secondary' : '') + '"' + disabled(off) + '>' + label + '</button>';
const steps = (labels, current) => '<ol class="pd-steps" aria-label="Walkthrough progress">' +
  labels.map((label, i) => '<li class="' + (i < current ? "pd-complete" : "") + '"' +
  (i === current ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span>' + label + '</li>').join("") + '</ol>';

function paint(root, content) {
  const key = root.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  root.innerHTML = content;
  if (key) {
    const target = root.querySelector('[data-key="' + key + '"]');
    if (target && !target.disabled) target.focus({ preventScroll: true });
    else root.querySelector('[role="status"]')?.focus({ preventScroll: true });
  }
}

function radarDemo(root) {
  const fresh = () => ({ stage: 0, aiFails: false, deliveryFails: false, rows: [], seen: [], delivery: null });
  let state = fresh();
  function render() {
    const labels = ["Collect", "Deduplicate", "Review", "Deliver"];
    const states = { keep: "Relevant", review: "Manual review", outside: "Outside focus" };
    const aiId = root.id + "-ai", deliveryId = root.id + "-delivery";
    let message = "Start with fictional listings collected from different example sources.";
    if (state.stage === 1) message = state.rows.length + " listings collected. One opportunity appears on two sources.";
    if (state.stage === 2) message = state.rows.length + " unique opportunities. The original source names are retained.";
    if (state.stage === 3) message = state.aiFails
      ? "The simulated review failed. Every unique listing remains visible for manual review."
      : "The example review separates relevant, uncertain and outside-focus listings.";
    if (state.delivery) message = state.delivery.delivered
      ? "Demo delivery succeeded. Only the delivered opportunities are now marked as seen."
      : "Demo delivery failed. Nothing is marked as seen, so the report can be tried again.";
    const rows = state.rows.map(row => '<li class="pd-listing"><div class="pd-listing-top"><strong>' +
      escapeHTML(row.title) + '</strong>' + (state.stage >= 3 ? '<span class="pd-pill pd-' + row.decision + '">' +
      states[row.decision] + '</span>' : '') + '</div><span class="pd-muted">' + escapeHTML(row.company) + ' · ' +
      escapeHTML(row.sources ? row.sources.join(" + ") : row.source) + '</span>' +
      (state.stage >= 3 ? '<p>' + escapeHTML(row.reason) + '</p>' : '') + '</li>').join("");
    paint(root, '<p class="pd-eyebrow">Interactive walkthrough · example data</p>' +
      '<p class="pd-intro">All listings are fictional. Review decisions are preset for this walkthrough; no AI model or email service is called.</p>' +
      steps(labels, state.stage) +
      '<div class="pd-controls"><label for="' + aiId + '"><input id="' + aiId +
      '" type="checkbox" data-field="ai" data-key="ai"' + checked(state.aiFails) + disabled(state.stage >= 3) +
      '> Simulate review failure</label><label for="' + deliveryId + '"><input id="' + deliveryId +
      '" type="checkbox" data-field="delivery" data-key="delivery"' + checked(state.deliveryFails) +
      disabled(state.stage !== 3) + '> Simulate delivery failure</label></div>' +
      '<div class="pd-message" role="status" tabindex="-1">' + message + '</div>' +
      (rows ? '<ul class="pd-listings" tabindex="0" aria-label="Example opportunities">' + rows + '</ul>' : '') +
      '<div class="pd-footer"><span class="pd-counter">Marked as seen: <strong>' + state.seen.length + '</strong></span><div class="pd-actions">' +
      button("advance", ["Collect example listings", "Remove duplicates", "Review example matches", "Deliver demo report", "Demo complete"][state.stage], state.stage === 4) +
      button("reset", "Reset", false, true) + '</div></div>');
  }
  root.addEventListener("change", event => {
    if (event.target.dataset.field === "ai" && state.stage < 3) state.aiFails = event.target.checked;
    if (event.target.dataset.field === "delivery" && state.stage === 3) state.deliveryFails = event.target.checked;
  });
  root.addEventListener("click", event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "reset") state = fresh();
    else if (action === "advance" && state.stage < 4) {
      if (state.stage === 0) { state.rows = RADAR_LISTINGS.map(row => ({ ...row })); state.stage = 1; }
      else if (state.stage === 1) { state.rows = deduplicateListings(state.rows); state.stage = 2; }
      else if (state.stage === 2) { state.rows = reviewListings(state.rows, state.aiFails); state.stage = 3; }
      else {
        state.delivery = deliverReport(state.rows, state.seen, state.deliveryFails);
        state.seen = state.delivery.seen;
        if (state.delivery.delivered) state.stage = 4;
      }
    } else return;
    render();
  });
  render();
}

function bookingDemo(root, kind) {
  let state = bookingState(kind);
  let outcome = "normal";
  function render() {
    const terminal = ["booked", "uncertain"].includes(state.status);
    const phase = { idle: 0, choosing: 1, unavailable: 1, selected: 2, uncertain: 3, booked: 4 }[state.status];
    const valid = eligibleTimes(state).map(slot => slot.id);
    const selected = BOOKING_TIMES[kind].find(slot => slot.id === state.selected);
    const message = state.message || (state.status === "idle"
      ? "Find times in a fictional schedule, then choose one to continue."
      : state.status === "selected" ? "Selected: " + selected.label + ". A choice alone does not create a booking."
      : "Choose a suitable example time. Blocked times explain why they were excluded.");
    const options = state.status === "idle" ? "" : '<fieldset class="pd-options"><legend>Example times</legend>' +
      BOOKING_TIMES[kind].map(slot => {
        const allowed = valid.includes(slot.id);
        return '<label class="pd-time' + (allowed ? '' : ' pd-blocked') + '"><input type="radio" name="' +
          root.id + '-time" data-field="time" data-key="time-' + slot.id + '" value="' + slot.id + '"' +
          checked(state.selected === slot.id) + disabled(!allowed || terminal) + '><span><strong>' +
          slot.label + '</strong><span class="pd-muted">' + (state.unavailable.includes(slot.id) ? "Taken since the original suggestion" : slot.detail) +
          '</span></span><span class="pd-pill">' + (allowed ? "Suitable" : "Excluded") + '</span></label>';
      }).join("") + '</fieldset>';
    const outcomeId = root.id + "-outcome";
    paint(root, '<p class="pd-eyebrow">Interactive walkthrough · example data</p>' +
      '<p class="pd-intro">Times, weather, calendar entries and outcomes are fictional. This walkthrough does not send messages or create real bookings.</p>' +
      steps(["Find", "Choose", "Confirm", "Check result"], phase) +
      '<div class="pd-message" role="status" tabindex="-1">' + escapeHTML(message) + '</div>' +
      options + '<div class="pd-controls"><label for="' + outcomeId + '">Example outcome</label><select id="' +
      outcomeId + '" data-field="outcome" data-key="outcome"' + disabled(terminal) + '>' +
      [["normal", "Booking confirmed"], ["taken", "Time is taken"], ["uncertain", "Connection is interrupted"]].map(([value, label]) =>
        '<option value="' + value + '"' + (outcome === value ? " selected" : "") + '>' + label + '</option>').join("") +
      '</select></div><div class="pd-footer"><div class="pd-counters"><span class="pd-counter">Demo requests: <strong>' +
      state.requests + '</strong></span><span class="pd-counter">Confirmed: <strong>' + state.bookings.length +
      '</strong></span></div><div class="pd-actions">' +
      (state.status === "idle" ? button("find", "Find example times")
        : terminal ? button("repeat", "Repeat confirmation")
        : button("confirm", "Confirm example booking", state.status !== "selected")) +
      button("reset", "Reset", false, true) + '</div></div>');
  }
  root.addEventListener("change", event => {
    if (event.target.dataset.field === "outcome" && !["booked", "uncertain"].includes(state.status)) {
      outcome = event.target.value;
    }
    if (event.target.dataset.field === "time") {
      state = selectTime(state, event.target.value);
      render();
    }
  });
  root.addEventListener("click", event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "reset") { state = bookingState(kind); outcome = "normal"; }
    else if (action === "find" && state.status === "idle") state = { ...state, status: "choosing" };
    else if (action === "confirm" || action === "repeat") state = confirmBooking(state, outcome);
    else return;
    render();
  });
  render();
}

if (typeof document !== "undefined") {
  for (const root of document.querySelectorAll("[data-portfolio-demo]")) {
    if (root.dataset.initialized) continue;
    root.dataset.initialized = "true";
    if (root.dataset.portfolioDemo === "radar") radarDemo(root);
    else if (BOOKING_TIMES[root.dataset.portfolioDemo]) bookingDemo(root, root.dataset.portfolioDemo);
  }
}
