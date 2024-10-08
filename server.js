const express = require("express");
const dotenv = require("dotenv");
const fs = require("fs");
const axios = require("axios");
const crypto = require("crypto");
const { oauth2Client, uploadVideo } = require("./googleUtil");
const path = require("path");

dotenv.config();

const app = express();
const port = process.env.PORT || 8888;

// Middleware to parse incoming JSON data
app.use(express.json());

// Replace with your Zoom JWT or OAuth token
const ZOOM_VERIFICATION_TOKEN = process.env.ZOOM_VERIFICATION_TOKEN; // Replace with your actual verification token
const ZOOM_SECRET_TOKEN = process.env.ZOOM_SECRET_TOKEN; // Replace with your actual secret token

// Webhook route
app.all("/zoom-webhook", async (req, res) => {
  // Step 1: Handle Zoom URL verification (GET request with verification token)
  console.log({ event: req.body.event });
  if (req.body?.event === "endpoint.url_validation") {
    const plainToken = req.body.payload.plainToken;
    const hashedToken = crypto
      .createHmac("sha256", ZOOM_SECRET_TOKEN)
      .update(plainToken)
      .digest("hex");
    return res.status(200).json({
      plainToken,
      encryptedToken: hashedToken,
    });
  }
  if (req.method === "GET" && req.query["verification_token"]) {
    console.log(
      "Zoom verification token received:",
      req.query["verification_token"]
    );
    if (req.query["verification_token"] === ZOOM_VERIFICATION_TOKEN) {
      return res.status(200).send(req.query["verification_token"]);
    } else {
      return res.status(400).send("Invalid verification token");
    }
  }

  // Step 2: Handle incoming POST event notifications
  if (req.method === "POST") {
    // Step 2.1: Verify the secret token
    const receivedVerificationToken = req.headers["authorization"];

    if (!receivedVerificationToken || receivedVerificationToken !== ZOOM_VERIFICATION_TOKEN) {
      console.log("Invalid secret token")
      return res.status(403).send("Invalid secret token");
    }

    // Step 2.2: Process the event
    try {
      const {payload, event, download_token } = req.body;
      // Confirming the event type (e.g., "All Recordings have completed")
      if (event === "recording.completed") {
        const recordingFiles = payload?.object?.recording_files;
        // Download each recording file (adjust as needed)
        for (const file of recordingFiles) {
          try{
            console.log('file_type:', file.file_type);
            if (file.file_type === "MP4") {
              const filePath = path.join(__dirname, 'downloads', `${payload?.object?.id}-${file.id}.mp4`);
              console.log(file)
              await downloadRecording(
                file.download_url,
                filePath,
                download_token
              );
              await uploadVideo(filePath);
            }
          } catch(err){
            console.log(err);
          }
        }
      }

      res.status(200).send("Webhook received");
    } catch (error) {
        console.error("Error processing Zoom webhook:", error);
        res.status(500).send(error);
    }
    //  finally {
    //     fs.rmSync(filePath);
    //     console.log(`File on path "${filePath}" deleted successfully`);
    // }
  }
});

// Function to download the recording file
async function downloadRecording(url, filePath, token) {
  const downloadUrl = `${url}?access_token=${token}`;
  console.log({ url, filePath, token });

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Create a write stream for saving the video file locally
  const writer = fs.createWriteStream(filePath);

  const response = await axios({
    url: downloadUrl,
    method: "GET",
    responseType: "stream",
  });

  // Pipe the video stream to the file system
  response.data.pipe(writer);

  // Return a promise that resolves when the download completes
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        // Step 1: Generate and provide the authorization URL
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                "https://www.googleapis.com/auth/youtube.upload",
                "https://www.googleapis.com/auth/youtube.download",
                "https://www.googleapis.com/auth/youtube.force-ssl"
            ],
        });

        console.log('Authorize this app by visiting this url:', authUrl);
        return res.redirect(authUrl);
    }

    // Step 2: Exchange the code for tokens
    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('access_token:', tokens.access_token);
        console.log('refresh_token:', tokens.refresh_token);
        process.env.GOOGLE_REFRESH_TOKEN = tokens?.refresh_token || null;
        res.send('Authorization successful! Check your console for the tokens.');
    } catch (error) {
        console.error('Error retrieving tokens:', error);
        res.status(500).send('Error retrieving tokens');
    }
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
