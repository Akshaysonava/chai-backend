import multer from "multer";

// Set up multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./public/temp")
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    }
})

// Export the multer middleware with the defined storage configuration
export const upload = multer({
    storage,
})