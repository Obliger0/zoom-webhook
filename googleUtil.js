import { google } from "googleapis";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const youtube = google.youtube({
  version: "v3",
  auth: oauth2Client,
});

export const startResumableUploadSession = async (
  filePath,
  title,
  description
) => {
  const response = await youtube.videos.insert({
    part: ["snippet,status"],
    requestBody: {
      snippet: {
        title,
        description,
        tags: ["video", "upload"],
        categoryId: "22",
      },
      status: {
        privacyStatus: "unlisted",
      },
    },
    media: {
      body: fs.createReadStream(filePath),
    },
  });

  if (response && response.data) {
    fs.rmSync(filePath);
    console.log(`Video uploaded https://youtu.be/${response.data.id}
      & File on path "${filePath}" deleted successfully`);
    return response.data.id;
  }

  throw new Error("Failed to start upload session");
};

export const uploadVideo = async (filePath) => {
  const title = `Uploaded Video ${1}`;
  const description = `This video was uploaded using a resumable upload process.`;

  return await startResumableUploadSession(filePath, title, description);
};
