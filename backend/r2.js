const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_URL_BASE;


const R2_IS_CONFIGURED = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_BASE_URL;

if (!R2_IS_CONFIGURED) {
    console.warn("One or more Cloudflare R2 environment variables are not correctly set. File uploads to R2 will fail. Ensure R2_PUBLIC_URL_BASE is also set.");
}

let s3Client;
if (R2_IS_CONFIGURED) {
    s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });
}

async function uploadFileToR2(fileBuffer, originalFileName, mimeType) {
    if (!R2_IS_CONFIGURED || !s3Client) throw new Error("R2 service is not configured.");

    const fileExtension = originalFileName.includes('.') ? originalFileName.substring(originalFileName.lastIndexOf('.')) : '';
    const uniqueKey = `${uuidv4()}${fileExtension}`;

    const params = {
        Bucket: R2_BUCKET_NAME,
        Key: uniqueKey,
        Body: fileBuffer,
        ContentType: mimeType,
    };

    try {
        await s3Client.send(new PutObjectCommand(params));
        const fileUrl = `${R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${uniqueKey}`;
        return { key: uniqueKey, url: fileUrl, originalName: originalFileName, mimeType, size: fileBuffer.length };
    } catch (error) {
        console.error("Error uploading to R2:", error);
        throw error;
    }
}

async function deleteFileFromR2(key) {
    if (!R2_IS_CONFIGURED || !s3Client || !key) return;

    const params = {
        Bucket: R2_BUCKET_NAME,
        Key: key,
    };
    try {
        await s3Client.send(new DeleteObjectCommand(params));
    } catch (error) {
        console.error(`Error deleting ${key} from R2:`, error);
    }
}

module.exports = { uploadFileToR2, deleteFileFromR2, R2_IS_CONFIGURED };