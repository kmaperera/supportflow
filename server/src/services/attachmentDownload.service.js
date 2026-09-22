const path = require('node:path');
const cloudinary = require('../config/cloudinary');
const ApiError = require('../utils/ApiError');
const { MAX_ATTACHMENT_SIZE } = require('../constants/attachmentTypes');

// Called only after ticket and attachment authorization. Signed URLs stay server-side.
async function fetchAttachment(attachment) {
  const options = { signal: AbortSignal.timeout(30000), redirect: 'error' };
  let response;
  try {
    if (!attachment.fileUrl) throw new Error('Missing stored URL');
    response = await fetch(attachment.fileUrl, options);
    if ([401, 403].includes(response.status) && attachment.publicId &&
        ['image', 'raw', 'video'].includes(attachment.resourceType)) {
      await response.body?.cancel();
      // Uploads use Cloudinary's default upload delivery type. Raw IDs include extensions.
      const format = attachment.resourceType === 'raw' ? undefined : path.extname(attachment.originalName).slice(1).toLowerCase();
      const url = cloudinary.utils.private_download_url(attachment.publicId, format, {
        resource_type: attachment.resourceType, type: 'upload',
        expires_at: Math.floor(Date.now() / 1000) + 60,
      });
      response = await fetch(url, options);
    }
    if (!response.ok) {
      const status = response.status;
      await response.body?.cancel();
      throw new ApiError(502, 'Attachment download failed', [{ code: 'ATTACHMENT_REMOTE_UNAVAILABLE', remoteStatus: status }]);
    }
    if (Number(response.headers.get('content-length')) > MAX_ATTACHMENT_SIZE) {
      await response.body?.cancel();
      throw new Error('Oversized attachment');
    }
    // Bound actual bytes too, even when upstream omits or misreports Content-Length.
    // Buffer within the existing 10 MB cap so upstream errors remain JSON responses.
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_ATTACHMENT_SIZE) throw new Error('Oversized attachment');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'Attachment download failed', [{ code: 'ATTACHMENT_TRANSFER_FAILED' }]);
  }
}

module.exports = { fetchAttachment };
