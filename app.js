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
app.use(express.urlencoded({extended:true}));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

// middleware that can be registered now (not DB-dependent)
app.use((req, res, next) => {
    res.locals.success = req.flash ? req.flash("success") : undefined;
    res.locals.error = req.flash ? req.flash("error") : undefined;
    res.locals.currentUser = req.user;
    next();
});

// central startup function - wait for DB, then attach DB-dependent middleware & routes
async function start() {
    if (!dbUrl) {
        console.error("FATAL: ATLASDB_URL is not set in environment");
        process.exit(1);
    }
    // Masked print to verify env is present (no password leak)
    console.log("Using ATLASDB_URL (masked):", dbUrl.replace(/:[^:@]+@/, ":*****@"));

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
            // actual err variable available here now
            console.error("ERROR in Mongo SESSION STORE", err);
        });

        const sessionOptions = {
            store,
            secret : process.env.SECRET || 'this_should_be_changed',
            resave : false,
            saveUninitialized : false, // recommended
            cookie : {
                httpOnly : true,
                expires : Date.now() + 1000*60*60*24*7,
                maxAge : 1000*60*60*24*7
            }
        };

        app.use(session(sessionOptions));
        app.use(flash());

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

        // Error handler (keeps same logic)
        app.use((err, req, res, next) => {
            if (err && err.name === "CastError") {
                err = new ExpressError(400, "Invalid ID format!");
            }
            let {statusCode=500, message="Something went wrong"} = err || {};
            res.status(statusCode).render("error.ejs", {statusCode, message});
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
