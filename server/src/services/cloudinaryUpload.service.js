const path = require('node:path');
const { randomUUID } = require('node:crypto');
const cloudinary = require('../config/cloudinary');
const ApiError = require('../utils/ApiError');
const { validateAttachmentFile } = require('../middleware/attachmentValidation');

const ATTACHMENT_FOLDER = 'supportflow/tickets';
const PROVIDER_TIMEOUT = 30000;

function uploadAttachmentBuffer({ buffer, originalName, mimeType }) {
  // Validate again at the provider boundary. Neither caller options nor the
  // display filename can select a folder, transformation or storage identity.
  const file = { buffer, originalname: originalName, mimetype: mimeType, size: buffer?.length };
  validateAttachmentFile(file);
  const extension = path.extname(file.originalname).slice(1).toLowerCase();
  const format = extension === 'jpeg' ? 'jpg' : extension;
  const resourceType = mimeType.startsWith('image/') ? 'image' : 'raw';
  const id = randomUUID();
  const assetName = `${id}${resourceType === 'raw' ? `.${format}` : ''}`;
  const publicId = `${ATTACHMENT_FOLDER}/${assetName}`;
  const options = {
    public_id: assetName,
    // Retain the existing folder API for fixed/dynamic mode compatibility.
    folder: ATTACHMENT_FOLDER,
    resource_type: resourceType,
    type: 'authenticated',
    allowed_formats: [format],
    use_filename: false,
    unique_filename: true,
    overwrite: false,
    filename: `${id}.${format}`,
    timeout: PROVIDER_TIMEOUT,
  };
  return new Promise((resolve, reject) => {
    const fail = () => reject(new ApiError(502, 'Attachment upload failed'));
    try {
      const stream = cloudinary.uploader.upload_stream(options, async (err, result) => {
        if (err) return fail();
        try {
          const secure = new URL(result?.secure_url);
          if (result.public_id !== publicId || result.resource_type !== resourceType ||
              result.type !== 'authenticated' || secure.protocol !== 'https:' ||
              secure.username || secure.password || secure.href.length > 1000) throw new Error('Unexpected asset metadata');
          resolve({ publicId, secureUrl: secure.href, resourceType,
            deliveryType: 'authenticated', bytes: buffer.length });
        } catch {
          // A successful provider response with unusable metadata must not leave
          // an untracked asset silently. Never delete an unrelated returned ID.
          try {
            const cleanup = await deleteCloudinaryAsset({ publicId, resourceType,
              deliveryType: result?.public_id === publicId && ['upload', 'private', 'authenticated'].includes(result.type)
                ? result.type : 'authenticated' });
            if (!['ok', 'not found'].includes(cleanup?.result)) throw new Error('Cleanup incomplete');
          } catch { console.error('Cloudinary invalid upload response cleanup failed'); }
          fail();
        }
      });
      stream.once('error', fail);
      stream.end(buffer);
    } catch { fail(); }
  });
}

async function deleteCloudinaryAsset({ publicId, resourceType, deliveryType = 'upload' }) {
  if (typeof publicId !== 'string' || !publicId ||
      !['image', 'raw', 'video'].includes(resourceType) ||
      !['upload', 'private', 'authenticated'].includes(deliveryType)) {
    throw new ApiError(502, 'Attachment asset cleanup failed');
  }
  try {
    return await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType, type: deliveryType, invalidate: true, timeout: PROVIDER_TIMEOUT,
    });
  } catch {
    // Log only the category, not provider messages, URLs or credentials.
    console.error('Cloudinary attachment deletion failed');
    throw new ApiError(502, 'Attachment asset cleanup failed');
  }
}

module.exports = { uploadAttachmentBuffer, deleteCloudinaryAsset };
