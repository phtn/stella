// const key = process.env.ELEVENLABS_API_KEY;
// const voice_id = process.env.VOICE_ID;
// const model = "eleven_flash_v2_5";

// export class VoiceService {
//   // Add a new method for generating speech via HTTP POST
//   async generateSpeech(text: string): Promise<Buffer> {
//     const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`;
//     const response = await fetch(url, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "xi-api-key": `${key}`,
//       },
//       body: JSON.stringify({
//         text,
//         model_id: model,
//         voice_settings: {
//           // speed: 0.8,
//           speed: 0.85,
//           stability: 0.75,
//           similarity_boost: 0.95,
//         },
//       }),
//     });

//     if (!response.ok) {
//       throw new Error(`Eleven Labs API error: ${response.statusText}`);
//     }

//     const audioData = await response.arrayBuffer();
//     return Buffer.from(audioData);
//   }
// }
