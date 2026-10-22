const SUPABASE_URL = "https://dsxfiiapxbagjhbnyeno.supabase.co";
const SUPABASE_KEY = "sb_publishable_zWzX8hFSy5dCkXVCwfoPvQ_otFm53Db";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const form = document.getElementById("loginForm");
const button = document.getElementById("submitBtn");
const message = document.getElementById("message");

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = "message " + type;
}

async function redirectIfAdmin() {
  const { data: { session }, error } = await db.auth.getSession();

  if (error || !session) return;

  const { data: allowed, error: roleError } = await db.rpc("is_admin");

  if (!roleError && allowed === true) {
    location.replace("home.html");
  } else {
    await db.auth.signOut();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  button.disabled = true;
  button.textContent = "Verifying access…";
  message.className = "message";

  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const { error: loginError } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (loginError) throw loginError;

    const { data: allowed, error: roleError } =
      await db.rpc("is_admin");

    if (roleError) {
      await db.auth.signOut();
      throw new Error(
        "Admin verification failed. Check the Supabase is_admin() function and database policies."
      );
    }

    if (allowed !== true) {
      await db.auth.signOut();
      throw new Error("This account is not authorized as an admin.");
    }

    location.replace("home.html");
  } catch (error) {
    showMessage(error.message || "Unable to sign in. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Sign in securely →";
  }
});

redirectIfAdmin();