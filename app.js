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

main().then(() => console.log("connection successful")).catch(err => console.log(err));
async function main() {
    await mongoose.connect("mongodb://127.0.0.1:27017/WanderLust");
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({extended:true}));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

const store = MongoStore.create({
    mongoUrl: "mongodb://127.0.0.1:27017/WanderLust",
    crypto: {
        secret: process.env.SECRET 
    }
});

store.on("error", () => {
    console.log("ERROR in Mongo SESSION STORE",err);
});

const sessionOptions = {
    store,
    secret : process.env.SECRET,
    resave : false,
    saveUninitialized : true,
    cookie : {
        httpOnly : true,
        expires : Date.now() + 1000*60*60*24*7,
        maxAge : 1000*60*60*24*7
    }
};

app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


/*
app.get("/", (req, res) => {
    res.send("working well");
});
*/


app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currentUser = req.user;
    next();
});

/*
app.get("/demouser", async(req, res) => {
    let fakeUser = new User({
        email : "student@gmail.com",
        username : "delta-student"
    });
    let newUser = await User.register(fakeUser, "helloWorld");
    res.send(newUser);  
});
*/

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);


/*
// 404 route
app.all("/*", (req, res, next) => {
    next(new ExpressError(404, "Page Not Found!"));
});
*/

app.use((err, req, res, next) => {

    // If it's a Mongoose CastError (invalid ObjectId)
    if (err.name === "CastError") {
        err = new ExpressError(400, "Invalid ID format!");
    }

    let {statusCode=500, message="Something went wrong"} = err;
    res.status(statusCode).render("error.ejs", {statusCode, message});
});

app.listen(8080, () => {
    console.log("server is running on port 8080");
}); 
