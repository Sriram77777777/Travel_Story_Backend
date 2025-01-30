require("dotenv").config();

const config = require("./config.json");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const upload = require("./multer");
const fs = require("fs");
const path = require("path");

const User = require("./models/user.model");
const TravelStory = require("./models/travelStory.model");

mongoose.connect(config.connectionString, {
   
})
    .then(() => console.log("MongoDB connected successfully!"))
    .catch((err) => {
        console.error("Error connecting to MongoDB:", err.message);
        process.exit(1); 
    });



const app = express();
app.use(express.json());
app.use(cors({origin:"*"}));
const{authenticateToken}=require("./utilities");

//Create Account
app.post("/create-account",async(req,res)=>{
    const{fullName,email,password} = req.body;
    if(!fullName || !email || !password){
        return res
        .status(400)
        .json({error: true,message: "All fields are required"});
    }
    const  isUser = await User.findOne({email});
    if(isUser){
        return res
        .status(400)
        .json({error:true,message:"User already exists"});
    }

    const hashedPassword = await bcrypt.hash(password,10);

    const user = new User({
        fullName,
        email,
        password: hashedPassword,
    });

    await user.save();

const accessToken = jwt.sign(
    {userId:user._id},
    process.env.ACCESS_TOKEN_SECRET,
    {
        expiresIn:"72h",
    }
);

    return res.status(201).json({
        error:false,
        user:{fullName:user.fullName,email:user.email},
        accessToken,
        message:"Registration Successful",
    });
});

//Log in
app.post("/login",async(req,res)=>{
    const{email,password } = req.body;

    if(!email || !password){
        return res.status(400).json({message: "Emil and Password are required"});
    }

    const user = await User.findOne({email});
    if(!user){
        return res.status(400).json({message:"User not found"});
    }

    const isPasswordValid = await bcrypt.compare(password,user.password);
    if(!isPasswordValid){
        return res.status(400).json({message:"Invalid Credentials"});
    }

    const accessToken = jwt.sign(
        {userId: user._id},
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn:"72h",
        }
    );

    return res.json({
        error:false,
        message:"Login Successful",
        user: {fullName: user.fullName,email:user.email},
        accessToken,
    });
});

//get User
app.get("/get-user",authenticateToken,async(req,res)=>{
    const{userId}=req.user
    const isUser = await User.findOne({_id:userId});

    if(!isUser){
        return res.sendStatus(401);
    }

    return res.json({
        user: isUser,
        message: "",
    });
});


// Route to handle image upload
app.post("/image-upload", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: true, message: "No image uploaded" });
      }
  
      const imageUrl = `http://localhost:8000/uploads/${req.file.filename}`;
  
      res.status(201).json({ imageUrl });
    } catch (error) {
      res.status(500).json({ error: true, message: error.message });
    }
  });


//Delete an image from uploads folder
app.delete("/delete-image",async (req,res)=>{
    const{imageUrl}=req.query;

    if(!imageUrl){
        return res
        .status(400)
        .json({error:true,message:"imageUrl parameter is required"});
    }
    try{
        //Ertact the file name from the image
        const fileName = path.basename(imageUrl);
        //Define file path
        const filePath = path.join(__dirname,'uploads',fileName);
        //Check if the file exits
        if(fs.existsSync(filePath)){
            //Delete the file from the uploads folder
            fs.unlinkSync(filePath);
            res.status(200).json({message:"Image deleted successfully"});
        }else{
            res.status(200).json({error:true,message:"Image deleted successfully"});
        }
    }catch(error){
        res.status(500).json({error:true,message:error.message});
    }
});

//Serve static files from the uploads and assets directory
app.use("/uploads",express.static(path.join(__dirname,"uploads")))
app.use("/assets",express.static(path.join(__dirname,"assets")))



app.post("/add-travel-story", authenticateToken, async (req, res) => {
    const { title, story, visitedLocation, imageUrl, visitedDate } = req.body; // Ensure field names match
    const { userId } = req.user;

    // Validate required fields
    if (!title || !story || !visitedLocation || !visitedDate) {
        return res.status(400).json({ error: true, message: "All fields are required except image URL." });
    }

    // Validate visitedDate
    if (isNaN(parseInt(visitedDate))) {
        return res.status(400).json({ error: true, message: "Invalid visited date format." });
    }
    const parsedVisitedDate = new Date(parseInt(visitedDate));

    try {
        const travelStory = new TravelStory({
            title,
            story,
            visitedLocation, // Ensure this matches the schema
            userId,
            imageUrl: imageUrl || "", // Handle optional imageUrl
            visitedDate: parsedVisitedDate,
        });

        console.log("Saving travel story:", travelStory); // Log the story object
        await travelStory.save();
        res.status(201).json({ story: travelStory, message: "Added Successfully" });
    } catch (error) {
        console.error("Error saving travel story:", error); // Log the error
        res.status(400).json({ error: true, message: error.message });
    }
});
  
//Get all travel story
app.get("/get-all-stories",authenticateToken,async(req,res)=>{
    const{userId} = req.user;

    try{
        const travelStories = await TravelStory.find(({userId:userId})).sort({
            isFavourite:-1,
        });
        res.status(200).json({stories:travelStories});
    }catch(error){
        res.status(500).json({error: true,message:error.message});
    }
});

//Edit Travel Story
app.put("/edit-story/:id",authenticateToken,async(req,res)=>{
    const {id} = req.params;
    const{title,story,visitedlocation,imageUrl,visitedDate} = req.body;
    const{userId} = req.user;

    //Validate require fields
    if(!title ||!story|| !visitedlocation || !imageUrl || !visitedDate){
        return res.status(400).json({error:true,message:"All fields are required"});
    }

    //Convert visited date from milliseconds to Date object
    const parsedVisitedDate = new Date(parseInt(visitedDate));

    try{
        //Find the travel Story by Id and ensure it belongs to the authenticated user
        const travelStory = await TravelStory.findOne({_id:id,userId:userId});

        if(!travelStory){
            return res.status(404).json({error:true,message:"Travel story not found"});
        }

        const placeholderImgUrl = `http://localhost:8000/assets/placeholder.webp`;

        travelStory.title = title;
        travelStory.story = story;
        travelStory.visitedLocation = visitedlocation;
        travelStory.imageUrl = imageUrl || placeholderImgUrl;
        travelStory.visitedDate = parsedVisitedDate;

        await travelStory.save();
        res.status(200).json({story:travelStory,message:'Update Successful'});
    }catch(error){
        res.status(500).json({error:true,message:error.message});
    }
});

//Delete a travel story
app.delete("/delete-story/:id",authenticateToken,async(req,res)=>{
    const{id} = req.params;
    const{userId} = req.user;

    try{
        //Find the travel Story by Id and ensure it belongs to the authenticated user
        const travelStory = await TravelStory.findOne({_id:id,userId:userId});

        if(!travelStory){
            return res
            .status(404)
            .json({error:true,message:"Travel story not found"});
        }

        //Delete the travel story from the data base
        await travelStory.deleteOne({_id:id,userId:userId});

        //Extract the filename from the imageUrl
        const imageUrl = travelStory.imageUrl;
        const filename = path.basename(imageUrl);

        //Define the file path
        const filePath=path.join(__dirname,'uploads',filename);

        //Delete the image file from the uploader folder
        fs.unlink(filePath,(err)=>{
            if(err){
                console.error("Failed to delete image file:",err);
                //Optionally, you could still respond with a success status here
                //if you dont want to think it as a critical error  
            }
        });
        res.status(200).json({message:"Travel story deleted successfully"});
    }catch(error){
        res.status(500).json({error:true,message:error.message});
    }

});

// Search travel stories
app.get("/search", authenticateToken, async (req, res) => {
    const { query } = req.query;
    const { userId } = req.user;

    if (!query) {
        return res.status(404).json({ error: true, message: "query is required" });
    }

    try {
        const searchResults = await TravelStory.find({
            userId: userId,
            $or: [
                { title: { $regex: query, $options: "i" } },
                { story: { $regex: query, $options: "i" } },
                { visitedLocation: { $regex: query, $options: "i" } },
            ],
        }).sort({ isFavourite: -1 });

        res.status(200).json({ stories: searchResults });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});
  
const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app;