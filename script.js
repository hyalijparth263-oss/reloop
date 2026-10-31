// ==========================================================================
// ReLoop Application — Spotify-Inspired Circular Plastic Platform
// Supabase-Backed Live Integration with Multi-Role Registration & Custom Themes
// ==========================================================================

const SUPABASE_URL = "https://fcswufaooqzxdvlouxbf.supabase.co";
const SUPABASE_KEY = "sb_publishable_8zBNJE9qDQ6IXMyFNawpWQ_C7gdPx-i";
const PICKUP_KG = 20, MILESTONE_KG = 30, POINTS = 100;
const SPOTIFY_DEFAULT_COLOR = "#1ed760";

let db = null;
let user = null;
let profile = null;
let roleChoice = "customer";
let authMode = "login"; // "login" | "register"
let queue = [];
let historyStack = ["homeScreen"];
let historyIndex = 0;

// DOM Helpers
const $ = id => document.getElementById(id);
const kg = r => Number(r.weight_per_item || 0) * Number(r.quantity || 0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dt = s => s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

function msg(id, text, kind = "") {
    const e = $(id);
    if (e) {
        e.textContent = text;
        e.className = "status-message " + kind;
    }
}

function showError(id, error) {
    msg(id, error?.message || String(error), "error");
}

function requireDatabase() {
    if (!db) {
        alert("Database connection is initializing. Please verify your internet connection.");
        return false;
    }
    return true;
}

function roleLabel(r) {
    return ({
        customer: "Customer",
        collection_center: "Collection Centre",
        company: "Company Recycler"
    })[r] || r;
}

// ==========================================================================
// THEME MANAGEMENT ENGINE (Default: Spotify Green, Custom Color Support)
// ==========================================================================

function hexToRgb(hex) {
    let c = hex.replace("#", "").trim();
    if (c.length === 3) c = c.split("").map(x => x + x).join("");
    const num = parseInt(c, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function adjustColorBrightness(hex, percent) {
    const { r, g, b } = hexToRgb(hex);
    const adjust = val => Math.min(255, Math.max(0, Math.round(val + (val * percent / 100))));
    const toHex = val => val.toString(16).padStart(2, "0");
    return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

function applyTheme(hex) {
    if (!hex) return;
    hex = hex.trim();
    if (!hex.startsWith("#")) hex = "#" + hex;
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex) && !/^#[0-9A-Fa-f]{3}$/.test(hex)) return;

    const { r, g, b } = hexToRgb(hex);
    const hover = adjustColorBrightness(hex, 12);
    const active = adjustColorBrightness(hex, -15);
    const dim = `rgba(${r}, ${g}, ${b}, 0.15)`;
    const border = `rgba(${r}, ${g}, ${b}, 0.3)`;
    const glow = `0 0 16px rgba(${r}, ${g}, ${b}, 0.4)`;

    const root = document.documentElement;
    root.style.setProperty("--accent", hex);
    root.style.setProperty("--accent-hover", hover);
    root.style.setProperty("--accent-active", active);
    root.style.setProperty("--accent-dim", dim);
    root.style.setProperty("--accent-border", border);
    root.style.setProperty("--accent-glow", glow);

    // Update Theme Picker UI Elements
    document.querySelectorAll(".theme-preset-btn").forEach(btn => {
        const btnColor = btn.dataset.color || "";
        btn.classList.toggle("active", btnColor.toLowerCase() === hex.toLowerCase());
    });

    if ($("themeDotIndicator")) {
        $("themeDotIndicator").style.backgroundColor = hex;
        $("themeDotIndicator").style.boxShadow = `0 0 8px ${hex}`;
    }
    if ($("customColorPicker")) $("customColorPicker").value = hex;
    if ($("customColorHex")) $("customColorHex").value = hex;

    localStorage.setItem("reloop_theme_accent", hex);
}

function resetDefaultTheme() {
    applyTheme(SPOTIFY_DEFAULT_COLOR);
    localStorage.removeItem("reloop_theme_accent");
}

function toggleThemeMenu() {
    const menu = $("themeMenu");
    if (menu) menu.classList.toggle("hidden");
}

function initTheme() {
    const saved = localStorage.getItem("reloop_theme_accent");
    applyTheme(saved || SPOTIFY_DEFAULT_COLOR);

    // Close menu when clicking outside
    document.addEventListener("click", e => {
        if (!e.target.closest(".theme-dropdown-container")) {
            $("themeMenu")?.classList.add("hidden");
        }
    });
}

// ==========================================================================
// COLLAPSIBLE SIDEBAR & NAVIGATION STATE
// ==========================================================================

function toggleSidebarCollapse() {
    const sidebar = $("sidebar");
    if (!sidebar) return;
    sidebar.classList.toggle("collapsed");
    const isCollapsed = sidebar.classList.contains("collapsed");
    localStorage.setItem("reloop_sidebar_collapsed", isCollapsed ? "1" : "0");
}

function initSidebarState() {
    const saved = localStorage.getItem("reloop_sidebar_collapsed");
    if (saved === "1") {
        $("sidebar")?.classList.add("collapsed");
    }
}

function toggleSidebar() {
    $("sidebar")?.classList.toggle("open");
}

function screen(id, pushToHistory = true) {
    document.querySelectorAll(".screen").forEach(x => x.classList.add("hidden"));
    const target = $(id);
    if (!target) {
        console.error("Screen not found:", id);
        return;
    }
    target.classList.remove("hidden");

    // Update active nav button
    document.querySelectorAll(".nav").forEach(x => x.classList.remove("active"));
    const navMap = {
        homeScreen: "navHome",
        customerScreen: "navCustomer",
        collectionScreen: "navCentre",
        companyScreen: "navCompany",
        analyticsScreen: "navAnalytics",
        aboutScreen: "navAbout"
    };
    const navId = navMap[id];
    if (navId && $(navId)) $(navId).classList.add("active");

    // Update Topbar Breadcrumb
    const pageMap = {
        homeScreen: "Home",
        authScreen: "Account Access",
        customerScreen: "Customer Workspace",
        trackingScreen: "Return Journey Tracker",
        collectionScreen: "Collection Centre Depot",
        companyScreen: "Industrial Recovery Portal",
        analyticsScreen: "ESG & Recovery Analytics",
        aboutScreen: "About the Ecosystem"
    };
    if ($("topbarPage")) $("topbarPage").textContent = pageMap[id] || "ReLoop";

    // Manage History Stack
    if (pushToHistory) {
        if (historyStack[historyIndex] !== id) {
            historyStack = historyStack.slice(0, historyIndex + 1);
            historyStack.push(id);
            historyIndex = historyStack.length - 1;
        }
    }

    // Close mobile sidebar
    $("sidebar")?.classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function historyBack() {
    if (historyIndex > 0) {
        historyIndex--;
        screen(historyStack[historyIndex], false);
    }
}

function historyForward() {
    if (historyIndex < historyStack.length - 1) {
        historyIndex++;
        screen(historyStack[historyIndex], false);
    }
}

function goHome() { screen("homeScreen"); }
function showAbout() { screen("aboutScreen"); }

// Topbar & Sidebar Profile Sync
function updateSide() {
    const role = profile?.role;
    const name = profile?.full_name || (user?.email ? user.email.split("@")[0] : "Guest User");
    const initial = (name || "R").trim().charAt(0).toUpperCase();

    // Show/hide company-exclusive navigation
    if ($("navAnalytics")) $("navAnalytics").hidden = (role !== "company");
    if ($("logoutBtn")) $("logoutBtn").hidden = !user;

    // Sidebar Profile
    if ($("sidebarUser")) $("sidebarUser").textContent = name;
    if ($("signedInAs")) {
        $("signedInAs").textContent = user ? `${roleLabel(role)}` : "Sign in / Register";
    }
    if ($("profileAvatar")) $("profileAvatar").textContent = initial;

    // Topbar Profile
    if ($("topbarUser")) $("topbarUser").textContent = user ? name : "Sign In / Register";
    if ($("topbarAvatar")) $("topbarAvatar").textContent = initial;
}

function handleProfileClick() {
    if (user) {
        if (confirm(`Signed in as ${user.email} (${roleLabel(profile?.role)}). Do you want to sign out?`)) {
            logout();
        }
    } else {
        openRoleLogin(roleChoice || "customer");
    }
}

// ==========================================================================
// MULTI-ROLE AUTHENTICATION ENGINE (CUSTOMER / CENTRE / COMPANY)
// ==========================================================================

function selectAuthRole(role) {
    roleChoice = role;

    // Update active tab styles
    $("roleTabCustomer")?.classList.toggle("active", role === "customer");
    $("roleTabCentre")?.classList.toggle("active", role === "collection_center");
    $("roleTabCompany")?.classList.toggle("active", role === "company");

    // Dynamic field labels & placeholders based on chosen role
    const nameFieldLabel = $("nameFieldLabel");
    const authName = $("authName");
    const extraField = $("extraField");
    const extraFieldLabel = $("extraFieldLabel");
    const authExtra = $("authExtra");

    if (role === "customer") {
        if (nameFieldLabel) nameFieldLabel.textContent = "Full Name";
        if (authName) authName.placeholder = "e.g. Parth Sharma";
        if (extraField) extraField.classList.add("hidden");
    } else if (role === "collection_center") {
        if (nameFieldLabel) nameFieldLabel.textContent = "Collection Hub / Depot Name";
        if (authName) authName.placeholder = "e.g. Zeal College Collection Hub";
        if (extraFieldLabel) extraFieldLabel.textContent = "Facility Location & City";
        if (authExtra) authExtra.placeholder = "e.g. Narhe Campus, Pune";
        if (extraField) extraField.classList.toggle("hidden", authMode === "login");
    } else if (role === "company") {
        if (nameFieldLabel) nameFieldLabel.textContent = "Company / Recycler Name";
        if (authName) authName.placeholder = "e.g. Pune Circular Polymers Ltd.";
        if (extraFieldLabel) extraFieldLabel.textContent = "Recycling Plant & MIDC Area";
        if (authExtra) authExtra.placeholder = "e.g. Bhosari Industrial Zone, Pune";
        if (extraField) extraField.classList.toggle("hidden", authMode === "login");
    }

    // Dynamic heading text
    const actionText = authMode === "login" ? "Sign In" : "Create Account";
    if ($("authHeading")) $("authHeading").textContent = `${roleLabel(role)} ${actionText}`;

    if ($("authDescription")) {
        if (authMode === "login") {
            $("authDescription").textContent = `Enter your credentials to enter your ${roleLabel(role)} portal.`;
        } else {
            $("authDescription").textContent = `Register your new verified ${roleLabel(role)} account in the circular recovery network.`;
        }
    }

    msg("authMessage", "");
}

function setAuthMode(mode) {
    authMode = mode;

    $("modeBtnLogin")?.classList.toggle("active", mode === "login");
    $("modeBtnRegister")?.classList.toggle("active", mode === "register");

    const isRegister = (mode === "register");
    $("nameField")?.classList.toggle("hidden", !isRegister);

    // Show extra field for Centre and Company in registration mode
    if ($("extraField")) {
        $("extraField").classList.toggle("hidden", !isRegister || roleChoice === "customer");
    }

    if ($("authSubmitText")) {
        $("authSubmitText").textContent = isRegister ? "Create Account" : "Sign In";
    }

    if ($("authSwitchText")) {
        $("authSwitchText").textContent = isRegister ? "Already have an account?" : "Don't have an account yet?";
    }

    if ($("authSwitchLink")) {
        $("authSwitchLink").textContent = isRegister ? "Sign in here" : "Create one here";
    }

    selectAuthRole(roleChoice);
}

function toggleAuthMode() {
    setAuthMode(authMode === "login" ? "register" : "login");
}

function openRoleLogin(role = "customer") {
    roleChoice = role;
    selectAuthRole(role);
    setAuthMode("login");

    if ($("authName")) $("authName").value = "";
    if ($("authExtra")) $("authExtra").value = "";
    if ($("authEmail")) $("authEmail").value = "";
    if ($("authPassword")) $("authPassword").value = "";
    msg("authMessage", "");

    screen("authScreen");
}

async function openWorkspace(role) {
    roleChoice = role;
    if (user && profile?.role === role) {
        await dashboard(role);
        return;
    }
    openRoleLogin(role);
}

async function handleAuthSubmit() {
    if (authMode === "login") {
        await login();
    } else {
        await registerUser();
    }
}

async function getProfile(u) {
    const { data, error } = await db.from("profiles").select("id,full_name,role,reward_points").eq("id", u.id).single();
    if (error) throw error;
    user = u;
    profile = data;
    updateSide();
    return data;
}

async function registerUser() {
    if (!requireDatabase()) return;

    const name = $("authName")?.value.trim() || "";
    const extra = $("authExtra")?.value.trim() || "";
    const email = $("authEmail")?.value.trim() || "";
    const password = $("authPassword")?.value || "";

    if (!name) {
        const promptLabel = roleChoice === "customer" ? "your full name" : "your organization/facility name";
        msg("authMessage", `Please enter ${promptLabel}.`, "error");
        return;
    }
    if (!email || !email.includes("@")) {
        msg("authMessage", "Please enter a valid email address.", "error");
        return;
    }
    if (password.length < 6) {
        msg("authMessage", "Password must be at least 6 characters.", "error");
        return;
    }

    msg("authMessage", `Registering ${roleLabel(roleChoice)} account…`);

    try {
        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                    role: roleChoice,
                    facility_location: extra
                }
            }
        });

        if (error) throw error;

        // Ensure profile row has the selected role in profiles table
        if (data.user) {
            try {
                await db.from("profiles").upsert({
                    id: data.user.id,
                    full_name: name,
                    role: roleChoice,
                    reward_points: 0
                }, { onConflict: "id" });
            } catch (upsertErr) {
                console.warn("Notice: profiles upsert:", upsertErr);
            }
        }

        if (data.session) {
            msg("authMessage", `Account created successfully! Entering ${roleLabel(roleChoice)} portal…`, "success");
            setTimeout(async () => {
                await getProfile(data.session.user);
                await dashboard(roleChoice);
            }, 600);
        } else {
            msg("authMessage", `Account created for ${roleLabel(roleChoice)}. If email verification is enabled, please verify your email before signing in.`, "success");
            setTimeout(() => {
                setAuthMode("login");
            }, 2500);
        }
    } catch (err) {
        showError("authMessage", err);
    }
}

async function login() {
    if (!requireDatabase()) return;
    const email = $("authEmail")?.value.trim() || "";
    const password = $("authPassword")?.value || "";

    if (!email || !password) {
        msg("authMessage", "Please enter your email and password.", "error");
        return;
    }

    msg("authMessage", "Verifying credentials…");
    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const p = await getProfile(data.user);
        if (p.role !== roleChoice) {
            await db.auth.signOut();
            user = null;
            profile = null;
            updateSide();
            throw Error(`This account is registered as ${roleLabel(p.role)}, not ${roleLabel(roleChoice)}. Please switch tabs above to sign in.`);
        }

        msg("authMessage", `Welcome back! Opening ${roleLabel(p.role)} workspace…`, "success");
        setTimeout(async () => {
            await dashboard(p.role);
        }, 500);
    } catch (e) {
        msg("authMessage", e.message, "error");
    }
}

async function logout() {
    if (!requireDatabase()) return;
    const { error } = await db.auth.signOut();
    if (error) {
        alert(error.message);
        return;
    }
    user = null;
    profile = null;
    queue = [];
    updateSide();
    goHome();
}

async function requireRole(role) {
    if (!requireDatabase()) return false;
    const { data: { user: u }, error } = await db.auth.getUser();
    if (error) {
        alert(error.message);
        return false;
    }
    if (!u) {
        openRoleLogin(role);
        msg("authMessage", "Please sign in to access this workspace.", "error");
        return false;
    }
    try {
        const p = await getProfile(u);
        if (p.role !== role) {
            throw Error(`This account requires ${roleLabel(role)} credentials.`);
        }
        return true;
    } catch (e) {
        alert(e.message);
        return false;
    }
}

async function dashboard(role) {
    if (role === "customer") {
        screen("customerScreen");
        await loadCustomerReturns();
        await loadRewards();
    } else if (role === "collection_center") {
        screen("collectionScreen");
        await loadCentreReturns();
    } else if (role === "company") {
        screen("companyScreen");
        await loadCompany();
    } else {
        goHome();
    }
}

async function showCustomer() {
    if (await requireRole("customer")) {
        screen("customerScreen");
        await loadCustomerReturns();
        await loadRewards();
    }
}

async function showCentre() {
    if (await requireRole("collection_center")) {
        screen("collectionScreen");
        await loadCentreReturns();
    }
}

async function showCompany() {
    if (await requireRole("company")) {
        screen("companyScreen");
        await loadCompany();
    }
}

// ==========================================================================
// CUSTOMER ACTIONS & CATALOG QUICK-FILL
// ==========================================================================

function calc() {
    const w = Number($("weight")?.value || 0);
    const q = Number($("quantity")?.value || 0);
    const total = (w * q).toFixed(2);
    if ($("calcWeight")) $("calcWeight").textContent = `${total} KG`;
}

async function quickFillReturn(productName, companyName, weight, qty) {
    if (!user) {
        roleChoice = "customer";
        openRoleLogin("customer");
        msg("authMessage", `Sign in to quick-submit ${productName}`, "info");
        return;
    }

    if (profile?.role !== "customer") {
        alert(`You are currently signed in as ${roleLabel(profile?.role)}. Please switch to a Customer account.`);
        return;
    }

    screen("customerScreen");
    if ($("productName")) $("productName").value = productName;
    if ($("companyName")) $("companyName").value = companyName;
    if ($("weight")) $("weight").value = weight;
    if ($("quantity")) $("quantity").value = qty;
    calc();

    $("productName")?.focus();
}

function quickSelectCenter(centerName) {
    if ($("collectionCenter")) {
        $("collectionCenter").value = centerName;
    }
    if (user && profile?.role === "customer") {
        screen("customerScreen");
    } else if (user && profile?.role === "collection_center") {
        screen("collectionScreen");
    } else {
        openWorkspace("customer");
    }
}

async function submitReturn() {
    if (!(await requireRole("customer"))) return;

    const product_name = $("productName").value.trim();
    const company_name = $("companyName").value.trim();
    const weight_per_item = Number($("weight").value);
    const quantity = Number($("quantity").value);
    const collection_center = $("collectionCenter").value;

    if (!product_name || !company_name || !Number.isFinite(weight_per_item) || weight_per_item <= 0 || !Number.isInteger(quantity) || quantity < 1) {
        msg("returnMessage", "Please enter product name, company, valid weight per unit (>0), and whole number quantity.", "error");
        return;
    }

    msg("returnMessage", "Transmitting plastic return…");
    const { data, error } = await db.from("returns").insert({
        customer_id: user.id,
        product_name,
        company_name,
        weight_per_item,
        quantity,
        collection_center,
        status: "Return Requested"
    }).select("id").single();

    if (error) {
        showError("returnMessage", error);
        return;
    }

    $("productName").value = "";
    $("companyName").value = "";
    $("weight").value = "";
    $("quantity").value = "";
    calc();

    msg("returnMessage", `Return submitted! Return ID: ${data.id}`, "success");
    await loadCustomerReturns();
}

function statusTagClass(status) {
    if (status === "Received by Company") return "status-live";
    if (status === "In Transit") return "status-pending";
    return "status-pending";
}

async function loadCustomerReturns() {
    if (!(await requireRole("customer"))) return;

    const { data, error } = await db.from("returns")
        .select("*")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

    const box = $("historyList");
    if (error) {
        box.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
        return;
    }

    if (!data?.length) {
        box.innerHTML = '<div class="empty-state">No plastic returns submitted yet. Use the form on the left to start!</div>';
        return;
    }

    box.innerHTML = data.map(r => `
        <article class="record">
            <div class="record-header-row">
                <h3>${esc(r.product_name)}</h3>
                <span class="status-tag ${statusTagClass(r.status)}">${esc(r.status)}</span>
            </div>
            <p><strong>${esc(r.company_name)}</strong> · ${kg(r).toFixed(2)} KG (${r.quantity} × ${r.weight_per_item} KG) · ${dt(r.created_at)}</p>
            <p class="record-meta-id">ID: ${esc(r.id)} · ${esc(r.collection_center)}</p>
            <div class="record-actions">
                <button class="btn-mini" onclick="openTracking('${esc(r.id)}')">View Journey ↗</button>
            </div>
        </article>
    `).join("");
}

async function loadRewards() {
    if (!(await requireRole("customer"))) return;

    const { data: p, error: pe } = await db.from("profiles").select("reward_points").eq("id", user.id).single();
    const points = Number(p?.reward_points || 0);
    if ($("rewardPoints")) $("rewardPoints").textContent = points;

    const { data, error: re } = await db.from("returns").select("weight_per_item,quantity,status").eq("customer_id", user.id);
    if (re) {
        msg("rewardText", re.message, "error");
        return;
    }

    const received = (data || []).filter(r => r.status === "Received by Company").reduce((s, r) => s + kg(r), 0);
    const progress = received % MILESTONE_KG;
    const pct = Math.min(100, (progress / MILESTONE_KG) * 100);

    if ($("rewardProgress")) $("rewardProgress").style.width = `${pct}%`;
    if ($("rewardText")) {
        $("rewardText").textContent = `${progress.toFixed(2)} / ${MILESTONE_KG} KG towards next 100-point milestone · ${received.toFixed(2)} KG confirmed overall`;
    }

    const { data: history, error: he } = await db.from("reward_transactions")
        .select("points,description,created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);

    if ($("rewardHistory")) {
        $("rewardHistory").innerHTML = he
            ? "Milestone transactions will appear as recovery batches are received."
            : history?.length
                ? history.map(x => `+${x.points} pts: ${esc(x.description)} (${dt(x.created_at)})`).join("<br>")
                : "No reward milestone credits yet. Returns must be received by company to trigger points.";
    }
}

// ==========================================================================
// TRACKING
// ==========================================================================

function showTracking() {
    screen("trackingScreen");
    if ($("trackingId")) $("trackingId").value = "";
    if ($("trackingResult")) $("trackingResult").innerHTML = "";
}

function openTracking(id) {
    screen("trackingScreen");
    if ($("trackingId")) $("trackingId").value = id;
    trackReturn();
}

async function trackReturn() {
    const id = $("trackingId").value.trim();
    if (!id) {
        $("trackingResult").innerHTML = '<div class="empty-state">Please enter or paste a valid Return ID.</div>';
        return;
    }

    const { data, error } = await db.from("returns").select("*").eq("id", id).single();
    if (error || !data) {
        $("trackingResult").innerHTML = '<div class="empty-state">Return ID not found. Verify the ID or check if it was entered correctly.</div>';
        return;
    }

    const stages = [
        { name: "Return Requested", desc: "Submitted by citizen at collection center" },
        { name: "Pickup Requested", desc: "Aggregated into 20 KG batch ready for transport" },
        { name: "In Transit", desc: "Consignment dispatched via logistics partner" },
        { name: "Received by Company", desc: "Verified at circular recycling facility" }
    ];

    const currentIdx = stages.findIndex(s => s.name === data.status);

    $("trackingResult").innerHTML = `
        <div class="record" style="margin-top: 14px;">
            <div class="record-header-row">
                <h3>${esc(data.product_name)}</h3>
                <span class="status-tag ${statusTagClass(data.status)}">${esc(data.status)}</span>
            </div>
            <p><strong>Brand:</strong> ${esc(data.company_name)} | <strong>Weight:</strong> ${kg(data).toFixed(2)} KG | <strong>Center:</strong> ${esc(data.collection_center)}</p>
            <p class="record-meta-id">Return ID: ${esc(data.id)} · Submitted on ${dt(data.created_at)}</p>

            <div class="tracking-steps">
                ${stages.map((s, idx) => {
                    const isDone = (idx <= currentIdx);
                    return `
                        <div class="track-step ${isDone ? 'done' : ''}">
                            <div class="track-step-circle">${isDone ? '✓' : (idx + 1)}</div>
                            <div>
                                <strong style="display:block; color:${isDone ? 'var(--accent)' : '#ffffff'};">${s.name}</strong>
                                <small style="color:${isDone ? 'var(--text-secondary)' : '#71717a'};">${s.desc}</small>
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        </div>
    `;
}

// ==========================================================================
// COLLECTION CENTRE WORKSPACE
// ==========================================================================

async function loadCentreReturns() {
    if (!(await requireRole("collection_center"))) return;

    const { data, error } = await db.from("returns")
        .select("*")
        .eq("status", "Return Requested")
        .order("created_at");

    if (error) {
        $("centreRecords").innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
        return;
    }

    queue = data || [];
    const total = queue.reduce((s, r) => s + kg(r), 0);
    const eligible = total >= PICKUP_KG;

    $("centreWeight").textContent = total.toFixed(2);
    $("centreCount").textContent = queue.length;

    const pickupBtn = $("pickupBtn");
    if (pickupBtn) {
        pickupBtn.classList.toggle("hidden", !eligible);
        pickupBtn.disabled = !eligible;
    }

    msg("centreMessage", eligible
        ? `20 KG Threshold Achieved (${total.toFixed(2)} KG). You can dispatch this batch to partner recyclers.`
        : `Current batch queue is ${(PICKUP_KG - total).toFixed(2)} KG away from the 20 KG pickup dispatch threshold.`
    );

    $("centreRecords").innerHTML = queue.length ? queue.map(r => `
        <article class="record">
            <div class="record-header-row">
                <h3>${esc(r.product_name)}</h3>
                <span class="status-tag status-pending">${kg(r).toFixed(2)} KG</span>
            </div>
            <p>${esc(r.company_name)} · ${esc(r.collection_center)} · ${dt(r.created_at)}</p>
            <p class="record-meta-id">ID: ${esc(r.id)}</p>
        </article>
    `).join("") : '<div class="empty-state">No individual returns currently pending aggregation.</div>';

    const { data: pickups, error: pe } = await db.from("pickup_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);

    $("centrePickups").innerHTML = pe
        ? `<div class="empty-state">${esc(pe.message)}</div>`
        : pickups?.length ? pickups.map(p => `
            <article class="record">
                <div class="record-header-row">
                    <h3>${esc(p.company_name)} Batch</h3>
                    <span class="status-tag ${statusTagClass(p.status)}">${esc(p.status)}</span>
                </div>
                <p><strong>Weight:</strong> ${Number(p.total_weight || 0).toFixed(2)} KG · <strong>Center:</strong> ${esc(p.collection_center)}</p>
                <p class="record-meta-id">Batch ID: ${esc(p.id)} · Logged on ${dt(p.created_at)}</p>
            </article>
        `).join("") : '<div class="empty-state">No batches dispatched yet.</div>';
}

async function requestPickup() {
    if (!(await requireRole("collection_center"))) return;

    const total = queue.reduce((s, r) => s + kg(r), 0);
    const companies = [...new Set(queue.map(r => r.company_name))];
    const centres = [...new Set(queue.map(r => r.collection_center))];

    if (total < PICKUP_KG) {
        msg("centreMessage", `Minimum of 20 KG required. Current: ${total.toFixed(2)} KG`, "error");
        return;
    }

    if (companies.length !== 1 || centres.length !== 1) {
        msg("centreMessage", "Batches must contain homogeneous items from one company and one collection center. Please filter out mixed records.", "error");
        return;
    }

    const ids = queue.map(r => r.id);
    msg("centreMessage", "Creating consolidated pickup request…");

    const { data: p, error } = await db.from("pickup_requests").insert({
        collection_center: centres[0],
        company_name: companies[0],
        status: "Pickup Requested",
        return_ids: ids,
        total_weight: total
    }).select().single();

    if (error) {
        showError("centreMessage", error);
        return;
    }

    const { error: e } = await db.from("returns").update({ status: "Pickup Requested" }).in("id", ids);
    if (e) {
        msg("centreMessage", "Batch created, but individual returns could not be updated: " + e.message, "error");
        return;
    }

    msg("centreMessage", `Pickup batch successfully registered! Batch ID: ${p.id}`, "success");
    await loadCentreReturns();
}

// ==========================================================================
// COMPANY WORKSPACE
// ==========================================================================

async function loadCompany() {
    if (!(await requireRole("company"))) return;

    const { data, error } = await db.from("pickup_requests").select("*").order("created_at", { ascending: false });
    if (error) {
        $("companyPickups").innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
        return;
    }

    const pickups = data || [];
    $("companyCount").textContent = pickups.length;
    $("companyPending").textContent = pickups.filter(x => ["Pickup Requested", "In Transit"].includes(x.status)).length;

    const receivedTotal = pickups
        .filter(x => x.status === "Received by Company")
        .reduce((s, x) => s + Number(x.total_weight || 0), 0);
    $("companyReceived").textContent = receivedTotal.toFixed(2);

    $("companyPickups").innerHTML = pickups.length ? pickups.map(x => `
        <article class="record">
            <div class="record-header-row">
                <h3>${esc(x.company_name)} Consignment</h3>
                <span class="status-tag ${statusTagClass(x.status)}">${esc(x.status)}</span>
            </div>
            <p><strong>Origin:</strong> ${esc(x.collection_center)} · <strong>Total Batch:</strong> ${Number(x.total_weight || 0).toFixed(2)} KG</p>
            <p class="record-meta-id">Batch ID: ${esc(x.id)} · Created ${dt(x.created_at)}</p>
            <div class="record-actions">
                ${x.status === "Pickup Requested" ? `<button class="btn-mini" onclick="processPickup('${esc(x.id)}','accept')">Accept & Dispatch Truck →</button>` : ""}
                ${x.status === "In Transit" ? `<button class="btn-mini" onclick="processPickup('${esc(x.id)}','receive')">Confirm Received & Verify ✓</button>` : ""}
            </div>
        </article>
    `).join("") : '<div class="empty-state">No pickup batches available for processing.</div>';
}

async function processPickup(id, action) {
    if (!(await requireRole("company"))) return;

    const { data: p, error } = await db.from("pickup_requests").select("*").eq("id", id).single();
    if (error) {
        msg("companyMessage", error.message, "error");
        return;
    }

    if (action === "accept") {
        if (p.status !== "Pickup Requested") {
            msg("companyMessage", "This batch has already been accepted or finalized.", "error");
            return;
        }

        const { error: e } = await db.from("pickup_requests").update({
            status: "In Transit",
            accepted_at: new Date().toISOString()
        }).eq("id", id);
        if (e) { showError("companyMessage", e); return; }

        const { error: re } = await db.from("returns").update({ status: "In Transit" }).in("id", p.return_ids || []);
        if (re) {
            msg("companyMessage", "Batch accepted, but individual returns could not be set to In Transit: " + re.message, "error");
            return;
        }

        msg("companyMessage", "Pickup accepted. Consignment is now In Transit.", "success");
    } else if (action === "receive") {
        if (p.status !== "In Transit") {
            msg("companyMessage", "Batch must be In Transit before confirming arrival.", "error");
            return;
        }

        const ids = p.return_ids || [];
        if (!ids.length) {
            msg("companyMessage", "No return records linked to this batch.", "error");
            return;
        }

        const { error: re } = await db.from("returns").update({ status: "Received by Company" }).in("id", ids);
        if (re) { showError("companyMessage", re); return; }

        const { error: pe } = await db.from("pickup_requests").update({
            status: "Received by Company",
            received_at: new Date().toISOString()
        }).eq("id", id);
        if (pe) {
            msg("companyMessage", "Returns updated, but batch completion failed: " + pe.message, "error");
            return;
        }

        const { error: rw } = await db.rpc("award_reloop_rewards");
        msg("companyMessage", rw
            ? `Consignment verified received. Note: Reward function: ${rw.message}`
            : "Consignment verified received. Eco-rewards successfully credited to citizens!", "success");
    }

    await loadCompany();
}

// ==========================================================================
// ESG & PLATFORM ANALYTICS
// ==========================================================================

async function showAnalytics() {
    if (!(await requireRole("company"))) return;
    screen("analyticsScreen");
    await loadAnalytics();
}

async function loadAnalytics() {
    if (!(await requireRole("company"))) return;

    const { data, error } = await db.from("returns").select("*");
    if (error) {
        alert(error.message);
        return;
    }

    const rows = data || [];
    const total = rows.reduce((s, r) => s + kg(r), 0);
    const received = rows.filter(r => r.status === "Received by Company").reduce((s, r) => s + kg(r), 0);
    const pct = total > 0 ? (received / total) * 100 : 0;

    $("aTotal").textContent = total.toFixed(2);
    $("aCount").textContent = rows.length;
    $("aReceived").textContent = received.toFixed(2);
    $("aPending").textContent = Math.max(0, total - received).toFixed(2);

    $("aProgress").style.width = `${pct}%`;
    $("aProgressText").textContent = `${pct.toFixed(1)}% Recovered`;
}

async function downloadReport() {
    try {
        if (!(await requireRole("company"))) return;

        const { data, error } = await db.from("returns").select("*").order("created_at", { ascending: false });
        if (error) throw error;

        if (!data?.length) {
            alert("No records to export.");
            return;
        }

        const headers = ["Return ID", "Customer ID", "Product Name", "Brand", "Unit Weight (KG)", "Quantity", "Total Weight (KG)", "Drop Center", "Status", "Date"];
        const quote = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
        const rows = data.map(r => [
            r.id,
            r.customer_id,
            r.product_name,
            r.company_name,
            r.weight_per_item,
            r.quantity,
            kg(r).toFixed(2),
            r.collection_center,
            r.status,
            r.created_at
        ]);

        const csv = ["sep=,", headers.map(quote).join(","), ...rows.map(row => row.map(quote).join(","))].join("\r\n");
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ReLoop_Recovery_Report_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
        alert("Failed to export report: " + e.message);
    }
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

async function init() {
    initTheme();
    initSidebarState();

    if (!window.supabase) {
        alert("The Supabase client library failed to load. Please verify your connection.");
        return;
    }

    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data, error } = await db.auth.getSession();
    if (error) {
        console.error(error);
        updateSide();
        goHome();
        return;
    }

    if (data.session) {
        try {
            const p = await getProfile(data.session.user);
            await dashboard(p.role);
        } catch (e) {
            console.error("Profile load failure:", e);
            user = null;
            profile = null;
            updateSide();
            goHome();
        }
    } else {
        updateSide();
        goHome();
    }

    db.auth.onAuthStateChange((_event, session) => {
        if (!session) {
            user = null;
            profile = null;
            updateSide();
        }
    });
}

window.addEventListener("DOMContentLoaded", () => {
    $("weight")?.addEventListener("input", calc);
    $("quantity")?.addEventListener("input", calc);
    init();
});
