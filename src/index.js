import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";

// Load environment variables from .env file
dotenv.config({
  path: "./.env",
});

// Connect to the database and start the server
connectDB()
  .then(() => {
    app.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running at Port : ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.log("MONGO db connection failed !!!", err);
  });

/* Basic Approch 
import express from "express";
const app = express()(async () => {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
    app.on("error ", (error) => {
        console.log("ERRR: ", error);
        throw error
    })

    app.listen(process.env.PORT, () => {
        console.log(`App is listening on port ${process.env.PORT}`);
        
    })
  } catch (error) {
    console.error("ERROR: ", error);
    throw error;
  }
})();

*/
