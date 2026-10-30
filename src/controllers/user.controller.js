import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token "
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //  get user details from frontend
  // validation - not empty
  // check if user already exits : username , email
  //  check for images, check for avatar
  // upload them to cloudinary, avatar
  //  Create user oject - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  // return res

  const { fullName, email, username, password } = req.body;
  // console.log("email: ", email);

  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required ");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists ");
  }

  const avatarLoacalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLoacalPath) {
    throw new ApiError(400, "Avatar file is required ");
  }

  const avatar = await uploadOnCloudinary(avatarLoacalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required ");
  }

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user ");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully "));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  // 1. Ensure at least one identifier (username OR email) is provided
  if (!username && !email) {
    throw new ApiError(400, "Username or email is required");
  }

  // 2. Ensure password is provided
  if (!password) {
    throw new ApiError(400, "Password is required");
  }

  // 3. Dynamically build the search query based ONLY on provided fields
  const searchQuery = [];
  if (username) searchQuery.push({ username });
  if (email) searchQuery.push({ email });

  const user = await User.findOne({ $or: searchQuery });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  // 4. Strict Validation: If BOTH username and email were provided in req.body,
  // ensure BOTH match the database record (prevents logging in with an old/invalid username).
  if (username && email) {
    if (user.username !== username || user.email !== email) {
      throw new ApiError(401, "Invalid credentials or outdated username/email");
    }
  }

  // 5. Password check
  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  // 6. Generate tokens
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User looged out "));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request ");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token ");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or ussed ");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newrefreshToken } =
      await generateAccessAndRefreshToken(user._id);

    return res
      .status(200)
      .cookie("accesToken", accessToken, options)
      .cookie("refreshToken", newrefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newrefreshToken },
          "Access Token Refreshed "
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token ");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldpassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldpassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old Password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed Successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse (200, req.user , "Current user fetched successfully"));
});

const updateaccountDetails = asyncHandler(async (req, res) => {
  const {fullName, email, username} = req.body

  if(!fullName || !email  || !username) {
    throw new ApiError(400, "All fields are required ")
  }

  const user = User.findByIdAndUpdate(
   req.user?._id,
   {
    $set: {
      fullName, 
      email,
      username
    }
   } ,
   {new: true}
  ).select("-password")

  const userUpdated = await User.findById(req.user?._id);
userUpdated.fullName = fullName;
   userUpdated.email = email;
   userUpdated.username = username;

  await userUpdated.save({ validateBeforeSave: false }); 

  return res
  .status(200)
  .json(new ApiResponse(200, req.user, "Account details updated successfully "))
})

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateaccountDetails
};
