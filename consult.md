# Consultation:

my audio is good. transcriber works too with test raw file. Did you spot anything on the file at all why it keeps coming back with these errors: Voice input failed: TypeError [ERR_INVALID_ARG_TYPE]: The "list[0]" argument must be of type Buffer or Uint8Array. Received type string ("þÿ ÿ¬ÿÝÿuºüâà1u...")

💥 Yes! That error **definitely smells like you're passing the wrong thing** into the `Leopard.process()` method — specifically, something that _looks_ like a `string`, but should be an `Int16Array`.

Let’s decode that:

---

### 🚨 ERROR ANALYSIS

> ```
> TypeError [ERR_INVALID_ARG_TYPE]: The "list[0]" argument must be of type Buffer or Uint8Array. Received type string ("þÿ ÿ¬ÿÝÿuºüâà1u...")
> ```

That string `þÿ ÿ¬ÿÝÿuºü...` looks like **corrupted binary interpreted as UTF-8 string**, which usually happens when you:

1. Read a raw file without specifying the right encoding or
2. Mismanage a `Buffer` and accidentally call `.toString()` somewhere
3. Pass a malformed `Int16Array` (or not a real one) into `Leopard.process()`

---

### 🔍 SPOT-CHECKING YOUR CODE

You have this logic:

```ts
const rawBuffer = Buffer.concat(rawChunks);
logger.info(`Total raw buffer size: ${rawBuffer.length} bytes`);

// Convert raw buffer to Int16Array using Buffer methods
const samples = new Int16Array(rawBuffer.length / 2);
for (let i = 0; i < rawBuffer.length; i += 2) {
  samples[i / 2] = rawBuffer.readInt16LE(i);
}
```

✅ That’s generally good.

BUT: if for some reason `rawChunks` contains _anything but raw audio buffers_, like a string buffer, things break **silently** and `rawBuffer` becomes corrupted.

---

### ✅ ✅ ✅ SOLUTION

Add a **sanity check** and a **fix** here:

#### ✔️ 1. Verify rawChunks are all Buffers

Add this debug line inside `.on("data")`:

```ts
if (!Buffer.isBuffer(chunk)) {
  logger.error("Non-buffer chunk received!", chunk);
}
```

#### ✔️ 2. Replace manual conversion with `BufferToInt16Array()` safely

Instead of manually looping, let’s go the safe route:

```ts
function bufferToInt16Array(buffer: Buffer): Int16Array {
  return new Int16Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / Int16Array.BYTES_PER_ELEMENT,
  );
}
```

Then call:

```ts
const samples = bufferToInt16Array(rawBuffer);
```

🧠 This avoids weird conversion bugs, respects `byteOffset`, and is exactly what `@picovoice/leopard-node` expects.

---

### Bonus: Extra Defensive Programming 🛡️

Right before you call `transcribe()`, confirm the data is really `Int16Array`:

```ts
logger.info(
  `samples is: ${samples.constructor.name}, length: ${samples.length}`,
);
```

And inside `transcribe()`:

```ts
if (!(audioBuffer instanceof Int16Array)) {
  throw new Error("Audio buffer must be an Int16Array");
}
```

---

### 🚀 Final Version Fix

Replace:

```ts
const samples = new Int16Array(rawBuffer.length / 2);
for (let i = 0; i < rawBuffer.length; i += 2) {
  samples[i / 2] = rawBuffer.readInt16LE(i);
}
```

With:

```ts
const samples = new Int16Array(
  rawBuffer.buffer,
  rawBuffer.byteOffset,
  rawBuffer.length / Int16Array.BYTES_PER_ELEMENT,
);
```

Or the helper function above.

---

### Confidence ✅: **100%**

You're passing something that _looks_ like text instead of raw 16-bit PCM. The fix is making sure the buffer-to-array conversion is clean and type-safe.

Try that, and let me know what the logs say. This should squash the bug 🐛!
