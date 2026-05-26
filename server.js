// ─────────────────────────────────────────────────────────────────────────
// Hinge Generator — image backend (OpenAI gpt-image-1)
//
// WHY THIS EXISTS: your OpenAI API key must NEVER live in the browser. This
// tiny server holds the key and is the only thing that talks to OpenAI. The
// web page sends a photo here; this server calls OpenAI and returns images.
//
// SETUP
//   1. Install Node 18+ (https://nodejs.org)
//   2. In this folder, run:   npm init -y && npm install express multer openai cors dotenv
//   3. Create a file named  .env  in this folder with one line:
//          OPENAI_API_KEY=sk-...your-NEW-key...
//      (Add ".env" to your .gitignore so it never gets committed or shared.)
//   4. Start it:              node server.js
//   5. Open http://localhost:8787 and use the "Enhance my photos" button.
//
// COST + POLICY (read before shipping):
//   • gpt-image-1 bills per image — generating several photos per user adds up.
//   • OpenAI restricts realistic images of real, identifiable people. Only let
//     users edit THEIR OWN photos with consent. The prompts below avoid
//     identity changes (no new faces) — they restyle clothing/background only.
//   • You may need to complete API "Organization Verification" in your OpenAI
//     dashboard before GPT Image models are enabled.
// ─────────────────────────────────────────────────────────────────────────

require("dotenv").config();   // loads OPENAI_API_KEY from a local .env file
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const OpenAI = require("openai");
const { toFile } = require("openai");

if (!process.env.OPENAI_API_KEY) {
  console.error("⚠  No OPENAI_API_KEY found. Locally: create a .env file with OPENAI_API_KEY=sk-... . On Render: add OPENAI_API_KEY in the service's Environment tab.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
app.use(cors());                 // allow the page to call this server
app.use(express.static("."));    // serve hinge-generator.html from this folder

const upload = multer({ limits: { fileSize: 12 * 1024 * 1024 } }); // 12MB

// Prompts that RESTYLE the photo without changing the person's identity.
// First entry = "nicer outfit" version of the original; the rest are varied
// settings/looks. Tweak these freely.
const EDIT_PROMPTS = [
  "Keep the same person, face, and pose exactly. Only upgrade the outfit to a stylish, well-fitted smart-casual look and clean up the background. Natural lighting, photorealistic, flattering.",
  "Same person and face, unchanged. Place them in a bright outdoor cafe setting, relaxed candid vibe, golden-hour light. Photorealistic.",
  "Same person and face, unchanged. Clean studio-style portrait with soft neutral background, warm friendly expression. Photorealistic.",
  "Same person and face, unchanged. Casual weekend look on a city street, soft daylight, natural candid framing. Photorealistic.",
  "Same person and face, unchanged. Outdoor nature/park background, easy-going outfit, late-afternoon light. Photorealistic.",
];

// POST /api/enhance  — multipart form with field "photo"
// Returns: { images: [ "data:image/png;base64,....", ... ] }
app.post("/api/enhance", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No photo uploaded." });
    const count = Math.min(parseInt(req.body.count || "5", 10), EDIT_PROMPTS.length);

    const file = await toFile(req.file.buffer, "upload.png", { type: req.file.mimetype || "image/png" });

    // Run the edits. (Sequential keeps it simple and avoids rate spikes.)
    const images = [];
    for (let i = 0; i < count; i++) {
      const result = await openai.images.edit({
        model: "gpt-image-1",            // swap to "gpt-image-1.5" / "gpt-image-2" if enabled
        image: file,
        prompt: EDIT_PROMPTS[i],
        size: "1024x1536",               // portrait, like a dating photo
        n: 1,
      });
      const b64 = result.data[0].b64_json;
      images.push("data:image/png;base64," + b64);
    }

    res.json({ images });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Image edit failed." });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Hinge image backend running on http://localhost:${PORT}`));
