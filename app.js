// Minimal patched app.js — replace your existing app.js with this
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

/*
  Defensive guard: wrap common response methods so that if a route accidentally
  tries to send a second response, we log it and ignore the second attempt
  instead of crashing the process with ERR_HTTP_HEADERS_SENT.
  This is minimal and reversible — once you fix routes, you can remove it.
*/
app.use((req, res, next) => {
  let warned = false;
  const wrap = (fn) => {
    return function guarded(...args) {
      if (res.headersSent) {
        if (!warned) {
          warned = true;
          console.warn(`Warning: attempted to call ${fn.name} after headers were sent for ${req.method} ${req.originalUrl}`);
          console.warn(new Error().stack.split('\n').slice(2,6).join('\n'));
        }
        return;
      }
      return fn.apply(this, args);
    };
  };

  res.send = wrap(res.send.bind(res));
  res.render = wrap(res.render.bind(res));
  res.redirect = wrap(res.redirect.bind(res));
  res.json = wrap(res.json.bind(res));
  res.end = wrap(res.end.bind(res));

  next();
});

// temporary locals middleware (will be redefined after sessions are registered)
app.use((req, res, next) => {
  res.locals.success = undefined;
  res.locals.error = undefined;
  res.locals.currentUser = undefined;
  next();
});

/*
  Central startup: connect to DB first, then create session store and
  register session/flash/passport & routes. This prevents connect-mongo from
  receiving a null client and avoids the null .length error.
*/
async function start() {
  if (!dbUrl) {
    console.error("FATAL: ATLASDB_URL is not set in environment");
    process.exit(1);
  }

  try {
    console.log("Using ATLASDB_URL (masked):", dbUrl.replace(/:[^:@]+@/, ":*****@"));
  } catch (e) {
    console.log("Using ATLASDB_URL (masked): <unable to mask>");
  }

  try {
    // Wait for DB connection before creating store
    await mongoose.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log("connection successful");

    const store = MongoStore.create({
      mongoUrl: dbUrl,
      crypto: {
        secret: process.env.SECRET
      }
    });

    // fix: actually capture the error object in the handler
    store.on("error", (err) => {
      console.error("ERROR in Mongo SESSION STORE", err);
    });

    const sessionOptions = {
      store,
      secret: process.env.SECRET || 'this_should_be_changed',
      resave: false,
      saveUninitialized: false, // avoid creating empty sessions
      cookie: {
        httpOnly: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7
      }
    };

    // Register session & flash AFTER store creation
    app.use(session(sessionOptions));
    app.use(flash());

    // populate res.locals now that flash & session exist
    app.use((req, res, next) => {
      res.locals.success = req.flash("success");
      res.locals.error = req.flash("error");
      res.locals.currentUser = req.user;
      next();
    });

    // Passport after session
    app.use(passport.initialize());
    app.use(passport.session());
    passport.use(new localStrategy(User.authenticate()));
    passport.serializeUser(User.serializeUser());
    passport.deserializeUser(User.deserializeUser());

    // Routes
    app.use("/listings", listingRouter);
    app.use(
  "/listings/:listingId/reviews",
  (req, res, next) => {
    if (req.params && req.params.listingId) {
      req.params.id = req.params.listingId;
    }
    next();
  },
  reviewRouter
);

    app.use("/", userRouter);

    // 404 handler (re-enable predictable error flow)
    app.all("/*", (req, res, next) => {
      next(new ExpressError(404, "Page Not Found!"));
    });

    // Central error handler — respect headersSent to avoid double-send
    app.use((err, req, res, next) => {
      if (err && err.name === "CastError") {
        err = new ExpressError(400, "Invalid ID format!");
      }
      const { statusCode = 500, message = "Something went wrong" } = err || {};

      if (res.headersSent) {
        console.error("Headers already sent while handling error for", req.originalUrl, "-> forwarding");
        return next(err);
      }

      try {
        return res.status(statusCode).render("error.ejs", { statusCode, message });
      } catch (renderErr) {
        console.error("Error while rendering error page:", renderErr);
        if (!res.headersSent) {
          return res.status(500).send("Something went wrong");
        }
        return next(renderErr);
      }
    });

    // start server
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, () => {
      console.log(`server is running on port ${PORT}`);
    });

  } catch (err) {
    console.error("DB connection failed:", err);
    process.exit(1);
  }
}

// Start the app
start();
