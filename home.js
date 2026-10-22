
const SUPABASE_URL = "https://dsxfiiapxbagjhbnyeno.supabase.co";
const SUPABASE_KEY = "sb_publishable_zWzX8hFSy5dCkXVCwfoPvQ_otFm53Db";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);

let currentUser = null;
let currentSlipId = null;
let isNewCopy = false;
let originalSlipKey = null;

let customFields = [];
let earnings = [];
let deductions = [];
let logoPath = "";
let logoFile = null;
let logoObjectUrl = "";
let signedLogoUrl = "";
let savedSlips = [];

const employeeFields = [
  ["empNo", "Employee No."],
  ["empName", "Name"],
  ["fatherName", "Father / Husband Name"],
  ["designation", "Designation"],
  ["department", "Department"],
  ["joiningDate", "Joining Date"],
  ["bankAccount", "Bank A/C No."],
  ["ifsc", "IFSC Code"],
  ["uan", "UAN"],
  ["pfNo", "PF No."],
  ["esiNo", "ESI No."],
  ["location", "Work Location"]
];

function money(n) {
  const digits = Number($("rounding").value || 2);
  const value = Number(n) || 0;

  return "₹" + value.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showStatus(text, type = "ok") {
  $("status").textContent = text;
  $("status").className = "status " + (type === "err" ? "err" : "ok");
}

function monthLabel(value) {
  if (!value) return "—";

  const [year, month] = value.split("-").map(Number);

  return year && month
    ? new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric"
      })
    : value;
}

function wordsUnderThousand(n) {
  const one = [
    "", "One", "Two", "Three", "Four", "Five", "Six",
    "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];

  const ten = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty",
    "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  let output = "";

  if (n >= 100) {
    output += one[Math.floor(n / 100)] + " Hundred ";
    n %= 100;
  }

  if (n >= 20) {
    output += ten[Math.floor(n / 10)] + " ";
    n %= 10;
  }

  if (n > 0) output += one[n] + " ";

  return output;
}

function numberWords(amount) {
  const negative = amount < 0;
  let paise = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paise / 100);

  paise %= 100;

  if (rupees > 999999999999) return "Amount too large";

  let n = rupees;
  const parts = [];

  for (const [size, label] of [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"]
  ]) {
    if (n >= size) {
      parts.push(wordsUnderThousand(Math.floor(n / size)) + label);
      n %= size;
    }
  }

  if (n) parts.push(wordsUnderThousand(n));

  let output =
    (negative ? "Minus " : "") +
    (parts.join(" ").trim() || "Zero") +
    " Rupees";

  if (paise) {
    output += " and " + wordsUnderThousand(paise).trim() + " Paise";
  }

  return output + " Only";
}

function basisRatio() {
  const basis = num($("basisDays").value);
  return basis > 0 ? num($("paidDays").value) / basis : 0;
}

function updateEarned(row, force = false) {
  if (force || (!row.manual && $("autoProrate").checked)) {
    row.earned = Math.round(
      (num(row.fixed) * basisRatio() + Number.EPSILON) * 100
    ) / 100;
  }
}

function totalEarned() {
  return earnings.reduce(
    (sum, row) => sum + num(row.earned) + num(row.arrear),
    0
  );
}

function totalDeducted() {
  return deductions.reduce(
    (sum, row) => sum + num(row.amount) + num(row.arrear),
    0
  );
}

function netPay() {
  const precision = 10 ** Number($("rounding").value || 2);

  return Math.round(
    (totalEarned() - totalDeducted()) * precision
  ) / precision;
}

function renderComponents() {
  $("earningsRows").innerHTML = earnings.map((row, index) => `
    <div class="component-row earning-grid"
         data-kind="earning" data-index="${index}">
      <input data-key="name" aria-label="Earning name"
             value="${escapeHTML(row.name)}" placeholder="Particular">
      <input data-key="fixed" aria-label="Fixed amount"
             type="number" step="0.01" value="${row.fixed}">
      <input data-key="earned" aria-label="Earned amount"
             type="number" step="0.01" value="${row.earned}">
      <input data-key="arrear" aria-label="Earning arrear"
             type="number" step="0.01" value="${row.arrear}">
      <button type="button" class="remove"
              aria-label="Remove earning">×</button>
    </div>
  `).join("");

  $("deductionsRows").innerHTML = deductions.map((row, index) => `
    <div class="component-row deduction-grid"
         data-kind="deduction" data-index="${index}">
      <input data-key="name" aria-label="Deduction name"
             value="${escapeHTML(row.name)}" placeholder="Particular">
      <input data-key="amount" aria-label="Deduction amount"
             type="number" step="0.01" value="${row.amount}">
      <input data-key="arrear" aria-label="Deduction arrear"
             type="number" step="0.01" value="${row.arrear}">
      <button type="button" class="remove"
              aria-label="Remove deduction">×</button>
    </div>
  `).join("");

  $("totalEarnings").textContent = money(totalEarned());
  $("totalDeductions").textContent = money(totalDeducted());
}

function fieldValue(id) {
  return $(id).value.trim();
}

function getEmployeeData() {
  const data = {};

  employeeFields.forEach(([id]) => {
    data[id] = fieldValue(id);
  });

  data.custom = customFields.map(field => ({ ...field }));
  data.lopDays = fieldValue("lopDays");
  data.rounding = fieldValue("rounding");

  return data;
}

function readEmployeeData(data = {}) {
  employeeFields.forEach(([id]) => {
    $(id).value = data[id] ?? "";
  });

  customFields = Array.isArray(data.custom)
    ? data.custom.map(field => ({ ...field }))
    : [];

  $("lopDays").value = data.lopDays ?? 0;
  $("rounding").value = data.rounding ?? "2";

  renderCustomFields();
}

function renderCustomFields() {
  $("customFields").innerHTML = customFields.map((field, index) => `
    <div class="custom-row" data-custom-index="${index}">
      <input data-custom-key="label" aria-label="Custom field heading"
             value="${escapeHTML(field.label)}" placeholder="Field heading">
      <input data-custom-key="value" aria-label="Custom field value"
             value="${escapeHTML(field.value)}" placeholder="Field value">
      <button class="btn small" type="button"
              data-remove-custom="${index}">Remove</button>
    </div>
  `).join("");
}

function renderLogo() {
  const source = logoObjectUrl || signedLogoUrl || "";

  $("logoPreview").innerHTML = source
    ? `<img src="${source}" alt="Company logo">`
    : "LOGO";

  $("paperLogo").innerHTML = source
    ? `<img src="${source}" alt="Company logo">`
    : "";
}

async function loadSignedLogo() {
  signedLogoUrl = "";

  if (!logoPath) {
    renderLogo();
    return;
  }

  const { data, error } = await db.storage
    .from("salary-logos")
    .createSignedUrl(logoPath, 3600);

  if (!error && data?.signedUrl) {
    signedLogoUrl = data.signedUrl;
  }

  renderLogo();
}

function renderPreview() {
  $("pCompany").textContent =
    fieldValue("companyName") || "Company Name";

  $("pAddress").textContent = fieldValue("companyAddress");

  const tax = [];

  if (fieldValue("gstin")) {
    tax.push("GSTIN: " + fieldValue("gstin"));
  }

  if (fieldValue("tan")) {
    tax.push("TAN: " + fieldValue("tan"));
  }

  $("pCompanyTax").textContent = tax.join("  |  ");

  $("pReg").textContent = fieldValue("regNo")
    ? "Reg. No.: " + fieldValue("regNo")
    : "";

  $("pMonth").textContent =
    "Salary Slip For " + monthLabel($("salaryMonth").value);

  $("pPaidDays").textContent =
    "Paid Days: " + num($("paidDays").value);

  const info = [];

  employeeFields.forEach(([id, label]) => {
    const value = fieldValue(id);
    if (value) info.push([label, value]);
  });

  customFields.forEach(field => {
    if (
      String(field.label || "").trim() &&
      String(field.value || "").trim()
    ) {
      info.push([field.label, field.value]);
    }
  });

  info.push(
    ["Basis Days", num($("basisDays").value)],
    ["LOP Days", num($("lopDays").value)]
  );

  $("pEmployee").innerHTML = info.map(([label, value]) => `
    <div class="info-cell">
      <b>${escapeHTML(label)}:</b>
      <span class="v">${escapeHTML(value)}</span>
    </div>
  `).join("");

  const earningRows = earnings.map(row => `
    <tr>
      <td>${escapeHTML(row.name)}</td>
      <td>${money(row.fixed)}</td>
      <td>${money(row.earned)}</td>
      <td>${money(row.arrear)}</td>
      <td>${money(num(row.earned) + num(row.arrear))}</td>
    </tr>
  `);

  earningRows.push(`
    <tr class="sumrow">
      <td>Total</td>
      <td>${money(earnings.reduce((s, r) => s + num(r.fixed), 0))}</td>
      <td>${money(earnings.reduce((s, r) => s + num(r.earned), 0))}</td>
      <td>${money(earnings.reduce((s, r) => s + num(r.arrear), 0))}</td>
      <td>${money(totalEarned())}</td>
    </tr>
  `);

  $("pEarnings").innerHTML = earningRows.join("");

  const deductionRows = deductions.map(row => `
    <tr>
      <td>${escapeHTML(row.name)}</td>
      <td>${money(row.amount)}</td>
      <td>${money(row.arrear)}</td>
      <td>${money(num(row.amount) + num(row.arrear))}</td>
    </tr>
  `);

  deductionRows.push(`
    <tr class="sumrow">
      <td>Total</td>
      <td>${money(deductions.reduce((s, r) => s + num(r.amount), 0))}</td>
      <td>${money(deductions.reduce((s, r) => s + num(r.arrear), 0))}</td>
      <td>${money(totalDeducted())}</td>
    </tr>
  `);

  $("pDeductions").innerHTML = deductionRows.join("");
  $("pNet").textContent = money(netPay());
  $("pWords").textContent =
    "RUPEES: " + numberWords(netPay()).toUpperCase();

  $("pNotes").textContent = fieldValue("notes");
  $("statNet").textContent = money(netPay());

  $("statDays").textContent =
    num($("paidDays").value) + " / " + num($("basisDays").value);

  renderLogo();
}

function recalc() {
  earnings.forEach(row => updateEarned(row));
  renderComponents();
  renderPreview();
}

function resetForm() {
  currentSlipId = null;
  isNewCopy = false;
  originalSlipKey = null;
  logoPath = "";
  logoFile = null;
  signedLogoUrl = "";

  if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
  logoObjectUrl = "";

  [
    "companyName",
    "companyAddress",
    "regNo",
    "gstin",
    "tan",
    "notes"
  ].forEach(id => {
    $(id).value = "";
  });

  $("salaryMonth").value = new Date().toISOString().slice(0, 7);
  $("logoFile").value = "";

  readEmployeeData({ lopDays: 0, rounding: "2" });

  $("basisDays").value = 30;
  $("paidDays").value = 30;
  $("autoProrate").checked = true;

  earnings = [
    {
      name: "Basic + DA",
      fixed: 15050,
      earned: 15050,
      arrear: 0,
      manual: false
    },
    {
      name: "HRA",
      fixed: 6020,
      earned: 6020,
      arrear: 0,
      manual: false
    },
    {
      name: "Conv Allow.",
      fixed: 1600,
      earned: 1600,
      arrear: 0,
      manual: false
    },
    {
      name: "Special / Other Allowance",
      fixed: 1319,
      earned: 1319,
      arrear: 0,
      manual: false
    }
  ];

  deductions = [
    { name: "PF Employee Contribution", amount: 0, arrear: 0 },
    { name: "Other Deduction", amount: 0, arrear: 0 }
  ];

  recalc();
  showStatus("New blank salary slip ready.");
}

function collectPayload() {
  return {
    user_id: currentUser.id,
    salary_month: $("salaryMonth").value,
    company_name: fieldValue("companyName"),
    company_address: fieldValue("companyAddress"),
    company_gstin: fieldValue("gstin"),
    company_tan: fieldValue("tan"),
    company_logo_url: logoPath,
    employee_data: {
      ...getEmployeeData(),
      regNo: fieldValue("regNo")
    },
    earnings: earnings.map(row => ({ ...row })),
    deductions: deductions.map(row => ({ ...row })),
    basis_days: num($("basisDays").value),
    paid_days: num($("paidDays").value),
    arrears:
      earnings.reduce((sum, row) => sum + num(row.arrear), 0) -
      deductions.reduce((sum, row) => sum + num(row.arrear), 0),
    notes: fieldValue("notes")
  };
}

async function uploadLogoIfNeeded() {
  if (!logoFile) return logoPath;

  if (logoFile.size > 3 * 1024 * 1024) {
    throw new Error("Logo must be 3 MB or smaller.");
  }

  const extension = logoFile.name
    .split(".")
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "png";

  const path =
    currentUser.id + "/" + crypto.randomUUID() + "." + extension;

  const { error } = await db.storage
    .from("salary-logos")
    .upload(path, logoFile, {
      contentType: logoFile.type,
      upsert: false
    });

  if (error) throw error;

  logoPath = path;
  logoFile = null;

  if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
  logoObjectUrl = "";

  await loadSignedLogo();

  return logoPath;
}

/*
  A slip's identity is based on company, GSTIN, salary month
  and employee number (or employee name when employee number is blank).
*/
function getSlipKey(data) {
  const employee = data.employee_data || {};

  return JSON.stringify([
    String(data.company_name || "").trim().toLowerCase(),
    String(data.company_gstin || "").trim().toLowerCase(),
    String(data.salary_month || "").trim(),
    String(employee.empNo || employee.empName || "").trim().toLowerCase()
  ]);
}

async function saveSlip() {
  if (
    !fieldValue("companyName") ||
    !fieldValue("empName") ||
    !fieldValue("salaryMonth")
  ) {
    showStatus(
      "Company name, employee name and payroll month are required.",
      "err"
    );
    return;
  }

  $("saveBtn").disabled = true;
  $("saveBottom").disabled = true;
  showStatus("Saving salary slip…");

  try {
    await uploadLogoIfNeeded();

    const payload = collectPayload();
    const newSlipKey = getSlipKey(payload);

    /*
      Update the existing record only when its identity is unchanged.
      If company, employee identity or month changes, insert a new row
      so the original saved slip remains intact.
    */
    const shouldUpdate = Boolean(
      currentSlipId &&
      !isNewCopy &&
      originalSlipKey &&
      originalSlipKey === newSlipKey
    );

    let result;

    if (shouldUpdate) {
      result = await db
        .from("salary_slips")
        .update({
          ...payload,
          updated_at: new Date().toISOString()
        })
        .eq("id", currentSlipId)
        .eq("user_id", currentUser.id)
        .select("id")
        .single();
    } else {
      result = await db
        .from("salary_slips")
        .insert(payload)
        .select("id")
        .single();
    }

    if (result.error) throw result.error;

    currentSlipId = result.data.id;
    isNewCopy = false;
    originalSlipKey = newSlipKey;

    showStatus("Salary slip saved successfully.");
    await loadSavedSlips();
  } catch (error) {
    showStatus(
      "Save failed: " + (error.message || "Unknown error"),
      "err"
    );
  } finally {
    $("saveBtn").disabled = false;
    $("saveBottom").disabled = false;
  }
}

function loadIntoForm(row, duplicate = false) {
  currentSlipId = duplicate ? null : row.id;
  isNewCopy = duplicate;
  originalSlipKey = duplicate ? null : getSlipKey(row);

  $("companyName").value = row.company_name || "";
  $("companyAddress").value = row.company_address || "";
  $("gstin").value = row.company_gstin || "";
  $("tan").value = row.company_tan || "";

  const employee = row.employee_data || {};

  $("regNo").value = employee.regNo || "";

  $("salaryMonth").value =
    row.salary_month || new Date().toISOString().slice(0, 7);

  $("basisDays").value = row.basis_days ?? 30;
  $("paidDays").value = row.paid_days ?? 30;
  $("notes").value = row.notes || "";

  readEmployeeData(employee);

  earnings = Array.isArray(row.earnings)
    ? row.earnings.map(item => ({
        name: item.name || "",
        fixed: num(item.fixed),
        earned: num(item.earned),
        arrear: num(item.arrear),
        manual: !!item.manual
      }))
    : [];

  deductions = Array.isArray(row.deductions)
    ? row.deductions.map(item => ({
        name: item.name || "",
        amount: num(item.amount),
        arrear: num(item.arrear)
      }))
    : [];

  logoPath = row.company_logo_url || "";
  logoFile = null;
  $("logoFile").value = "";

  if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
  logoObjectUrl = "";

  $("autoProrate").checked = true;

  loadSignedLogo();
  recalc();

  showStatus(
    duplicate
      ? "Copied into a new slip. Change the month/details, then save."
      : "Saved slip loaded. Saving changes will update this record."
  );

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadSavedSlips() {
  const { data, error } = await db
    .from("salary_slips")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    $("savedList").innerHTML =
      '<div class="empty">Unable to load saved slips: ' +
      escapeHTML(error.message) +
      "</div>";
    return;
  }

  savedSlips = data || [];
  $("statSaved").textContent = savedSlips.length;

  renderSavedList();
}

function renderSavedList() {
  const query = $("searchSaved").value.trim().toLowerCase();

  const filtered = savedSlips.filter(row => [
    row.company_name,
    row.salary_month,
    row.employee_data?.empName,
    row.employee_data?.empNo
  ].some(value => String(value || "").toLowerCase().includes(query)));

  if (!filtered.length) {
    $("savedList").innerHTML =
      '<div class="empty">No saved salary slips found.</div>';
    return;
  }

  $("savedList").innerHTML = filtered.map(row => `
    <div class="saved-item">
      <div class="saved-icon">▤</div>
      <div class="saved-info">
        <strong>${escapeHTML(row.employee_data?.empName || "Unnamed employee")}</strong>
        <span>
          ${escapeHTML(row.company_name || "Company")} ·
          ${escapeHTML(monthLabel(row.salary_month))}
        </span>
      </div>
      <div class="saved-actions">
        <button class="btn small" data-action="edit"
                data-id="${row.id}">Open</button>
        <button class="btn small" data-action="duplicate"
                data-id="${row.id}">Duplicate</button>
      </div>
    </div>
  `).join("");
}

async function requireAdmin() {
  const {
    data: { session },
    error
  } = await db.auth.getSession();

  if (error || !session) {
    location.replace("login.html");
    return false;
  }

  currentUser = session.user;

  const { data: allowed, error: roleError } =
    await db.rpc("is_admin");

  if (roleError || allowed !== true) {
    await db.auth.signOut();

    alert(
      "Admin access could not be verified. Check the admin_users record and is_admin() function."
    );

    location.replace("login.html");
    return false;
  }

  $("userEmail").textContent =
    currentUser.email || "Admin workspace";

  return true;
}

/* Add employee custom field */
$("addFieldBtn").addEventListener("click", () => {
  customFields.push({
    id: crypto.randomUUID(),
    label: "New field",
    value: ""
  });

  renderCustomFields();
});

/* Add earnings and deductions */
$("addEarning").addEventListener("click", () => {
  earnings.push({
    name: "New earning",
    fixed: 0,
    earned: 0,
    arrear: 0,
    manual: false
  });

  renderComponents();
  renderPreview();
});

$("addDeduction").addEventListener("click", () => {
  deductions.push({
    name: "New deduction",
    amount: 0,
    arrear: 0
  });

  renderComponents();
  renderPreview();
});

/* Main buttons */
$("newBtn").addEventListener("click", () => {
  if (confirm("Start a new blank salary slip? Save current changes first if needed.")) {
    resetForm();
  }
});

$("saveBtn").addEventListener("click", saveSlip);
$("saveBottom").addEventListener("click", saveSlip);

$("refreshSaved").addEventListener("click", loadSavedSlips);
$("searchSaved").addEventListener("input", renderSavedList);

$("printBtn").addEventListener("click", () => window.print());
$("printBottom").addEventListener("click", () => window.print());

$("logoutBtn").addEventListener("click", async () => {
  await db.auth.signOut();
  location.replace("login.html");
});

/* Remove logo */
$("removeLogo").addEventListener("click", () => {
  logoPath = "";
  logoFile = null;
  signedLogoUrl = "";
  $("logoFile").value = "";

  if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
  logoObjectUrl = "";

  renderLogo();
});

/* Upload logo preview */
$("logoFile").addEventListener("change", event => {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showStatus("Choose a PNG, JPG or WebP image.", "err");
    event.target.value = "";
    return;
  }

  if (file.size > 3 * 1024 * 1024) {
    showStatus("Logo must be 3 MB or smaller.", "err");
    event.target.value = "";
    return;
  }

  logoFile = file;

  if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);

  logoObjectUrl = URL.createObjectURL(file);

  renderLogo();
});

/* Update preview when details change */
[
  "companyName",
  "companyAddress",
  "regNo",
  "gstin",
  "tan",
  "salaryMonth",
  "notes",
  ...employeeFields.map(field => field[0]),
  "basisDays",
  "paidDays",
  "lopDays",
  "rounding"
].forEach(id => {
  $(id).addEventListener("input", () => {
    if (id === "basisDays" || id === "paidDays") {
      recalc();
    } else {
      renderPreview();
    }
  });

  $(id).addEventListener("change", () => {
    if (["basisDays", "paidDays", "rounding"].includes(id)) {
      recalc();
    } else {
      renderPreview();
    }
  });
});

/* Automatically prorate earnings */
$("autoProrate").addEventListener("change", () => {
  if ($("autoProrate").checked) {
    earnings.forEach(row => {
      row.manual = false;
      updateEarned(row, true);
    });
  }

  recalc();
});

/* Earnings editor */
$("earningsRows").addEventListener("input", event => {
  const input = event.target.closest("input");
  if (!input) return;

  const container = input.closest("[data-index]");
  if (!container) return;

  const row = earnings[Number(container.dataset.index)];
  if (!row) return;

  const key = input.dataset.key;

  if (key === "name") row.name = input.value;

  if (key === "fixed") {
    row.fixed = num(input.value);

    if (!row.manual) updateEarned(row, true);
  }

  if (key === "earned") {
    row.earned = num(input.value);
    row.manual = true;
  }

  if (key === "arrear") row.arrear = num(input.value);

  $("totalEarnings").textContent = money(totalEarned());
  renderPreview();
});

$("earningsRows").addEventListener("change", event => {
  if (event.target.matches("input")) {
    renderComponents();
    renderPreview();
  }
});

$("earningsRows").addEventListener("click", event => {
  const button = event.target.closest(".remove");
  if (!button) return;

  earnings.splice(
    Number(button.closest("[data-index]").dataset.index),
    1
  );

  recalc();
});

/* Deductions editor */
$("deductionsRows").addEventListener("input", event => {
  const input = event.target.closest("input");
  if (!input) return;

  const container = input.closest("[data-index]");
  if (!container) return;

  const row = deductions[Number(container.dataset.index)];
  if (!row) return;

  if (input.dataset.key === "name") row.name = input.value;
  if (input.dataset.key === "amount") row.amount = num(input.value);
  if (input.dataset.key === "arrear") row.arrear = num(input.value);

  $("totalDeductions").textContent = money(totalDeducted());
  renderPreview();
});

$("deductionsRows").addEventListener("change", event => {
  if (event.target.matches("input")) {
    renderComponents();
    renderPreview();
  }
});

$("deductionsRows").addEventListener("click", event => {
  const button = event.target.closest(".remove");
  if (!button) return;

  deductions.splice(
    Number(button.closest("[data-index]").dataset.index),
    1
  );

  recalc();
});

/* Custom employee fields */
$("customFields").addEventListener("input", event => {
  const input = event.target.closest("input");
  if (!input) return;

  const container = input.closest("[data-custom-index]");
  if (!container) return;

  const field = customFields[Number(container.dataset.customIndex)];

  if (field) {
    field[input.dataset.customKey] = input.value;
    renderPreview();
  }
});

$("customFields").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-custom]");
  if (!button) return;

  customFields.splice(Number(button.dataset.removeCustom), 1);

  renderCustomFields();
  renderPreview();
});

/* Open or duplicate saved slips */
$("savedList").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const row = savedSlips.find(item => item.id === button.dataset.id);
  if (!row) return;

  if (button.dataset.action === "edit") {
    loadIntoForm(row, false);
  }

  if (button.dataset.action === "duplicate") {
    const copy = structuredClone(row);

    const [year, month] = String(
      copy.salary_month || new Date().toISOString().slice(0, 7)
    ).split("-").map(Number);

    const next = new Date(year, month, 1);

    copy.salary_month =
      next.getFullYear() + "-" +
      String(next.getMonth() + 1).padStart(2, "0");

    loadIntoForm(copy, true);
  }
});

/* Start application after admin verification */
(async () => {
  if (await requireAdmin()) {
    resetForm();
    await loadSavedSlips();
  }
})();
