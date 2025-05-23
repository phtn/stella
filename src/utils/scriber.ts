import { STT_Service } from "@/services/stt";
import fs from "fs";

const buf = fs.readFileSync("test.raw");
const samples = new Int16Array(
  buf.buffer,
  buf.byteOffset,
  buf.byteLength / Int16Array.BYTES_PER_ELEMENT,
);
const stt = new STT_Service();
const transcript = await stt.transcribe(samples);
console.log(transcript);
