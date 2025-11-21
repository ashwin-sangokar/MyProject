// /mnt/data/app.js
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

const dbUrl = process.env.ATLASDB_URL || "mongodb://127.0.0.1:27017/WanderLust";

// Basic app config that doesn't depend on DB
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

// temporary locals middleware (will be redefined after sessions are registered)
app.use((req, res, next) => {
  res.locals.success = undefined;
  res.locals.error = undefined;
  res.locals.currentUser = undefined;
  next();
});

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
    // Connect to DB first
    // Note: newer MongoDB driver ignores useNewUrlParser/useUnifiedTopology — harmless but optional
    await mongoose.connect(dbUrl);
    console.log("connection successful");

    // Use mongoose's existing connected client for session store to avoid races
    const client = (typeof mongoose.connection.getClient === "function") ? mongoose.connection.getClient() : null;
    if (!client) {
      console.error("FATAL: mongoose.connection.getClient() returned falsy. Cannot create session store safely.");
      process.exit(1);
    }

    const store = MongoStore.create({
      client, // use existing connected Mongo client (no mongoUrl race)
      // optional: stringify: false,
      crypto: {
        secret: process.env.SECRET || 'this_should_be_changed'
      }
    });

    store.on("error", (err) => {
      console.error("ERROR in Mongo SESSION STORE", err);
    });

    const sessionOptions = {
      store,
      secret: process.env.SECRET || 'this_should_be_changed',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
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

    // Mount reviews under a different param name to avoid parse collisions,
    // but keep backwards compatibility by copying listingId -> id for controllers.
    app.use(
      "/listings/:listingId/reviews",
      (req, res, next) => {
        if (req.params && req.params.listingId) req.params.id = req.params.listingId;
        next();
      },
      reviewRouter
    );

    app.use("/", userRouter);

    // 404 handler
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
