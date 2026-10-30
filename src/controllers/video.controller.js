import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose, { isValidObjectId } from "mongoose";

export const getAllVideos = async (req, res) => {
  try {
    const { page = 1, limit = 10, query, sortBy = "createdAt", sortType = "desc", userId } = req.query;

    const matchConditions = {};

    // Search by title or description keyword
    if (query) {
      matchConditions.$or = [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
      ];
    }

    // Filter by specific user/owner
    if (userId) {
      if (!isValidObjectId(userId)) {
        return res.status(400).json({ message: "Invalid User ID format" });
      }
      matchConditions.owner = new mongoose.Types.ObjectId(userId);
    }

    const aggregate = Video.aggregate([
      { $match: matchConditions },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "owner",
          pipeline: [
            {
              $project: {
                username: 1,
                fullName: 1,
                avatar: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          owner: { $first: "$owner" },
        },
      },
      {
        $sort: {
          [sortBy]: sortType === "asc" ? 1 : -1,
        },
      },
    ]);

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };

    const result = await Video.aggregatePaginate(aggregate, options);

    return res.status(200).json({
      success: true,
      data: result,
      message: "Videos fetched successfully",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const publishAVideo = async (req, res) => {
  try {
    const { title, description, duration } = req.body;

    if ([title, description].some((field) => !field?.trim())) {
      return res.status(400).json({ message: "All fields are required" });
    }

      const existedUser = await Video.findOne({
        $or: [{ title }, { description }],
      });
    
      if (existedUser) {
        throw new ApiError(409, "Video with same title and description has already exists ");
      }

        const videoFileLocalPath = req.files?.videoFile[0]?.path;
        const thumbnailLocalPath = req.files?.thumbnail[0]?.path;

         if (!videoFileLocalPath) {
    throw new ApiError(400, "video file is required ");
  }

   const videoFile = await uploadOnCloudinary(videoFileLocalPath);
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath);

    const video = await Video.create({
      videoFile,
      thumbnail,
      title,
      description,
      duration: Number(duration),
      owner: req.user?._id
    });

    return res.status(201).json({
      success: true,
      data: video,
      message: "Video published successfully",
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};