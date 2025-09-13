const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const DiscordStrategy = require("passport-discord").Strategy;
const bcrypt = require("bcryptjs");
const fs = require("fs-extra");
const path = require("path");

const app = express();
const PORT = 3000;

// DB paths
const DB_SERVERS = path.join(__dirname, "servers.json");
const DB_USERS = path.join(__dirname, "users.json");
if (!fs.existsSync(DB_SERVERS)) fs.writeJsonSync(DB_SERVERS, []);
if (!fs.existsSync(DB_USERS)) fs.writeJsonSync(DB_USERS, []);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: "cordly-secret", resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.set("view engine", "ejs");

// ---- Local Auth ----
passport.use(new LocalStrategy(
  { usernameField: "email" },
  (email, password, done) => {
    const users = fs.readJsonSync(DB_USERS);
    const user = users.find(u => u.email === email);
    if (!user) return done(null, false, { message: "User not found" });
    if (!bcrypt.compareSync(password, user.password)) return done(null, false, { message: "Invalid password" });
    return done(null, user);
  }
));

// ---- Discord OAuth2 ----
passport.use(new DiscordStrategy({
  clientID: "YOUR_DISCORD_CLIENT_ID",
  clientSecret: "YOUR_DISCORD_CLIENT_SECRET",
  callbackURL: "http://localhost:3000/auth/discord/callback",
  scope: ["identify", "email"]
}, (accessToken, refreshToken, profile, done) => {
  let users = fs.readJsonSync(DB_USERS);
  let user = users.find(u => u.discordId === profile.id);
  if (!user) {
    user = {
      id: Date.now().toString(),
      discordId: profile.id,
      username: profile.username,
      email: profile.email || null
    };
    users.push(user);
    fs.writeJsonSync(DB_USERS, users, { spaces: 2 });
  }
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const users = fs.readJsonSync(DB_USERS);
  const user = users.find(u => u.id === id);
  done(null, user);
});

// ---- Routes ----

// Home
app.get("/", (req, res) => {
  const servers = fs.readJsonSync(DB_SERVERS);
  res.render("page", { user: req.user, servers, mode: "dark" });
});

// Register
app.post("/register", (req, res) => {
  const { email, password } = req.body;
  let users = fs.readJsonSync(DB_USERS);
  if (users.find(u => u.email === email)) return res.send("User exists");
  const newUser = { id: Date.now().toString(), email, password: bcrypt.hashSync(password, 10) };
  users.push(newUser);
  fs.writeJsonSync(DB_USERS, users, { spaces: 2 });
  res.redirect("/");
});

// Local login
app.post("/login",
  passport.authenticate("local", { failureRedirect: "/" }),
  (req, res) => res.redirect("/")
);

// Logout
app.get("/logout", (req, res) => { req.logout(() => {}); res.redirect("/"); });

// Discord OAuth2 login
app.get("/auth/discord", passport.authenticate("discord", { prompt: "none" }));
app.get("/auth/discord/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => res.redirect("/")
);

// Add server
app.post("/add", (req, res) => {
  if (!req.user) return res.send("Login required");
  const { name, url, description } = req.body;
  const servers = fs.readJsonSync(DB_SERVERS);
  servers.push({
    id: Date.now().toString(),
    name,
    url,
    description,
    status: "pending",
    submittedBy: req.user.id
  });
  fs.writeJsonSync(DB_SERVERS, servers, { spaces: 2 });
  res.redirect("/");
});

// Admin
app.get("/admin", (req, res) => {
  if (!req.user) return res.send("Login required");
  if (req.user.email !== "keennetcreates@gmail.com") return res.send("Admins only");
  const servers = fs.readJsonSync(DB_SERVERS);
  res.render("admin", { servers });
});

app.post("/admin/update", (req, res) => {
  const { id, action } = req.body;
  const servers = fs.readJsonSync(DB_SERVERS);
  const server = servers.find(s => s.id === id);
  if (server) {
    if (action === "approve") server.status = "approved";
    if (action === "suspend") server.status = "suspended";
    if (action === "ban") server.status = "banned";
    fs.writeJsonSync(DB_SERVERS, servers, { spaces: 2 });
  }
  res.redirect("/admin");
});

app.listen(PORT, () => console.log(`Cordly Disnano running at http://localhost:${PORT}`));
