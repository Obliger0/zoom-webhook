import express from 'express';
import dotenv  from 'dotenv';
import fs from 'fs';
import axios from 'axios';

dotenv.config();

const app = express();
const port = process.env.PORT || 8888;


// Middleware to parse incoming JSON data
app.use(express.json());

// Replace with your Zoom JWT or OAuth token
const ZOOM_VERIFICATION_TOKEN = process.env.ZOOM_VERIFICATION_TOKEN;  // Replace with your actual verification token
const ZOOM_SECRET_TOKEN = process.env.ZOOM_SECRET_TOKEN;        // Replace with your actual secret token
console.log({ZOOM_VERIFICATION_TOKEN, ZOOM_SECRET_TOKEN})

// Webhook route
app.all('/zoom-webhook', async (req, res) => {
  // Step 1: Handle Zoom URL verification (GET request with verification token)
  const { body, query, params, method } = req;
  console.log({ body, query, params, method });
  if (req.method === 'GET' && req.query['verification_token']) {
    console.log('Zoom verification token received:', req.query['verification_token']);
    if (req.query['verification_token'] === ZOOM_VERIFICATION_TOKEN) {
      return res.status(200).send(req.query['verification_token']);
    } else {
      return res.status(400).send('Invalid verification token');
    }
  }

  // Step 2: Handle incoming POST event notifications
  if (req.method === 'POST') {
    // Step 2.1: Verify the secret token
    const receivedSecretToken = req.headers['authorization'];
    console.log({receivedSecretToken});
    
    if (!receivedSecretToken || receivedSecretToken !== `Bearer ${ZOOM_SECRET_TOKEN}`) {
      return res.status(403).send('Invalid secret token');
    }

    // Step 2.2: Process the event
    try {
      const payload = req.body;
      console.log({...payload})
      // Confirming the event type (e.g., "All Recordings have completed")
      if (payload.event === 'recording.completed') {
        const recordingFiles = payload.payload.recording_files;

        // Download each recording file (adjust as needed)
        for (const file of recordingFiles) {
          if (file.file_type === 'MP4') {
            await downloadRecording(file.download_url, payload.payload.meeting_id, file.id);
          }
        }
      }

      res.status(200).send('Webhook received');
    } catch (error) {
      console.error('Error processing Zoom webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  }
});

// Function to download the recording file
async function downloadRecording(url, meetingId, fileId) {
  // const downloadUrl = `${url}?access_token=${ZOOM_JWT_TOKEN}`;
  
  // Create a write stream for saving the video file locally
  const path = `./downloads/${meetingId}-${fileId}.mp4`;
  const writer = fs.createWriteStream(path);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  // Pipe the video stream to the file system
  response.data.pipe(writer);

  // Return a promise that resolves when the download completes
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});