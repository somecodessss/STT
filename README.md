# German STT Relay for Roblox (Speechmatics)

1) Create a new Web Service on Render from this repo.
2) Set Environment Variables:
   - AUTH_TOKEN=<generate a random token>
   - SPEECHMATICS_API_KEY=jckE7SpZNhRzmYbh7e0qYihYOZqRVFm9
3) Choose Docker deployment. Expose port 3000.
4) Deploy.

Endpoints (Authorization header: Bearer AUTH_TOKEN):

POST /ingest
Body JSON:
{
  "userId": "123456",
  "audio": "<base64 audio>",
  "contentType": "audio/wav",
  "language": "de"
}
Response: { "ok": true, "jobId": "...", "text": "..." }

GET /pull?userId=123456
Response: { "items": [ { "text": "...", "lang": "de", "ts": 1730750000 } ] }

Roblox:
Set EXTERNAL_FETCH_URL to https://<your-render-app>.onrender.com/pull
Set EXTERNAL_AUTH to "Bearer " .. AUTH_TOKEN
Enable “Allow HTTP Requests”.
