const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const {isLoggedIn, isOwner, validateListing} = require("../middleware.js");
const listingController  = require("../controllers/listings.js");
const multer = require('multer');
const storage = require('../cloudConfig.js');
const upload = multer({ storage : storage.storage });


router
.route("/")
.get(wrapAsync(listingController.index))
.post(isLoggedIn, validateListing, upload.single("listing[image]"), wrapAsync(listingController.createListing));

router
.route("/new")
.get(isLoggedIn, listingController.renderNewForm );

router
.route("/:id")
.get(wrapAsync(listingController.showListing))
.put(isLoggedIn, isOwner, upload.single("listing[image]"), validateListing, wrapAsync(listingController.updateListing))
.delete(isLoggedIn, isOwner, wrapAsync(listingController.deleteListing))

router
.route("/:id/edit")
.get(isLoggedIn, isOwner, wrapAsync(listingController.editListing));

module.exports = router;