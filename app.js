// patched app.js (replace your current app.js with this)
// Reference: original uploaded file. See file citation above. :contentReference[oaicite:1]{index=1}

if (process.env.NODE_ENV != "production") {
    require('dotenv').config();
}

const express = require("express");
const mongoose = require("mongoose");
const app = express();
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const flash = require("connect-flash");
const passport = require("passport");
const localStrategy = require("passport-local");
const User = require("./models/user.js");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/reviews.js");
const userRouter = require("./routes/user.js");

const dbUrl = process.env.ATLASDB_URL;

// Basic app config that doesn't depend on DB
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

// Defensive middleware: prevent double-send crashes by no-op'ing subsequent sends
// and logging a single warning (per-request). This prevents ERR_HTTP_HEADERS_SENT from crashing.
app.use((req, res, next) => {
    // track if we've already warned on this request
    let warned = false;

    function makeGuard(orig) {
        return function guarded(...args) {
            if (res.headersSent) {
                if (!warned) {
                    warned = true;
                    console.warn(`Warning: attempted to call ${orig.name} after headers were sent for ${req.method} ${req.originalUrl}`);
                    // optionally log a small stack for debugging
                    console.warn(new Error().stack.split('\n').slice(2,6).join('\n'));
                }
                // gracefully ignore further attempts to modify response
                return;
            }
            return orig.apply(this, args);
        };
    }

    // wrap the most common response-sending methods
    res.send = makeGuard(res.send.bind(res));
    res.render = makeGuard(res.render.bind(res));
    res.redirect = makeGuard(res.redirect.bind(res));
    res.json = makeGuard(res.json.bind(res));
    res.end = makeGuard(res.end.bind(res));

    next();
});

// Temporary locals middleware before sessions are registered (safe)
app.use((req, res, next) => {
    res.locals.success = undefined;
    res.locals.error = undefined;
    res.locals.currentUser = undefined;
    next();
});

// Central startup: connect DB first, then attach session / passport / routes
async function start() {
    if (!dbUrl) {
        console.error("FATAL: ATLASDB_URL is not set in environment");
        process.exit(1);
    }
    // Masked print to verify env is present (no password leak)
    try {
        console.log("Using ATLASDB_URL (masked):", dbUrl.replace(/:[^:@]+@/, ":*****@"));
    } catch (e) {
        console.log("Using ATLASDB_URL (masked): <unable to mask>");
    }

    try {
        await mongoose.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log("connection successful");

        // create session store AFTER DB connection
        const store = MongoStore.create({
            mongoUrl: dbUrl,
            crypto: {
                secret: process.env.SECRET
            }
        });

        store.on("error", (err) => {
            console.error("ERROR in Mongo SESSION STORE", err);
        });

        const sessionOptions = {
            store,
            secret: process.env.SECRET || 'this_should_be_changed',
            resave: false,
            saveUninitialized: false, // recommended
            cookie: {
                httpOnly: true,
                expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
                maxAge: 1000 * 60 * 60 * 24 * 7
            }
        };

        // Register session & flash AFTER store creation
        app.use(session(sessionOptions));
        app.use(flash());

        // Now populate res.locals from flash and req.user
        app.use((req, res, next) => {
            res.locals.success = req.flash("success");
            res.locals.error = req.flash("error");
            res.locals.currentUser = req.user;
            next();
        });

        // Passport should be initialized after session available and DB connected
        app.use(passport.initialize());
        app.use(passport.session());
        passport.use(new localStrategy(User.authenticate()));
        passport.serializeUser(User.serializeUser());
        passport.deserializeUser(User.deserializeUser());

        // Routes (after passport)
        app.use("/listings", listingRouter);
        app.use("/listings/:id/reviews", reviewRouter);
        app.use("/", userRouter);

        // 404 handler — keep predictable flow
        app.all("/*", (req, res, next) => {
            next(new ExpressError(404, "Page Not Found!"));
        });

        // Central error handler — respects headersSent
        app.use((err, req, res, next) => {
            // If it's a Mongoose CastError (invalid ObjectId)
            if (err && err.name === "CastError") {
                err = new ExpressError(400, "Invalid ID format!");
            }

            let { statusCode = 500, message = "Something went wrong" } = err || {};

            // If headers already sent, forward to default express handler (prevents double-send)
            if (res.headersSent) {
                console.error("Headers already sent while handling error for", req.originalUrl, "-> forwarding to default handler");
                return next(err);
            }

            try {
                return res.status(statusCode).render("error.ejs", { statusCode, message });
            } catch (renderErr) {
                // As a last resort, send a minimal response
                console.error("Error while rendering error page:", renderErr);
                if (!res.headersSent) {
                    return res.status(500).send("Something went wrong");
                }
                return next(renderErr);
            }
        });

        // start server after everything set up
        const PORT = process.env.PORT || 8080;
        app.listen(PORT, () => {
            console.log(`server is running on port ${PORT}`);
        });

    } catch (err) {
        console.error("DB connection failed:", err);
        process.exit(1);
    }
}

// start the app
start();

