import * as msgpack from "@msgpack/msgpack";
import WebSocket from 'ws'; // Import WebSocket library

interface ModelListParams {
  page_size?: number;
  page_number?: number;
  title?: string;
  tag?: string[] | string;
  self?: boolean;
  author_id?: string;
  language?: string[] | string;
  title_language?: string[] | string;
  sort_by?: string;
}

interface ModelResponse {
  total: number;
  items: Array<{
    _id: string;
    type: string;
    title: string;
    description: string;
    cover_image: string;
    train_mode: string;
    state: string;
    tags: string[];
    samples: any[];
    created_at: string;
    updated_at: string;
    languages: string[];
    visibility: string;
    lock_visibility: boolean;
    like_count: number;
    mark_count: number;
    shared_count: number;
    task_count: number;
    unliked: boolean;
    liked: boolean;
    marked: boolean;
    author: {
      _id: string;
      nickname: string;
      avatar: string;
    };
  }>;
}

const key = process.env.FISH_AUDIO_API_KEY;
const reference_id = process.env.REFERENCE_ID;
const model = "speech-1.6";
const WS_URL = 'wss://api.fish.audio/v1/tts/live';

export class FishVoiceService {
  async getModels(params?: ModelListParams): Promise<ModelResponse> {
    const url = `https://api.fish.audio/model`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      throw new Error(`[GET]:FishAudio API error: ${response.statusText}`);
    }

    const models = (await response.json()) as ModelResponse;
    return models;
  }

  // Add a new method for generating speech via HTTP POST
  async generateSpeech(text: string): Promise<Buffer> {
    const url = `https:///api.fish.audio/v1/tts`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/msgpack",
        model: "speech-1.5", // optional
      },
      body: msgpack.encode({
        reference_id,
        text,
        temperature: 0.3, // optional, controls randomness
        top_p: 0.2, // optional, controls diversity
      }),
    });

    if (!response.ok) {
      throw new Error(`Fish Audio API error: ${response.statusText}`);
    }

    const audioData = await response.arrayBuffer();
    return Buffer.from(audioData);
  }

  // New method for streaming text to speech
  streamSpeech(textStream: AsyncIterable<string>): AsyncIterable<Buffer> {
    return (async function*() {
      const ws = new WebSocket(WS_URL, {
        headers: { 'Authorization': `Bearer ${key}` }
      });

      // Handle WebSocket open event
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          console.log('Fish Audio WebSocket connected.');
          resolve();
        });
        ws.on('error', (error: any) => {
          console.error('Fish Audio WebSocket error:', error);
          reject(error);
        });
         // Handle WebSocket close event
        ws.on('close', (code: number, reason: string) => {
           console.log(`Fish Audio WebSocket closed with code ${code} and reason: ${reason}`);
           if (code !== 1000 && ws.readyState !== WebSocket.CLOSED) {
              // Consider rejecting the promise if it's an unexpected close
           }
        });
      });

      // Send start event
      const startMessage = msgpack.encode({
        event: 'start',
        request: {
          text: '',
          latency: 'normal',
          format: 'mp3', // Request mp3 format
          reference_id: reference_id,
          // Add other parameters if needed (temperature, top_p, etc.)
        }
      });
      ws.send(startMessage);

      // Process incoming messages and queue audio
      const audioQueue: Buffer[] = [];
      let streamingFinished = false;

      ws.on('message', (data: Buffer) => {
        try {
          const message = msgpack.decode(data) as any;
          console.log('Received WebSocket message event:', message.event);
          if (message.event === 'audio') {
            console.log('Received audio chunk. Size:', message.audio?.length);
            // Optionally log a snippet of the audio data to see its format
            // console.log('Audio data snippet:', message.audio?.slice(0, 20)); // Log first 20 bytes
            audioQueue.push(Buffer.from(message.audio));
          } else if (message.event === 'log') {
            console.log('Fish Audio log:', message.message);
          } else if (message.event === 'finish') {
            console.log('Fish Audio finished streaming.');
            streamingFinished = true;
            ws.close(); // Close WebSocket when finished
          } else if (message.event === 'error') {
             console.error('Fish Audio error event:', message);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      });

      // Send text chunks from the input stream
      (async () => {
        try {
          for await (const text of textStream) {
            if (text) {
              const textMessage = msgpack.encode({ event: 'text', text: text });
              ws.send(textMessage);
            }
          }
          // Send stop event when text stream is done
          const stopMessage = msgpack.encode({ event: 'stop' });
          ws.send(stopMessage);
        } catch (error) {
          console.error('Error sending text to WebSocket:', error);
        }
      })();

      // Yield audio chunks as they become available
      while (true) {
        if (audioQueue.length > 0) {
          yield audioQueue.shift()!;
        } else if (streamingFinished && audioQueue.length === 0) {
           // Streaming finished and queue is empty, exit loop
           break;
        } else if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          // WebSocket is open or connecting, but no audio yet. Wait.
          await new Promise(resolve => setTimeout(resolve, 10));
        } else {
          // WebSocket is not open or connecting, and no audio available. It might be closing, closed, or errored.
          // Since streamingFinished flag handles clean exit, any other state here implies an issue.
           console.error('WebSocket not open/connecting, and streaming not finished. Exiting audio stream.', ws.readyState);
           break;
        }
      }

       // Clean up WebSocket if it's still open (should be closed by finish event)
       if(ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
           ws.close();
       }

    })();
  }
}
