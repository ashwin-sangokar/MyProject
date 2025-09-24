const User = require("../models/user.js");

module.exports.signup = async(req, res, next) => {
    try {
        let {email, username, password} = req.body;
        const newUser = new User({email, username});
        const registeredUser = await User.register(newUser, password);
        await req.login(registeredUser, (err) => {
            if(err) return next(err);
            req.flash("success", "Welcome to WanderLust!");
            res.redirect("/listings");
        });
    } catch(e) {
        req.flash("error", e.message);
        res.redirect("/signup");
    }
};

module.exports.renderSignupForm = (req, res) => {
    res.render("users/signup.ejs");
};

module.exports.renderLoginForm = (req, res) => {
    res.render("users/login.ejs");
};

module.exports.login = async(req, res) => {
    req.flash("success", "Welcome back!");
    let redirectUrl = res.locals.redirectUrl || "/listings";
    res.redirect(redirectUrl); 
};

module.exports.logout = (req, res, next) => {
    req.logout((err) => {
        if(err) return next(err);       
        req.flash("success", "Goodbye!");
        res.redirect("/listings");
    });
};