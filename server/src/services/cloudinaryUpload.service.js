const cloudinary = require("../config/cloudinary");
const ApiError = require("../utils/ApiError");

function uploadAttachmentBuffer({ buffer, folder, originalName, mimeType }) {
  // Filename and MIME metadata never determine the asset path or resource type.
  return new Promise((resolve, reject) => {
    const fail = () => reject(new ApiError(502, "Attachment upload failed"));
    try {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "auto", use_filename: false, unique_filename: true },
        (err, result) => {
          if (err || !result?.public_id || !result?.secure_url || !result?.resource_type) {
            return fail();
          }
          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            resourceType: result.resource_type,
            bytes: result.bytes,
          });
        }
      );
      stream.once("error", fail);
      stream.end(buffer);
    } catch {
      fail();
    }
  });
}

async function deleteCloudinaryAsset({ publicId, resourceType }) {
  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch {
    throw new ApiError(502, "Attachment asset cleanup failed");
  }
}

module.exports = { uploadAttachmentBuffer, deleteCloudinaryAsset };
