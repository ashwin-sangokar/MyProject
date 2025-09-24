const mongoose = require("mongoose");
const initData = require("./data.js");
const Listing = require("../models/listing.js");

main().then(() => console.log("connection successful")).catch(err => console.log(err));
async function main() {
    await mongoose.connect("mongodb://127.0.0.1:27017/WanderLust");
}

const initDB = async() => {
    await Listing.deleteMany({});
    initData.data = initData.data.map((obj) => ({...obj, owner : "68cc1e404504c38b22fef3ea"})); // Assign a default owner ID to each listing
    await Listing.insertMany(initData.data);
    console.log("Data was initialized");
}

initDB();