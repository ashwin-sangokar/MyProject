// app.js (fixed)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
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

// Use a single env var name; change to match what you set on Render.
// If you use MONGO_URI on Render, change this to process.env.MONGO_URI.
const dbUrl = process.env.ATLASDB_URL || process.env.MONGO_URI;

if (!dbUrl) {
  console.error("FATAL: Database URL is not set. Set ATLASDB_URL (or MONGO_URI).");
  process.exit(1);
}

// connect mongoose and only continue if successful
async function start() {
  try {
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("mongoose connection successful");
  } catch (err) {
    console.error("Mongoose failed to connect:", err);
    process.exit(1);
  }

  // Create the session store AFTER we know dbUrl is present (and mongoose connected).
  const store = MongoStore.create({
    mongoUrl: dbUrl,
    crypto: {
      secret: process.env.SECRET || "change-me"
    },
    collectionName: "sessions"
  });

  // Proper error handler signature
  store.on("error", (err) => {
    console.error("Mongo session store error:", err);
  });

  const sessionOptions = {
    store,
    secret: process.env.SECRET || "change-me",
    resave: false,
    saveUninitialized: false, // better practice
    cookie: {
      httpOnly: true,
      // expires must be a Date object
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  };

  // Middleware & view engine
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(methodOverride("_method"));
  app.engine("ejs", ejsMate);
  app.use(express.static(path.join(__dirname, "/public")));

  // Session & flash
  app.use(session(sessionOptions));
  app.use(flash());

  // Passport (must come after session())
  app.use(passport.initialize());
  app.use(passport.session());
  passport.use(new localStrategy(User.authenticate()));
  passport.serializeUser(User.serializeUser());
  passport.deserializeUser(User.deserializeUser());

  // Locals
  app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currentUser = req.user;
    next();
  });

  // Routers
  app.use("/listings", listingRouter);
  app.use("/listings/:id/reviews", reviewRouter);
  app.use("/", userRouter);

  // Central error handler (includes CastError handling)
  app.use((err, req, res, next) => {
    if (err && err.name === "CastError") {
      err = new ExpressError(400, "Invalid ID format!");
    }
    let { statusCode = 500, message = "Something went wrong" } = err || {};
    // guard: if headers already sent, delegate
    if (res.headersSent) {
      return next(err);
    }
    res.status(statusCode).render("error.ejs", { statusCode, message });
  });

  // Start server
  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`server is running on port ${port}`);
  });
}

start();
