require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fs = require('fs-extra');
const nodemailer = require('nodemailer');
const ejs = require('ejs');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup storage files
if(!fs.existsSync(process.env.DB_USERS)) fs.writeJsonSync(process.env.DB_USERS, []);
if(!fs.existsSync(process.env.DB_SERVERS)) fs.writeJsonSync(process.env.DB_SERVERS, []);

// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// Discord OAuth
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ["identify","email"]
}, (accessToken, refreshToken, profile, done) => {
    let users = fs.readJsonSync(process.env.DB_USERS);
    let user = users.find(u => u.discordId === profile.id);
    if(!user){
        user = {
            id: Date.now().toString(),
            discordId: profile.id,
            username: profile.username,
            email: profile.email || null
        };
        users.push(user);
        fs.writeJsonSync(process.env.DB_USERS, users, {spaces:2});
    }
    return done(null,user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const users = fs.readJsonSync(process.env.DB_USERS);
    done(null, users.find(u => u.id === id));
});

app.use(passport.initialize());
app.use(passport.session());

// Email setup
let transporter;
if(process.env.ENABLE_EMAIL_ALERTS==='true'){
    transporter = nodemailer.createTransport({
        host: process.env.EMAIL_SMTP_HOST,
        port: parseInt(process.env.EMAIL_SMTP_PORT),
        secure: false,
        auth: { user: process.env.EMAIL_SMTP_USER, pass: process.env.EMAIL_SMTP_PASS }
    });
}

// ---- ROUTES ----
app.get('/', (req,res)=>{
    const servers = fs.readJsonSync(process.env.DB_SERVERS);
    res.render('home', { user:req.user, servers, theme:process.env.THEME, siteName:process.env.SITE_NAME, slogan:process.env.SLOGAN });
});

app.get('/tos', (req,res)=>{
    res.render('tos', { theme:process.env.THEME, siteName:process.env.SITE_NAME });
});

app.get('/link', (req,res)=>{
    const { url } = req.query;
    if(!url) return res.send('No URL provided');
    res.render('link', { url, theme:process.env.THEME });
});

// OAuth
app.get("/auth/discord", passport.authenticate("discord"));
app.get("/auth/discord/callback", passport.authenticate("discord",{failureRedirect:"/"}), (req,res)=>{
    res.send(`<script>window.opener.location.reload(); window.close();</script>`);
});

app.get("/logout",(req,res)=>{ req.logout(()=>{}); res.redirect("/"); });

// Add server
app.post("/add", (req,res)=>{
    if(!req.user) return res.redirect("/");
    const { name, url, description } = req.body;
    let servers = fs.readJsonSync(process.env.DB_SERVERS);
    servers.push({
        id: Date.now().toString(),
        name, url, description,
        submittedBy: req.user.discordId,
        status: "pending"
    });
    fs.writeJsonSync(process.env.DB_SERVERS, servers, {spaces:2});

    if(transporter){
        transporter.sendMail({
            from: `"Cordly Disnano" <${process.env.EMAIL_SMTP_USER}>`,
            to: process.env.EMAIL_NOTIFY,
            subject: `New server submitted: ${name}`,
            text: `Server ${name} was added by ${req.user.username} (${req.user.discordId})`
        }).catch(console.error);
    }

    res.redirect("/");
});

app.listen(PORT, ()=>console.log(`${process.env.SITE_NAME} running at http://localhost:${PORT}`));
